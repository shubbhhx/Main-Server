import os
import re
import shutil
import subprocess
import tempfile
import time


class CodeRunnerService:
    def __init__(self, base_temp_dir):
        self.base_temp_dir = base_temp_dir
        os.makedirs(self.base_temp_dir, exist_ok=True)
        self.timeout_seconds = 5
        self.max_code_chars = 30000
        self.max_output_chars = 20000

        self.blocked_code_patterns = [
            r'\bos\.system\s*\(',
            r'\bsubprocess\.',
            r'\beval\s*\(',
            r'\bexec\s*\(',
            r'__import__\s*\(',
            r'\bfork\s*\(',
            r'\bpopen\s*\(',
            r'\brm\s+-rf\s+/',
            r'\bmkfs\b',
        ]
        self.blocked_shell_tokens = {
            'rm',
            'shutdown',
            'reboot',
            'mkfs',
            'dd',
            ':(){',
            'killall',
            'poweroff',
        }

    def _sanitize_output(self, text):
        raw = text or ''
        if len(raw) <= self.max_output_chars:
            return raw
        return raw[: self.max_output_chars] + '\n...[truncated]'

    def _is_code_safe(self, code):
        for pattern in self.blocked_code_patterns:
            if re.search(pattern, code or '', flags=re.IGNORECASE):
                return False
        return True

    def _safe_env(self):
        env = {'PATH': os.environ.get('PATH', '')}
        return env

    def _run_subprocess(self, cmd, cwd):
        started = time.time()
        proc = subprocess.run(
            cmd,
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=self.timeout_seconds,
            env=self._safe_env(),
        )
        elapsed = round((time.time() - started) * 1000, 2)
        return {
            'success': proc.returncode == 0,
            'exitCode': proc.returncode,
            'stdout': self._sanitize_output(proc.stdout),
            'stderr': self._sanitize_output(proc.stderr),
            'durationMs': elapsed,
        }

    def _write_file(self, folder, file_name, content):
        full = os.path.join(folder, file_name)
        with open(full, 'w', encoding='utf-8') as f:
            f.write(content)
        return full

    def _is_shell_command_safe(self, command):
        text = (command or '').strip().lower()
        if not text:
            return False
        if any(token in text for token in ['&&', '||', ';', '|', '>']):
            return False
        parts = text.split()
        if not parts:
            return False
        if parts[0] in self.blocked_shell_tokens:
            return False
        return True

    def run(self, language, code):
        lang = (language or '').strip().lower()
        src = code or ''

        if not src.strip():
            return {'success': False, 'error': 'code is required'}
        if len(src) > self.max_code_chars:
            return {'success': False, 'error': f'Code too large (max {self.max_code_chars} chars)'}

        if lang not in {'python', 'c', 'cpp', 'java', 'javascript', 'html', 'css'}:
            return {'success': False, 'error': 'Unsupported language'}

        if lang not in {'html', 'css'} and not self._is_code_safe(src):
            return {'success': False, 'error': 'Unsafe code blocked by policy'}

        run_dir = tempfile.mkdtemp(prefix='toxibh_run_', dir=self.base_temp_dir)
        try:
            if lang == 'python':
                file_path = self._write_file(run_dir, 'main.py', src)
                return self._run_subprocess(['python', file_path], run_dir)

            if lang == 'c':
                src_path = self._write_file(run_dir, 'main.c', src)
                bin_path = os.path.join(run_dir, 'a.out')
                compile_result = self._run_subprocess(['gcc', src_path, '-O2', '-o', bin_path], run_dir)
                if not compile_result.get('success'):
                    return compile_result
                return self._run_subprocess([bin_path], run_dir)

            if lang == 'cpp':
                src_path = self._write_file(run_dir, 'main.cpp', src)
                bin_path = os.path.join(run_dir, 'a.out')
                compile_result = self._run_subprocess(['g++', src_path, '-O2', '-o', bin_path], run_dir)
                if not compile_result.get('success'):
                    return compile_result
                return self._run_subprocess([bin_path], run_dir)

            if lang == 'java':
                src_path = self._write_file(run_dir, 'Main.java', src)
                compile_result = self._run_subprocess(['javac', src_path], run_dir)
                if not compile_result.get('success'):
                    return compile_result
                return self._run_subprocess(['java', '-cp', run_dir, 'Main'], run_dir)

            if lang == 'javascript':
                src_path = self._write_file(run_dir, 'main.js', src)
                return self._run_subprocess(['node', src_path], run_dir)

            if lang == 'html':
                html_path = self._write_file(run_dir, 'index.html', src)
                return {
                    'success': True,
                    'exitCode': 0,
                    'stdout': '',
                    'stderr': '',
                    'htmlPreviewPath': html_path,
                    'htmlPreviewContent': src,
                    'durationMs': 0,
                }

            css_preview = f'<!doctype html><html><head><meta charset="utf-8"><style>{src}</style></head><body><div class="preview-stage"><div class="preview-card">TOXIBH OS CSS Preview</div></div></body></html>'
            css_path = self._write_file(run_dir, 'index.html', css_preview)
            return {
                'success': True,
                'exitCode': 0,
                'stdout': '',
                'stderr': '',
                'htmlPreviewPath': css_path,
                'htmlPreviewContent': css_preview,
                'durationMs': 0,
            }
        except subprocess.TimeoutExpired:
            return {'success': False, 'error': f'Execution timed out ({self.timeout_seconds}s limit)'}
        except FileNotFoundError as ex:
            missing = str(ex)
            return {'success': False, 'error': f'Required runtime not found: {missing}'}
        except Exception as ex:
            return {'success': False, 'error': f'Execution failed: {str(ex)}'}
        finally:
            shutil.rmtree(run_dir, ignore_errors=True)

    def validate_terminal_command(self, command):
        if not self._is_shell_command_safe(command):
            return False, 'Blocked command. Use simple, safe commands only.'
        return True, ''
