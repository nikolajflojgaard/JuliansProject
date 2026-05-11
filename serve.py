#!/usr/bin/env python3
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
import json
import os
import re
import select
import subprocess
import sys
import threading
import time
from urllib.parse import urlparse

if os.name != 'nt':
    import pty

ROOT = Path(__file__).resolve().parent
HOST = os.environ.get('MOTOR_UI_HOST', '127.0.0.1')
PORT = int(os.environ.get('MOTOR_UI_PORT', '8744'))
SERIAL_PORT = os.environ.get('MOTOR_UI_SERIAL_PORT', '/dev/cu.usbmodem31201')
BAUD = os.environ.get('MOTOR_UI_BAUD', '115200')

state = {
    'connected': False,
    'mode': 'unknown',
    'pwm': 0,
    'targetRPM': 0.0,
    'currentRPM': 0.0,
    'rawRPM': 0.0,
    'error': 0.0,
    'lastLine': '',
    'lastCommand': '',
    'lastUpdate': 0.0,
    'log': [],
    'notes': [
        'Sweep result: startup threshold is around PWM 60.',
        '0-50 is mostly dead. 65-80 is low usable. 90-120 is solid.',
        'Green line is PWM. Orange line is the filtered PID process variable. Raw RPM is exposed separately for debugging.'
    ],
}
state_lock = threading.Lock()
monitor_lock = threading.Lock()
monitor_proc = None
monitor_fd = None
monitor_stdout = None
monitor_stdin = None
running = True
IS_WINDOWS = os.name == 'nt'

INDEX = (ROOT / 'index.html').read_text()
APP_JS = (ROOT / 'app.js').read_text()
STYLES = (ROOT / 'styles.css').read_text()

STATUS_RE = re.compile(r'mode=(?P<mode>[^,]+),\s*targetRPM=(?P<target>[0-9.]+),\s*processRPM=(?P<current>[0-9.]+),\s*rawRPM=(?P<raw>[0-9.]+),\s*error=(?P<error>-?[0-9.]+),\s*pwm=(?P<pwm>\d+)')
UPDATE_RE = re.compile(r'UPDATED -> mode:(?P<mode>\w+) T:(?P<target>[0-9.]+).* R:(?P<ppr>[0-9.]+).* O:(?P<pwm>\d+)')


def append_log(line: str):
    line = line.strip()
    if not line:
        return
    with state_lock:
        state['lastLine'] = line
        state['lastUpdate'] = time.time()
        state['log'].append(line)
        state['log'] = state['log'][-100:]
        if 'Connecting to' in line or 'UNO motor PID started' in line:
            state['connected'] = True
        m = STATUS_RE.search(line)
        if m:
            state['mode'] = m.group('mode')
            state['targetRPM'] = float(m.group('target'))
            state['currentRPM'] = float(m.group('current'))
            state['rawRPM'] = float(m.group('raw'))
            state['error'] = float(m.group('error'))
            state['pwm'] = int(m.group('pwm'))
            state['connected'] = True
        m2 = UPDATE_RE.search(line)
        if m2:
            state['mode'] = m2.group('mode')
            state['targetRPM'] = float(m2.group('target'))
            state['pwm'] = int(m2.group('pwm'))
            state['connected'] = True


def start_monitor_locked():
    global monitor_proc, monitor_fd, monitor_stdout, monitor_stdin
    if IS_WINDOWS:
        proc = subprocess.Popen(
            ['arduino-cli', 'monitor', '-p', SERIAL_PORT, '-c', f'baudrate={BAUD}'],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=False,
            bufsize=0,
        )
        monitor_proc = proc
        monitor_fd = None
        monitor_stdout = proc.stdout
        monitor_stdin = proc.stdin
    else:
        master_fd, slave_fd = pty.openpty()
        proc = subprocess.Popen(
            ['arduino-cli', 'monitor', '-p', SERIAL_PORT, '-c', f'baudrate={BAUD}'],
            stdin=slave_fd,
            stdout=slave_fd,
            stderr=slave_fd,
            text=False,
            close_fds=True,
        )
        os.close(slave_fd)
        monitor_proc = proc
        monitor_fd = master_fd
        monitor_stdout = None
        monitor_stdin = None
    with state_lock:
        state['connected'] = False
        state['lastLine'] = 'Starting monitor…'
        state['log'] = ['Starting monitor…']


def ensure_monitor():
    with monitor_lock:
        global monitor_proc, monitor_fd, monitor_stdout, monitor_stdin
        stream_dead = monitor_stdout is None if IS_WINDOWS else monitor_fd is None
        dead = monitor_proc is None or monitor_proc.poll() is not None or stream_dead
        if dead:
            if monitor_fd is not None:
                try:
                    os.close(monitor_fd)
                except OSError:
                    pass
                monitor_fd = None
            if monitor_stdout is not None:
                try:
                    monitor_stdout.close()
                except Exception:
                    pass
                monitor_stdout = None
            if monitor_stdin is not None:
                try:
                    monitor_stdin.close()
                except Exception:
                    pass
                monitor_stdin = None
            monitor_proc = None
            start_monitor_locked()
        return monitor_proc, (monitor_stdout if IS_WINDOWS else monitor_fd)


