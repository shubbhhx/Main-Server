// ─────────────────────────────────────────────
//  index.js — Single-Command Runner
//  Starts server → waits → starts cloudflared
//  Extracts + prints the public URL
// ─────────────────────────────────────────────

'use strict';

const { spawn }       = require('child_process');
const http            = require('http');
const { createServer, PORT, HOST } = require('./server');

// ── ANSI Colors (safe for Termux) ────────────
const c = {
    reset:  '\x1b[0m',
    bold:   '\x1b[1m',
    green:  '\x1b[32m',
    cyan:   '\x1b[36m',
    yellow: '\x1b[33m',
    red:    '\x1b[31m',
    orange: '\x1b[38;5;208m',
    dim:    '\x1b[2m',
};

function log(tag, msg, color = c.reset) {
    const ts = new Date().toTimeString().slice(0, 8);
    console.log(`${c.dim}[${ts}]${c.reset} ${color}${c.bold}${tag}${c.reset}  ${msg}`);
}

// ── Banner ────────────────────────────────────
function printBanner() {
    console.log();
    console.log(`${c.orange}${c.bold}  ╔═══════════════════════════════════╗`);
    console.log(`  ║   🤖  TERMUX SERVER + CLOUDFLARE  ║`);
    console.log(`  ╚═══════════════════════════════════╝${c.reset}`);
    console.log();
}

// ── Health poll: wait until server is up ─────
function waitForServer(port, maxAttempts = 20) {
    return new Promise((resolve, reject) => {
        let attempts = 0;

        const check = () => {
            attempts++;
            const req = http.get(`http://127.0.0.1:${port}/health`, (res) => {
                if (res.statusCode === 200) {
                    resolve();
                } else {
                    retry();
                }
            });
            req.on('error', retry);
            req.setTimeout(1000, () => { req.destroy(); retry(); });
        };

        const retry = () => {
            if (attempts >= maxAttempts) {
                reject(new Error(`Server did not respond after ${maxAttempts} attempts.`));
                return;
            }
            setTimeout(check, 500);
        };

        check();
    });
}

// ── Extract trycloudflare.com URL from output ─
function extractTunnelURL(text) {
    // Matches both https://xxx.trycloudflare.com and variations
    const match = text.match(/https:\/\/[\w-]+\.trycloudflare\.com/i);
    return match ? match[0] : null;
}

// ── Start cloudflared ─────────────────────────
function startCloudflared(port) {
    return new Promise((resolve, reject) => {
        log('TUNNEL', 'Starting Cloudflare Tunnel...', c.cyan);

        const cf = spawn('cloudflared', [
            'tunnel',
            '--url', `http://127.0.0.1:${port}`,
            '--no-autoupdate',
        ], {
            stdio: ['ignore', 'pipe', 'pipe'],  // capture stdout + stderr
        });

        let urlFound = false;
        const timeout = setTimeout(() => {
            if (!urlFound) {
                reject(new Error('Cloudflare Tunnel timed out. Is cloudflared installed? Run: pkg install cloudflared'));
            }
        }, 30000); // 30 second timeout

        // cloudflared outputs URL on stderr
        const handleOutput = (data) => {
            const text = data.toString();
            const url  = extractTunnelURL(text);

            if (url && !urlFound) {
                urlFound = true;
                clearTimeout(timeout);

                console.log();
                console.log(`${c.green}${c.bold}  ┌──────────────────────────────────────────────┐`);
                console.log(`  │  ✅  PUBLIC URL READY                         │`);
                console.log(`  │                                                │`);
                console.log(`  │  ${url.padEnd(46)}│`);
                console.log(`  │                                                │`);
                console.log(`  │  /health    → JSON status check               │`);
                console.log(`  │  /dashboard → Live server dashboard           │`);
                console.log(`  └──────────────────────────────────────────────┘${c.reset}`);
                console.log();

                resolve(cf);
            }

            // Also surface cloudflared logs at dim level for debugging
            const lines = text.split('\n').filter(Boolean);
            for (const line of lines) {
                if (!line.match(/trycloudflare/i)) {
                    process.stdout.write(`${c.dim}  [CF] ${line.trim()}${c.reset}\n`);
                }
            }
        };

        cf.stdout.on('data', handleOutput);
        cf.stderr.on('data', handleOutput);

        cf.on('error', (err) => {
            clearTimeout(timeout);
            if (err.code === 'ENOENT') {
                reject(new Error('cloudflared not found. Install it with: pkg install cloudflared'));
            } else {
                reject(new Error(`cloudflared error: ${err.message}`));
            }
        });

        cf.on('exit', (code) => {
            if (!urlFound) {
                clearTimeout(timeout);
                reject(new Error(`cloudflared exited with code ${code} before providing a URL.`));
            } else {
                log('TUNNEL', `cloudflared exited (code ${code})`, c.yellow);
            }
        });
    });
}

// ── Graceful Shutdown ─────────────────────────
function setupShutdown(server, cfProcess) {
    const shutdown = (signal) => {
        console.log();
        log('SHUTDOWN', `Received ${signal}. Shutting down gracefully...`, c.yellow);

        if (cfProcess) {
            cfProcess.kill('SIGTERM');
            log('TUNNEL', 'Cloudflare Tunnel stopped.', c.yellow);
        }

        server.close(() => {
            log('SERVER', 'HTTP Server closed.', c.yellow);
            process.exit(0);
        });

        // Force-exit after 5s if hanging
        setTimeout(() => process.exit(1), 5000);
    };

    process.on('SIGINT',  () => shutdown('SIGINT'));   // Ctrl+C
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    // Catch unhandled exceptions so the process never dies silently
    process.on('uncaughtException', (err) => {
        log('ERROR', `Uncaught Exception: ${err.message}`, c.red);
        console.error(err.stack);
    });

    process.on('unhandledRejection', (reason) => {
        log('ERROR', `Unhandled Rejection: ${reason}`, c.red);
    });
}

// ── Main ──────────────────────────────────────
async function main() {
    printBanner();

    // 1. Start HTTP server
    const server = createServer();
    server.listen(PORT, HOST, () => {
        log('SERVER', `HTTP server listening on ${HOST}:${PORT}`, c.green);
    });

    // 2. Wait until server is healthy
    try {
        log('SERVER', 'Waiting for server to be ready...', c.dim);
        await waitForServer(PORT);
        log('SERVER', 'Server is ready ✓', c.green);
    } catch (err) {
        log('ERROR', `Server failed to start: ${err.message}`, c.red);
        process.exit(1);
    }

    // 3. Start Cloudflare Tunnel
    let cfProcess = null;
    try {
        cfProcess = await startCloudflared(PORT);
    } catch (err) {
        log('TUNNEL', `Warning: ${err.message}`, c.yellow);
        log('TUNNEL', 'Server is still running locally. Tunnel unavailable.', c.yellow);
        log('SERVER', `Local URL: http://localhost:${PORT}`, c.cyan);
    }

    // 4. Setup graceful shutdown
    setupShutdown(server, cfProcess);

    // Keep process alive
    log('READY', 'Press Ctrl+C to stop.', c.dim);
}

main();
