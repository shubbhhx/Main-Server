const express = require('express');
const app = express();

// dynamic Port Integration and 0.0.0.0 Binding
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0'; // CRITICAL: Fixes Cloudflare Tunnel 502/1033 errors

// Middleware: Log every incoming request cleanly
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} - IP: ${req.ip}`);
    next();
});

// Health check routes
app.get('/', (req, res) => {
    res.send('Server is running');
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

// Optional Bonus: Simple HTML Dashboard
app.get('/dashboard', (req, res) => {
    const memoryUsage = (process.memoryUsage().rss / 1024 / 1024).toFixed(2);
    const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Android Server Dashboard</title>
        <style>
            body { font-family: -apple-system, system-ui, sans-serif; background: #121212; color: #ffffff; padding: 20px; display: flex; justify-content: center; }
            .card { background: #1e1e1e; padding: 30px; border-radius: 12px; border: 1px solid #333; max-width: 400px; width: 100%; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
            h2 { margin-top: 0; color: #f38020; }
            .status { color: #4ade80; font-weight: bold; }
            p { margin: 10px 0; border-bottom: 1px solid #333; padding-bottom: 8px; }
            p:last-child { border-bottom: none; }
        </style>
    </head>
    <body>
        <div class="card">
            <h2>🚀 Termux Server Hub</h2>
            <p><strong>Status:</strong> <span class="status">● Online</span></p>
            <p><strong>Server Time:</strong> ${new Date().toLocaleString()}</p>
            <p><strong>Message:</strong> Running reliably via Cloudflare Tunnel.</p>
            <p><strong>RAM Usage:</strong> ${memoryUsage} MB</p>
        </div>
    </body>
    </html>
    `;
    res.send(html);
});

// Error Handling: Catch unhandled backend crashes
app.use((err, req, res, next) => {
    console.error(`[CRITICAL ERROR] ${err.stack}`);
    res.status(500).send('Internal Server Error');
});

// Startup Logic
app.listen(PORT, HOST, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Local Access: http://localhost:${PORT}`);
    console.log(`Network Access: http://${HOST}:${PORT}`);
    console.log(`\nWaiting for requests...`);
});

// Process-level unhandled exception catching
process.on('uncaughtException', (err) => {
    console.error(`[UNCAUGHT] ${err.message}`);
});
