import os
import subprocess
import sys
import threading
from queue import Queue, Empty

# PTY support is Unix-only
try:
    import pty
    import select
    HAS_PTY = True
except ImportError:
    HAS_PTY = False


class TerminalSession:
    def __init__(self, user_id, shell=None):
        self.user_id = user_id
        self.shell = shell
        self.master_fd = None
        self.slave_fd = None
        self.process = None
        self.output_queue = Queue()
        self.read_thread = None
        self.is_running = False

    def start(self):
        if self.process is not None:
            return

        if HAS_PTY and sys.platform != 'win32':
            self._start_unix()
        else:
            self._start_windows()

    def _start_unix(self):
        """Unix/Linux PTY-based terminal session"""
        shell_candidates = [self.shell or '/bin/bash', '/bin/bash', '/bin/sh', 'sh']
        self.master_fd, self.slave_fd = pty.openpty()
        env = os.environ.copy()
        env['TERM'] = 'xterm-256color'
        last_error = None
        for shell in shell_candidates:
            try:
                self.process = subprocess.Popen(
                    [shell],
                    stdin=self.slave_fd,
                    stdout=self.slave_fd,
                    stderr=self.slave_fd,
                    env=env,
                    text=False,
                    close_fds=True,
                )
                self.shell = shell
                self.is_running = True
                self.read_thread = threading.Thread(target=self._read_unix_loop, daemon=True)
                self.read_thread.start()
                return
            except Exception as ex:
                last_error = ex

        raise RuntimeError(f'Unable to launch shell: {last_error}')

    def _start_windows(self):
        """Windows subprocess-based terminal session"""
        shell_candidates = [self.shell or 'cmd.exe', 'cmd.exe', 'powershell.exe']
        env = os.environ.copy()
        last_error = None
        for shell in shell_candidates:
            try:
                self.process = subprocess.Popen(
                    shell,
                    stdin=subprocess.PIPE,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    env=env,
                    text=False,
                    bufsize=0,
                )
                self.shell = shell
                self.is_running = True
                self.read_thread = threading.Thread(target=self._read_windows_loop, daemon=True)
                self.read_thread.start()
                return
            except Exception as ex:
                last_error = ex

        raise RuntimeError(f'Unable to launch shell: {last_error}')

    def _read_unix_loop(self):
        """Background thread for Unix PTY reading"""
        while self.is_running and self.master_fd is not None:
            try:
                ready, _, _ = select.select([self.master_fd], [], [], 0.1)
                if ready:
                    data = os.read(self.master_fd, 8192)
                    if data:
                        self.output_queue.put(data)
                    else:
                        break
            except OSError:
                break

    def _read_windows_loop(self):
        """Background thread for Windows subprocess reading"""
        while self.is_running and self.process and self.process.stdout:
            try:
                data = self.process.stdout.read(8192)
                if data:
                    self.output_queue.put(data)
                else:
                    break
            except Exception:
                break

    def read_ready(self):
        """Read any available output from the terminal"""
        result = b''
        try:
            while True:
                result += self.output_queue.get_nowait()
        except Empty:
            pass
        return result

    def write(self, text):
        """Write text to the terminal"""
        if self.process is None:
            return
        try:
            data = text.encode('utf-8', errors='ignore')
            if self.process.stdin:
                self.process.stdin.write(data)
                self.process.stdin.flush()
        except Exception:
            pass

    def stop(self):
        """Stop the terminal session"""
        self.is_running = False
        try:
            if self.process is not None and self.process.poll() is None:
                if self.process.stdin:
                    self.process.stdin.close()
                self.process.terminate()
                try:
                    self.process.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    self.process.kill()
        except Exception:
            pass
        
        if HAS_PTY and self.master_fd is not None:
            for fd_name in ('master_fd', 'slave_fd'):
                fd = getattr(self, fd_name)
                if fd is not None:
                    try:
                        os.close(fd)
                    except OSError:
                        pass
                    setattr(self, fd_name, None)
        
        self.process = None


class TerminalSessionManager:
    def __init__(self):
        self.sessions = {}

    def get_or_create(self, session_id, shell='/bin/bash'):
        if session_id in self.sessions:
            return self.sessions[session_id]
        sess = TerminalSession(session_id, shell=shell)
        sess.start()
        self.sessions[session_id] = sess
        return sess

    def close(self, session_id):
        sess = self.sessions.pop(session_id, None)
        if sess:
            sess.stop()

    def cleanup(self):
        for sid in list(self.sessions.keys()):
            self.close(sid)
