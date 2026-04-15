import os
import pty
import select
import subprocess


class TerminalSession:
    def __init__(self, user_id, shell='/bin/bash'):
        self.user_id = user_id
        self.shell = shell
        self.master_fd = None
        self.slave_fd = None
        self.process = None

    def start(self):
        if self.process is not None:
            return

        shell_candidates = [self.shell, '/bin/bash', '/bin/sh', 'sh']
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
                return
            except Exception as ex:
                last_error = ex

        raise RuntimeError(f'Unable to launch shell: {last_error}')

    def read_ready(self):
        if self.master_fd is None:
            return b''
        ready, _, _ = select.select([self.master_fd], [], [], 0)
        if not ready:
            return b''
        try:
            return os.read(self.master_fd, 8192)
        except OSError:
            return b''

    def write(self, text):
        if self.master_fd is None:
            return
        try:
            os.write(self.master_fd, text.encode('utf-8', errors='ignore'))
        except OSError:
            pass

    def stop(self):
        try:
            if self.process is not None and self.process.poll() is None:
                self.process.terminate()
        except Exception:
            pass
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