def monitor_reader():
    buffer = ''
    while running:
        proc, stream = ensure_monitor()
        try:
            if IS_WINDOWS:
                if proc.poll() is not None:
                    raise OSError('monitor exited')
                chunk = stream.readline() if stream is not None else b''
                if not chunk:
                    time.sleep(0.1)
                    continue
            else:
                ready, _, _ = select.select([stream], [], [], 0.2)
                if not ready:
                    if proc.poll() is not None:
                        raise OSError('monitor exited')
                    continue
                chunk = os.read(stream, 4096)
                if not chunk:
                    time.sleep(0.1)
                    continue
            buffer += chunk.decode('utf-8', errors='ignore')
            while '\n' in buffer:
                line, buffer = buffer.split('\n', 1)
                append_log(line)
        except Exception as e:
            append_log(f'Monitor restart: {e}')
            with monitor_lock:
                global monitor_proc, monitor_fd, monitor_stdout, monitor_stdin
                if monitor_proc is not None and monitor_proc.poll() is None:
                    try:
                        monitor_proc.terminate()
                        monitor_proc.wait(timeout=2)
                    except Exception:
                        try:
                            monitor_proc.kill()
                        except Exception:
                            pass
                if monitor_fd is not None:
                    try:
                        os.close(monitor_fd)
                    except OSError:
                        pass
                if monitor_stdout is not None:
                    try:
                        monitor_stdout.close()
                    except Exception:
                        pass
                if monitor_stdin is not None:
                    try:
                        monitor_stdin.close()
                    except Exception:
                        pass
                monitor_proc = None
                monitor_fd = None
                monitor_stdout = None
                monitor_stdin = None
            with state_lock:
                state['connected'] = False
            time.sleep(1.0)


def send_command(command: str):
    _, stream = ensure_monitor()
    with monitor_lock:
        if IS_WINDOWS:
            if monitor_stdin is None:
                raise RuntimeError('Arduino monitor not ready')
            monitor_stdin.write(f'{command}\n'.encode())
            monitor_stdin.flush()
        else:
            if stream is None:
                raise RuntimeError('Arduino monitor not ready')
            os.write(stream, f'{command}\n'.encode())
    with state_lock:
        state['lastCommand'] = command
        state['lastUpdate'] = time.time()
        if command.startswith('O'):
            try:
                state['pwm'] = int(command[1:])
            except ValueError:
                pass
        elif command == 'M1':
            state['mode'] = 'MANUAL'
        elif command == 'M0':
            state['mode'] = 'PID'
        elif command.startswith('T'):
            try:
                state['targetRPM'] = float(command[1:])
            except ValueError:
                pass


def json_bytes(obj):
    return json.dumps(obj).encode('utf-8')


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == '/':
            self.respond(200, 'text/html; charset=utf-8', INDEX.encode('utf-8'))
            return
        if parsed.path == '/app.js':
            self.respond(200, 'application/javascript; charset=utf-8', APP_JS.encode('utf-8'))
            return
        if parsed.path == '/styles.css':
            self.respond(200, 'text/css; charset=utf-8', STYLES.encode('utf-8'))
            return
        if parsed.path == '/api/status':
            with state_lock:
                payload = dict(state)
            self.respond(200, 'application/json', json_bytes(payload))
            return
        self.respond(404, 'text/plain; charset=utf-8', b'Not found')

    def do_POST(self):
        parsed = urlparse(self.path)
        length = int(self.headers.get('Content-Length', '0'))
        raw = self.rfile.read(length) if length else b'{}'
        try:
            body = json.loads(raw.decode('utf-8'))
        except Exception:
            body = {}
        try:
            if parsed.path == '/api/pwm':
                value = max(0, min(255, int(body.get('value', 0))))
                send_command(f'O{value}')
                self.respond(200, 'application/json', json_bytes({'ok': True, 'command': f'O{value}'}))
                return
            if parsed.path == '/api/stop':
                send_command('O0')
                self.respond(200, 'application/json', json_bytes({'ok': True, 'command': 'O0'}))
                return
            if parsed.path == '/api/mode':
                manual = bool(body.get('manual', True))
                cmd = 'M1' if manual else 'M0'
                send_command(cmd)
                self.respond(200, 'application/json', json_bytes({'ok': True, 'command': cmd}))
                return
            if parsed.path == '/api/rpm':
                value = max(0, int(body.get('value', 0)))
                send_command(f'T{value}')
                self.respond(200, 'application/json', json_bytes({'ok': True, 'command': f'T{value}'}))
                return
            self.respond(404, 'application/json', json_bytes({'ok': False, 'error': 'not found'}))
        except Exception as e:
            self.respond(500, 'application/json', json_bytes({'ok': False, 'error': str(e)}))

    def log_message(self, format, *args):
        return

    def respond(self, code, content_type, payload: bytes):
        self.send_response(code)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(payload)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(payload)


def main():
    threading.Thread(target=monitor_reader, daemon=True).start()
    print(f'Arduino Motor UI at http://{HOST}:{PORT}')
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        global running
        running = False
        server.server_close()
        with monitor_lock:
            global monitor_proc, monitor_fd, monitor_stdout, monitor_stdin
            if monitor_proc is not None and monitor_proc.poll() is None:
                try:
                    monitor_proc.terminate()
                    monitor_proc.wait(timeout=2)
                except Exception:
                    try:
                        monitor_proc.kill()
                    except Exception:
                        pass
            if monitor_fd is not None:
                try:
                    os.close(monitor_fd)
                except OSError:
                    pass
                monitor_fd = None
            if monitor_stdout is not None:
                try:
                    monitor_stdout.close()
                except Exception:
                    pass
                monitor_stdout = None
            if monitor_stdin is not None:
                try:
                    monitor_stdin.close()
                except Exception:
                    pass
                monitor_stdin = None

if __name__ == '__main__':
    main()
