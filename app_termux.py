"""
app_termux.py  —  Python HTTP Server + Cloudflare Tunnel
Run:  python app_termux.py
"""

import json
import os
import shutil
import signal
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

# ── Config ────────────────────────────────────
PORT          = int(os.environ.get("PORT", 3000))
HOST          = "0.0.0.0"
TUNNEL_NAME   = "toxibh"

# ── ANSI colours (work fine in Termux) ────────
R = "\033[0m"
G = "\033[32m"
Y = "\033[33m"
C = "\033[36m"
B = "\033[1m"
D = "\033[2m"
E = "\033[31m"

# ── Global tunnel process handle ──────────────
_tunnel_proc = None


# ══════════════════════════════════════════════
#  HTML Page
# ══════════════════════════════════════════════
HTML = b"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="refresh" content="15">
  <title>Toxibh Server</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{min-height:100vh;display:flex;align-items:center;justify-content:center;
         background:#0a0a0f;font-family:system-ui,sans-serif;color:#e2e8f0}
    .card{background:linear-gradient(135deg,#13131f,#1a1a2e);border:1px solid #2d2d4e;
          border-radius:16px;padding:36px 40px;width:90%;max-width:400px;
          box-shadow:0 25px 60px rgba(0,0,0,.6)}
    h1{font-size:1.2rem;color:#f38020;margin-bottom:20px}
    .dot{display:inline-block;width:8px;height:8px;border-radius:50%;
         background:#4ade80;margin-right:6px;animation:p 1.5s infinite}
    @keyframes p{0%,100%{opacity:1}50%{opacity:.2}}
    p{padding:10px 0;border-bottom:1px solid #1e1e3a;font-size:.875rem}
    p:last-child{border-bottom:none}
    span{float:right;font-weight:600}
    footer{margin-top:16px;font-size:.7rem;color:#3a3a5c;text-align:center}
  </style>
</head>
<body>
  <div class="card">
    <h1>Toxibh Server</h1>
    <p><span class="dot"></span><b>Status</b><span style="color:#4ade80">Online</span></p>
    <p><b>Tunnel</b><span>toxibh (Cloudflare)</span></p>
    <p><b>Runtime</b><span>Python / Termux</span></p>
    <footer>Auto-refresh every 15s</footer>
  </div>
</body>
</html>"""


# ══════════════════════════════════════════════
#  Request Handler
# ══════════════════════════════════════════════
class Handler(BaseHTTPRequestHandler):

    # Silence default access log — we print our own
    def log_message(self, fmt, *args):
        pass

    def do_GET(self):
        print(f"{D}  REQ  {R}{self.command} {self.path}")

        if self.path == "/health":
            body = json.dumps({"status": "ok"}).encode()
            self._respond(200, "application/json", body)

        elif self.path in ("/", "/index.html"):
            # Serve index.html from disk if present, else built-in HTML
            html_file = os.path.join(os.path.dirname(__file__), "index.html")
            if os.path.isfile(html_file):
                with open(html_file, "rb") as f:
                    body = f.read()
            else:
                body = HTML
            self._respond(200, "text/html", body)

        else:
            self._respond(404, "text/plain", b"Not found")

    def _respond(self, code, ctype, body):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


# ══════════════════════════════════════════════
#  Cloudflare Tunnel
# ══════════════════════════════════════════════
def start_tunnel():
    global _tunnel_proc

    # Check cloudflared is installed (cross-platform)
    if not shutil.which("cloudflared"):
        print(f"{E}  [TUNNEL] cloudflared not found.{R}")
        print(f"{Y}  Install it:  pkg install cloudflared{R}\n")
        return

    print(f"{C}{B}  [TUNNEL]{R} Starting tunnel  →  {B}{TUNNEL_NAME}{R}")

    try:
        _tunnel_proc = subprocess.Popen(
            ["cloudflared", "tunnel", "run", TUNNEL_NAME, "--no-autoupdate"],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )

        for line in _tunnel_proc.stdout:
            line = line.rstrip()
            if line:
                print(f"{D}  [CF] {line}{R}")

        _tunnel_proc.wait()
        code = _tunnel_proc.returncode
        print(f"{Y}  [TUNNEL] cloudflared exited (code {code}){R}")

    except Exception as ex:
        print(f"{E}  [TUNNEL] Error: {ex}{R}")


# ══════════════════════════════════════════════
#  Graceful Shutdown
# ══════════════════════════════════════════════
def shutdown(sig, frame):
    print(f"\n{Y}  Shutting down…{R}")
    if _tunnel_proc and _tunnel_proc.poll() is None:
        _tunnel_proc.terminate()
        print(f"{Y}  [TUNNEL] Stopped.{R}")
    print(f"{Y}  [SERVER] Stopped.{R}")
    sys.exit(0)


# ══════════════════════════════════════════════
#  Main
# ══════════════════════════════════════════════
def main():
    signal.signal(signal.SIGINT,  shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    print()
    print(f"{B}{'='*44}{R}")
    print(f"  {B}TOXIBH - Termux Python Server{R}")
    print(f"{'='*44}{R}")
    print()

    # 1. Start Cloudflare Tunnel in background thread
    t = threading.Thread(target=start_tunnel, daemon=True)
    t.start()

    # 2. Start HTTP server (blocks main thread)
    try:
        httpd = HTTPServer((HOST, PORT), Handler)
    except OSError as e:
        if "Address already in use" in str(e):
            print(f"{E}  [SERVER] Port {PORT} is already in use.{R}")
            print(f"{Y}  Free it with:  fuser -k {PORT}/tcp{R}")
        else:
            print(f"{E}  [SERVER] {e}{R}")
        sys.exit(1)

    print(f"{G}{B}  [SERVER]{R} Listening on {B}{HOST}:{PORT}{R}")
    print(f"{D}  Routes:  /   /health{R}")
    print(f"{D}  Press Ctrl+C to stop{R}\n")

    httpd.serve_forever()


if __name__ == "__main__":
    main()
