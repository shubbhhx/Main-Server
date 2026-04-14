// ─────────────────────────────────────────────
//  server.js — Lightweight HTTP Server
//  Pure Node.js · No frameworks · No crashes
// ─────────────────────────────────────────────

const http = require('http');

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

// ── Dashboard HTML ────────────────────────────
function dashboardHTML(startTime) {
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    const mem    = (process.memoryUsage().rss / 1024 / 1024).toFixed(1);
    const hours  = String(Math.floor(uptime / 3600)).padStart(2, '0');
    const mins   = String(Math.floor((uptime % 3600) / 60)).padStart(2, '0');
    const secs   = String(uptime % 60).padStart(2, '0');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="refresh" content="10">
  <title>Termux Server</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      min-height: 100vh;
      display: flex; align-items: center; justify-content: center;
      background: #0a0a0f;
      font-family: 'Segoe UI', system-ui, sans-serif;
      color: #e2e8f0;
    }
    .card {
      background: linear-gradient(135deg, #13131f 0%, #1a1a2e 100%);
      border: 1px solid #2d2d4e;
      border-radius: 16px;
      padding: 36px 40px;
      width: 90%; max-width: 420px;
      box-shadow: 0 25px 60px rgba(0,0,0,0.6);
    }
    .brand {
      display: flex; align-items: center; gap: 10px;
      margin-bottom: 28px;
    }
    .brand h1 { font-size: 1.3rem; font-weight: 700; color: #f38020; }
    .badge {
      display: inline-flex; align-items: center; gap: 6px;
      background: rgba(74,222,128,0.12);
      border: 1px solid rgba(74,222,128,0.3);
      color: #4ade80; border-radius: 20px;
      padding: 4px 12px; font-size: 0.75rem; font-weight: 600;
      margin-bottom: 24px;
    }
    .badge::before {
      content: ''; width: 6px; height: 6px;
      background: #4ade80; border-radius: 50%;
      animation: pulse 1.5s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; } 50% { opacity: 0.3; }
    }
    .row {
      display: flex; justify-content: space-between; align-items: center;
      padding: 12px 0;
      border-bottom: 1px solid #1e1e3a;
      font-size: 0.875rem;
    }
    .row:last-child { border-bottom: none; }
    .row .label { color: #7c8db5; }
    .row .value { font-weight: 600; color: #f1f5f9; }
    .footer { text-align: center; margin-top: 22px; font-size: 0.75rem; color: #3a3a5c; }
  </style>
</head>
<body>
  <div class="card">
    <div class="brand">
      <span style="font-size:1.5rem">🤖</span>
      <h1>Termux Server Hub</h1>
    </div>
    <div class="badge">● ONLINE</div>
    <div class="row"><span class="label">Time</span><span class="value">${new Date().toLocaleString()}</span></div>
    <div class="row"><span class="label">Uptime</span><span class="value">${hours}h ${mins}m ${secs}s</span></div>
    <div class="row"><span class="label">Memory</span><span class="value">${mem} MB</span></div>
    <div class="row"><span class="label">Node.js</span><span class="value">${process.version}</span></div>
    <div class="row"><span class="label">Platform</span><span class="value">${process.platform} / ${process.arch}</span></div>
    <p class="footer">Auto-refresh every 10s · Powered by Cloudflare Tunnel</p>
  </div>
</body>
</html>`;
}

// ── Request Router ────────────────────────────
function createServer() {
    const startTime = Date.now();

    const server = http.createServer((req, res) => {
        // Log every request
        const ts  = new Date().toISOString();
        const log = `[${ts}] ${req.method} ${req.url}`;
        process.stdout.write(log + '\n');

        // ── Routes ──
        if (req.method === 'GET' && req.url === '/') {
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('Server running');
            return;
        }

        if (req.method === 'GET' && req.url === '/health') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok', uptime: Math.floor((Date.now() - startTime) / 1000) }));
            return;
        }

        if (req.method === 'GET' && req.url === '/dashboard') {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(dashboardHTML(startTime));
            return;
        }

        // 404 fallback
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
    });

    // ── Error Handling ──
    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.error(`\n[ERROR] Port ${PORT} is already in use. Free the port and retry.\n`);
        } else {
            console.error(`\n[SERVER ERROR] ${err.message}\n`);
        }
        process.exit(1);
    });

    return server;
}

// ── Exports ───────────────────────────────────
module.exports = { createServer, PORT, HOST };
