"""Owned child trees and PID creation identity, never blind PID termination."""
import os
import signal
import subprocess


class OwnedProcess:
    def __init__(self, argv, **kwargs):
        self.job = None
        if os.name == 'nt':
            from .windows_job import Job
            self.job = Job()
            kwargs['creationflags'] = subprocess.CREATE_NO_WINDOW | 0x00000004
        else:
            kwargs['start_new_session'] = True
        try:
            self.process = subprocess.Popen(argv, **kwargs)
            if self.job:
                self.job.attach_and_resume(self.process)
        except BaseException:
            if hasattr(self, 'process'):
                self.process.kill()
                self.process.wait()
            self.close()
            raise

    @property
    def pid(self):
        return self.process.pid

    def stop(self):
        if self.job:
            self.job.terminate()
        else:
            try:
                os.killpg(self.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
        self.process.wait()

    def close(self):
        if self.job:
            self.job.close()
            self.job = None


def process_identity(pid):
    """Creation timestamp identifies the process even when its PID is reused."""
    if not pid:
        return None
    if os.name == 'nt':
        import ctypes as c
        from ctypes import wintypes as w
        kernel = c.WinDLL('kernel32', use_last_error=True)
        kernel.OpenProcess.argtypes = [w.DWORD, w.BOOL, w.DWORD]
        kernel.OpenProcess.restype = w.HANDLE
        kernel.GetProcessTimes.argtypes = [w.HANDLE, c.POINTER(w.FILETIME), c.POINTER(w.FILETIME), c.POINTER(w.FILETIME), c.POINTER(w.FILETIME)]
        kernel.GetExitCodeProcess.argtypes = [w.HANDLE, c.POINTER(w.DWORD)]
        kernel.CloseHandle.argtypes = [w.HANDLE]
        handle = kernel.OpenProcess(0x1000, False, pid)
        if not handle:
            return None
        try:
            code = w.DWORD()
            if not kernel.GetExitCodeProcess(handle, c.byref(code)) or code.value != 259:
                return None
            created, exited, kernel_time, user = (w.FILETIME() for _ in range(4))
            if not kernel.GetProcessTimes(handle, c.byref(created), c.byref(exited), c.byref(kernel_time), c.byref(user)):
                return None
            return str((created.dwHighDateTime << 32) | created.dwLowDateTime)
        finally:
            kernel.CloseHandle(handle)
    try:
        with open(f'/proc/{pid}/stat', encoding='utf-8') as source:
            return source.read().rsplit(')', 1)[1].split()[19]
    except OSError:
        return None
