# ═══════════════════════════════════════════════════════════
#  TOXIBH ADMIN  —  app.py  (Flask Backend + SQLite DB)
#  Run:  python app.py
# ═══════════════════════════════════════════════════════════

import os, uuid, bcrypt, mimetypes, json, time, re
import urllib.request, urllib.error
import requests as req_session   # for Vidking proxy (streaming)
from datetime import datetime, timedelta
from functools import wraps
from flask import (Flask, request, jsonify, session,
                   send_from_directory, abort, g, redirect)
from werkzeug.utils import secure_filename
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_session import Session
import psutil
import db

# ── APP SETUP ────────────────────────────────────────────
app = Flask(__name__, static_folder='static', template_folder='templates')

# Termux/Android Session Optimizations
app.config['SECRET_KEY'] = 'toxibh_flask_secret_xR9pQz2026'
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(hours=8)
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SECURE'] = False
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024  # 100 MB

limiter = Limiter(get_remote_address, app=app, default_limits=["500 per hour"])

# ── INIT DATABASE ────────────────────────────────────────
db.init_db()

# ── PATHS ─────────────────────────────────────────────────
BASE_DIR    = os.path.dirname(os.path.abspath(__file__))
PHOTOS_DIR  = os.path.join(BASE_DIR, 'static', 'photos')
PDFS_DIR    = os.path.join(BASE_DIR, 'static', 'pdfs')

for d in [PHOTOS_DIR, PDFS_DIR]:
    os.makedirs(d, exist_ok=True)

# ── TORRENT AUTO-CLEANUP (1-day TTL) ─────────────────────────
import threading, shutil

def _torrent_cleanup_loop():
    """Background thread: delete torrent files older than 24 hours."""
    TORRENT_DIR = os.path.expanduser('~/torrents')
    TTL_SECONDS = 24 * 60 * 60  # 1 day
    CHECK_EVERY = 60 * 60       # check every 1 hour
    while True:
        try:
            if os.path.isdir(TORRENT_DIR):
                now = time.time()
                deleted = []
                for entry in os.listdir(TORRENT_DIR):
                    full = os.path.join(TORRENT_DIR, entry)
                    try:
                        age = now - os.path.getmtime(full)
                        if age > TTL_SECONDS:
                            if os.path.isdir(full):
                                shutil.rmtree(full, ignore_errors=True)
                            else:
                                os.remove(full)
                            deleted.append(entry)
                    except Exception:
                        pass
                if deleted:
                    print(f'[ToxibhFlix cleanup] Deleted {len(deleted)} old torrent(s): {deleted}')
        except Exception as e:
            print(f'[ToxibhFlix cleanup] Error: {e}')
        time.sleep(CHECK_EVERY)

_cleanup_thread = threading.Thread(target=_torrent_cleanup_loop, daemon=True)
_cleanup_thread.start()

# ── CREDENTIALS ──────────────────────────────────────────
SECRET_KEY   = 'toxibh-shubh@6969'
ALLOWED_IMG  = {'image/jpeg', 'image/png', 'image/gif', 'image/webp'}
ALLOWED_PDF  = {'application/pdf'}

# ── AUTH DECORATOR ────────────────────────────────────────
def admin_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not session.get('admin'):
            return jsonify({'error': 'Unauthorized'}), 401
        return f(*args, **kwargs)
    return decorated

# ── SERVER METRICS TRACKING ──────────────────────────────
server_metrics = {
    'total_requests': 0,
    'error_count': 0,
    'total_response_time': 0.0,
    'start_time': time.time(),
    'requests_last_minute': []
}

@app.before_request
def before_request_tracking():
    g.start_time = time.time()
    if request.path.startswith('/api/'):
        server_metrics['total_requests'] += 1
        now = time.time()
        server_metrics['requests_last_minute'].append(now)
        # Clean up old requests beyond 60 seconds for rate calculation
        server_metrics['requests_last_minute'] = [t for t in server_metrics['requests_last_minute'] if now - t < 60]

@app.after_request
def after_request_tracking(response):
    if hasattr(g, 'start_time') and request.path.startswith('/api/'):
        duration = time.time() - g.start_time
        server_metrics['total_response_time'] += duration
        if response.status_code >= 400:
            server_metrics['error_count'] += 1
    return response

# ── VISITOR TRACKER ───────────────────────────────────────
@app.before_request
def track_visitor():
    if request.path in ('/', '/index.html'):
        v_id = str(uuid.uuid4())
        ip = request.headers.get('X-Forwarded-For', request.remote_addr or 'unknown')
        ua = request.headers.get('User-Agent', 'unknown')
        ref = request.headers.get('Referer', 'direct')
        time_now = datetime.utcnow().isoformat()
        
        db.execute_query('''
            INSERT INTO visitors (id, ip, user_agent, referrer, time, page)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (v_id, ip, ua, ref, time_now, request.path))

# ══════════════════════════════════════════════════════════
#  STATIC FILES — Portfolio + Admin
# ══════════════════════════════════════════════════════════
@app.route('/')
def portfolio():
    return send_from_directory('templates', 'index.html')

@app.route('/admin')
def admin_page():
    if not session.get('bot_unlocked'):
        return redirect('/')
    return send_from_directory('templates', 'admin.html')

@app.route('/movies')
def movies_page():
    return send_from_directory('templates/movies', 'profiles.html')

@app.route('/movies/browse')
def movies_browse():
    return send_from_directory('templates/movies', 'index.html')

@app.route('/movies/watch.html')
def movies_watch():
    return send_from_directory('templates/movies', 'watch.html')

@app.route('/movies/torrent')
def movies_torrent():
    return send_from_directory('templates/movies', 'torrent.html')

@app.route('/movies/<path:filename>')
def movies_static(filename):
    return send_from_directory('templates/movies', filename)

# ── VIDKING SERVER-SIDE PROXY ────────────────────────────────
# Only these domains may be proxied — prevents open-proxy abuse
PROXY_WHITELIST = {
    'vidking.net', 'www.vidking.net',
    'static.vidking.net', 'api.vidking.net',
    'cdn.vidking.net', 'stream.vidking.net',
    'vidsrc.net', 'vidsrc.me',            # common CDN fallbacks vidking uses
}

PROXY_HEADERS = {
    'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
                       '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Referer':         'https://www.vidking.net/',
    'Origin':          'https://www.vidking.net',
}

def _proxy_allowed(url: str) -> bool:
    """Return True only if hostname is in the whitelist."""
    try:
        from urllib.parse import urlparse
        h = urlparse(url).netloc.lower().split(':')[0]
        return h in PROXY_WHITELIST
    except Exception:
        return False

def _rewrite_html(html: str, tmdb_id: str) -> str:
    """
    Rewrite absolute vidking.net URLs inside the player HTML so every
    sub-resource also passes through our /proxy/res/ route.
    This means JS, CSS, API calls and HLS playlists all use the server’s VPN IP.
    """
    import urllib.parse

    def to_proxy(url: str) -> str:
        if not url or url.startswith('data:') or url.startswith('/proxy/'):
            return url
        if url.startswith('//'):
            url = 'https:' + url
        if url.startswith('/'):
            url = 'https://www.vidking.net' + url
        if url.startswith('http') and _proxy_allowed(url):
            return '/proxy/res/' + urllib.parse.quote(url, safe='')
        return url

    # Rewrite src="...", href="...", url('...')
    def replacer(m):
        attr, quote, orig_url = m.group(1), m.group(2), m.group(3)
        return f'{attr}={quote}{to_proxy(orig_url)}{quote}'

    html = re.sub(
        r'(src|href|action)=(["\'])(https?://[^"\'>\s]+|//[^"\'>\s]+)\2',
        replacer, html
    )
    # Also rewrite url() in inline CSS
    html = re.sub(
        r"""url\(['"]?(https?://[^)'"]+|//[^)'"]+)['"]?\)""",
        lambda m: f"url('{to_proxy(m.group(1))}')",
        html
    )
    # Inject base tag so relative paths resolve correctly
    base_tag = '<base href="https://www.vidking.net/">'
    html = html.replace('<head>', f'<head>\n{base_tag}', 1)
    return html

@app.route('/proxy/player/<int:tmdb_id>')
def proxy_player(tmdb_id):
    """Fetch Vidking embed page from the server (VPN IP) and return it."""
    # Forward query params (color, autoPlay, progress, etc.)
    qs = request.query_string.decode()
    target = f'https://www.vidking.net/embed/movie/{tmdb_id}'
    if qs:
        target += '?' + qs

    try:
        up = req_session.get(
            target,
            headers=PROXY_HEADERS,
            timeout=15,
            stream=False,          # we need to rewrite HTML, so buffer once
            allow_redirects=True,
        )
        up.raise_for_status()
    except Exception as e:
        return f'<html><body style="background:#000;color:#e50914;font-family:monospace;padding:30px">'\
               f'Proxy error: {e}<br><br>'\
               f'Make sure the server is connected to a VPN.</body></html>', 502

    ct = up.headers.get('Content-Type', 'text/html')
    html = up.text
    html = _rewrite_html(html, str(tmdb_id))

    from flask import Response
    resp = Response(html, status=up.status_code, content_type=ct)
    # Pass through useful headers
    for h in ('Cache-Control', 'X-Content-Type-Options'):
        if h in up.headers:
            resp.headers[h] = up.headers[h]
    return resp

@app.route('/proxy/res/<path:encoded_url>')
def proxy_resource(encoded_url):
    """
    Streaming reverse-proxy for all sub-resources the player page loads:
    JS, CSS, images, HLS manifests (.m3u8), video segments (.ts).
    encoded_url is a URL-encoded absolute URL.
    """
    import urllib.parse
    from flask import Response, stream_with_context

    try:
        target = urllib.parse.unquote(encoded_url)
    except Exception:
        return 'Bad URL', 400

    if not target.startswith('http'):
        target = 'https://' + target

    if not _proxy_allowed(target):
        return 'Forbidden domain', 403

    # Build forwarder headers
    fwd_headers = dict(PROXY_HEADERS)
    for h in ('Accept', 'Accept-Encoding', 'Accept-Language', 'Range'):
        if h in request.headers:
            fwd_headers[h] = request.headers[h]

    try:
        up = req_session.get(
            target,
            headers=fwd_headers,
            timeout=30,
            stream=True,
            allow_redirects=True,
        )
    except Exception as e:
        return f'Upstream error: {e}', 502

    ct = up.headers.get('Content-Type', 'application/octet-stream')

    # For HLS playlists, rewrite segment URLs inline so they also proxy
    if '.m3u8' in target or 'mpegurl' in ct.lower():
        def rewrite_m3u8():
            import urllib.parse as up2
            for line in up.iter_lines(decode_unicode=True):
                if line and not line.startswith('#'):
                    seg = line.strip()
                    if not seg.startswith('http'):
                        # Make absolute
                        from urllib.parse import urljoin
                        seg = urljoin(target, seg)
                    if _proxy_allowed(seg):
                        seg = '/proxy/res/' + up2.quote(seg, safe='')
                yield seg + '\n'
        resp = Response(stream_with_context(rewrite_m3u8()), content_type=ct)
    else:
        def stream_chunks():
            for chunk in up.iter_content(chunk_size=65536):
                if chunk:
                    yield chunk
        resp = Response(stream_with_context(stream_chunks()), content_type=ct)

    # Forward useful response headers
    for h in ('Content-Length', 'Content-Range', 'Accept-Ranges',
              'Cache-Control', 'ETag', 'Last-Modified'):
        if h in up.headers:
            resp.headers[h] = up.headers[h]

    resp.status_code = up.status_code
    return resp

# ── TOXIBHFLIX MANAGEMENT API ─────────────────────────────────────
MOVIES_CONFIG_FILE = 'movies_config.json'

def _load_movies_config():
    """Load movies config (profiles + TMDB key) from JSON file."""
    if os.path.exists(MOVIES_CONFIG_FILE):
        try:
            with open(MOVIES_CONFIG_FILE, 'r') as f:
                return json.load(f)
        except Exception:
            pass
    return {
        'profiles': [
            {'name': 'Shubham',    'emoji': '🤖'},
            {'name': 'Chill Mode', 'emoji': '🎮'},
            {'name': 'Night Owl',  'emoji': '🌙'},
            {'name': 'Action Fan', 'emoji': '⚡'},
        ],
        'tmdb_key': ''
    }

def _save_movies_config(data):
    with open(MOVIES_CONFIG_FILE, 'w') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

@app.route('/api/movies/profiles', methods=['GET'])
def api_movies_profiles_get():
    cfg = _load_movies_config()
    return jsonify(cfg.get('profiles', []))

@app.route('/api/movies/profiles', methods=['POST'])
@admin_required
def api_movies_profiles_save():
    data = request.get_json()
    if not isinstance(data, list):
        return jsonify({'error': 'Expected a list of profiles'}), 400
    cfg = _load_movies_config()
    cfg['profiles'] = data
    _save_movies_config(cfg)
    return jsonify({'success': True})

@app.route('/api/movies/config', methods=['GET'])
@admin_required
def api_movies_config_get():
    cfg = _load_movies_config()
    return jsonify({'tmdb_key': cfg.get('tmdb_key', '')})

@app.route('/api/movies/config', methods=['POST'])
@admin_required
def api_movies_config_save():
    data = request.get_json()
    cfg = _load_movies_config()
    if 'tmdb_key' in data:
        cfg['tmdb_key'] = data['tmdb_key'].strip()
    _save_movies_config(cfg)
    # Also update script.js to inject key
    return jsonify({'success': True})

@app.route('/api/movies/tmdb-status', methods=['GET'])
@admin_required
def api_movies_tmdb_status():
    import urllib.request, urllib.error
    cfg = _load_movies_config()
    key = cfg.get('tmdb_key', '')
    if not key:
        return jsonify({'status': 'no_key', 'message': 'No TMDB API key configured'})
    try:
        url = f'https://api.themoviedb.org/3/configuration?api_key={key}'
        req = urllib.request.Request(url, headers={'User-Agent': 'ToxibhFlix/1.0'})
        with urllib.request.urlopen(req, timeout=5) as res:
            if res.status == 200:
                return jsonify({'status': 'ok', 'message': 'TMDB API is reachable ✓', 'code': 200})
    except urllib.error.HTTPError as e:
        if e.code == 401:
            return jsonify({'status': 'invalid_key', 'message': 'Invalid API key (401)', 'code': 401})
        return jsonify({'status': 'error', 'message': f'HTTP {e.code}', 'code': e.code})
    except Exception as ex:
        return jsonify({'status': 'unreachable', 'message': str(ex)})
    return jsonify({'status': 'unknown'})

# ── ARIA2 TORRENT STREAMING API ────────────────────────────────
ARIA2_RPC  = os.environ.get('ARIA2_RPC', 'http://localhost:6800/jsonrpc')
ARIA2_SEC  = os.environ.get('ARIA2_SECRET', 'toxibhflix123')
ARIA2_DIR  = os.path.expanduser(os.environ.get('ARIA2_DIR', '~/torrents'))

VIDEO_EXTS = ('.mp4', '.mkv', '.avi', '.webm', '.mov', '.m4v', '.ogv', '.wmv')
MIME_MAP   = {
    'mp4': 'video/mp4', 'webm': 'video/webm', 'ogv': 'video/ogg',
    'mkv': 'video/x-matroska', 'avi': 'video/x-msvideo',
    'mov': 'video/quicktime', 'm4v': 'video/x-m4v', 'wmv': 'video/x-ms-wmv',
}

def aria2_call(method, params=None):
    """Call aria2 JSON-RPC and return result or raise."""
    payload = json.dumps({
        'jsonrpc': '2.0', 'id': 'tfx', 'method': method,
        'params': [f'token:{ARIA2_SEC}'] + (params or [])
    }).encode()
    req = urllib.request.Request(
        ARIA2_RPC, data=payload,
        headers={'Content-Type': 'application/json'}, method='POST'
    )
    with urllib.request.urlopen(req, timeout=5) as r:
        data = json.loads(r.read())
    if 'error' in data:
        raise RuntimeError(data['error'].get('message', 'aria2 error'))
    return data.get('result')

@app.route('/api/torrent/ping')
def api_torrent_ping():
    """Check if aria2 is reachable."""
    try:
        v = aria2_call('aria2.getVersion')
        return jsonify({'ok': True, 'version': v.get('version', '?')})
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)})

@app.route('/api/torrent/add', methods=['POST'])
def api_torrent_add():
    data = request.get_json()
    magnet = (data or {}).get('magnet', '').strip()
    if not magnet.startswith('magnet:'):
        return jsonify({'error': 'Invalid magnet link'}), 400
    try:
        gid = aria2_call('aria2.addUri', [[magnet], {'dir': ARIA2_DIR, 'seed-ratio': '0'}])
        return jsonify({'gid': gid})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/torrent/status/<gid>')
def api_torrent_status(gid):
    try:
        s = aria2_call('aria2.tellStatus', [gid])
        # Identify video files
        files = s.get('files', [])
        for f in files:
            ext = os.path.splitext(f.get('path', ''))[1].lower()
            f['is_video'] = ext in VIDEO_EXTS
        return jsonify(s)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/torrent/list')
def api_torrent_list():
    try:
        active  = aria2_call('aria2.tellActive') or []
        waiting = aria2_call('aria2.tellWaiting', [0, 20]) or []
        stopped = aria2_call('aria2.tellStopped', [0, 10]) or []
        return jsonify({'active': active, 'waiting': waiting, 'stopped': stopped})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/torrent/remove/<gid>', methods=['DELETE'])
def api_torrent_remove(gid):
    try:
        aria2_call('aria2.forceRemove', [gid])
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/torrent/stream/<gid>')
def api_torrent_stream(gid):
    """Stream the largest video file in a torrent via Range requests."""
    try:
        file_idx = request.args.get('file', None)
        s = aria2_call('aria2.tellStatus', [gid])
        files = s.get('files', [])

        # Find video file (by index param or largest video)
        video_files = [
            f for f in files
            if os.path.splitext(f.get('path',''))[1].lower() in VIDEO_EXTS
        ]
        if not video_files:
            return jsonify({'error': 'No video file found yet'}), 404

        if file_idx is not None:
            chosen = next((f for f in files if f.get('index') == str(file_idx)), video_files[0])
        else:
            chosen = max(video_files, key=lambda f: int(f.get('length', 0)))

        path = chosen.get('path', '')
        if not path or not os.path.exists(path):
            return jsonify({'error': 'File not yet on disk — wait a moment'}), 404

        ext  = os.path.splitext(path)[1].lstrip('.').lower()
        mime = MIME_MAP.get(ext, 'video/mp4')
        file_size = os.path.getsize(path)

        from flask import Response
        range_header = request.headers.get('Range')
        if range_header:
            m = re.match(r'bytes=(\d+)-(\d*)', range_header)
            if not m:
                return Response(status=416)
            start = int(m.group(1))
            end   = int(m.group(2)) if m.group(2) else file_size - 1
            end   = min(end, file_size - 1)
            length = end - start + 1
            def chunk_gen(path, start, length):
                with open(path, 'rb') as f:
                    f.seek(start)
                    remaining = length
                    while remaining > 0:
                        read = min(65536, remaining)
                        buf  = f.read(read)
                        if not buf: break
                        remaining -= len(buf)
                        yield buf
            resp = Response(chunk_gen(path, start, length), 206, mimetype=mime)
            resp.headers['Content-Range']  = f'bytes {start}-{end}/{file_size}'
            resp.headers['Accept-Ranges']  = 'bytes'
            resp.headers['Content-Length'] = str(length)
            return resp
        else:
            def full_gen(path):
                with open(path, 'rb') as f:
                    while True:
                        buf = f.read(65536)
                        if not buf: break
                        yield buf
            resp = Response(full_gen(path), 200, mimetype=mime)
            resp.headers['Accept-Ranges']  = 'bytes'
            resp.headers['Content-Length'] = str(file_size)
            return resp
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/static/photos/<path:filename>')
@admin_required
def serve_photo(filename):
    return send_from_directory(PHOTOS_DIR, filename)

@app.route('/static/pdfs/<path:filename>')
@admin_required
def serve_pdf(filename):
    return send_from_directory(PDFS_DIR, filename)

# ══════════════════════════════════════════════════════════
#  AUTH
# ══════════════════════════════════════════════════════════
@app.route('/api/check-key', methods=['POST'])
def check_key():
    data = request.get_json(silent=True) or {}
    is_valid = data.get('key') == SECRET_KEY
    if is_valid:
        session.permanent = True
        session['admin'] = True
        session['bot_unlocked'] = True
        session['login_time'] = datetime.utcnow().isoformat()
    return jsonify({'valid': is_valid})

@app.route('/api/login', methods=['POST'])
@limiter.limit("10 per 15 minutes")
def login():
    data = request.get_json(silent=True) or {}
    u = data.get('username', '')
    p = data.get('password', '').encode('utf-8')
    
    admin = db.fetch_one("SELECT password_hash FROM admins WHERE username = ?", (u,))
    
    if admin and bcrypt.checkpw(p, admin['password_hash'].encode('utf-8')):
        session.permanent = True
        session['admin'] = True
        session['login_time'] = datetime.utcnow().isoformat()
        return jsonify({'success': True})
        
    return jsonify({'error': 'Invalid credentials'}), 401

@app.route('/api/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'success': True})

@app.route('/api/auth-status')
def auth_status():
    return jsonify({'admin': bool(session.get('admin'))})

# ══════════════════════════════════════════════════════════
#  DASHBOARD STATS
# ══════════════════════════════════════════════════════════
@app.route('/api/stats')
@admin_required
def stats():
    try:
        visitors = db.fetch_all("SELECT * FROM visitors ORDER BY time DESC")
        messages = db.fetch_all("SELECT * FROM messages")
        notes = db.fetch_one("SELECT COUNT(*) as c FROM notes")['c']
        passwords = db.fetch_one("SELECT COUNT(*) as c FROM passwords")['c']
        files = db.fetch_all("SELECT type FROM files")
        
        today = datetime.utcnow().date().isoformat()
        today_vis = sum(1 for v in visitors if (v.get('time') or '')[:10] == today)
        
        chart = {}
        for i in range(6, -1, -1):
            d = (datetime.utcnow() - timedelta(days=i))
            label = d.strftime('%d %b')
            chart[label] = 0
            
        for v in visitors:
            val = v.get('time')
            if not val: continue
            try:
                d = datetime.fromisoformat(val)
                label = d.strftime('%d %b')
                if label in chart:
                    chart[label] += 1
            except: pass

        return jsonify({
            'totalVisitors': len(visitors),
            'todayVisitors': today_vis,
            'totalMessages': len(messages),
            'unreadMessages': sum(1 for m in messages if not m.get('read')),
            'totalNotes': notes,
            'totalPasswords': passwords,
            'totalFiles': len(files),
            'photos': sum(1 for f in files if f.get('type') == 'photo'),
            'pdfs': sum(1 for f in files if f.get('type') == 'pdf'),
            'visitorChart': chart
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ══════════════════════════════════════════════════════════
#  REAL-TIME METRICS
# ══════════════════════════════════════════════════════════
@app.route('/api/metrics/system')
@admin_required
def metric_system():
    try:
        mem = psutil.virtual_memory()
        disk = psutil.disk_usage('/')
        net = psutil.net_io_counters()
        uptime_seconds = time.time() - psutil.boot_time()
        
        h = int(uptime_seconds // 3600)
        m = int((uptime_seconds % 3600) // 60)
        
        return jsonify({
            'cpu': psutil.cpu_percent(interval=0.1),
            'ram': mem.percent,
            'disk': disk.percent,
            'processes': len(psutil.pids()),
            'uptime': f"{h}h {m}m",
            'net_sent': net.bytes_sent,
            'net_recv': net.bytes_recv
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/metrics/server')
@admin_required
def metric_server():
    req_rate = len(server_metrics['requests_last_minute'])
    avg_resp = 0
    if server_metrics['total_requests'] > 0:
        avg_resp = (server_metrics['total_response_time'] / server_metrics['total_requests']) * 1000 # in ms
        
    return jsonify({
        'total_requests': server_metrics['total_requests'],
        'request_rate': f"{req_rate}/min",
        'error_count': server_metrics['error_count'],
        'avg_response_time': f"{avg_resp:.2f} ms"
    })

@app.route('/api/metrics/application')
@admin_required
def metric_application():
    try:
        visitors = db.fetch_one("SELECT COUNT(*) as c FROM visitors")['c']
        chatbots = db.fetch_one("SELECT COUNT(*) as c FROM chatbot_logs")['c']
        messages = db.fetch_one("SELECT COUNT(*) as c FROM messages")['c']
        # Active users could just be unique IPs today as a proxy
        today = datetime.utcnow().date().isoformat()
        active = db.fetch_one("SELECT COUNT(DISTINCT ip) as c FROM visitors WHERE substr(time, 1, 10) = ?", (today,))['c']
        
        return jsonify({
            'total_visitors': visitors,
            'chatbot_conversations': chatbots,
            'contact_messages': messages,
            'active_users': active
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ══════════════════════════════════════════════════════════
#  VISITORS
# ══════════════════════════════════════════════════════════
@app.route('/api/visitors')
@admin_required
def get_visitors():
    page = int(request.args.get('page', 1))
    limit = int(request.args.get('limit', 25))
    offset = (page - 1) * limit
    
    total = db.fetch_one("SELECT COUNT(*) as c FROM visitors")['c']
    data = db.fetch_all("SELECT * FROM visitors ORDER BY time DESC LIMIT ? OFFSET ?", (limit, offset))
    
    return jsonify({
        'total': total,
        'page': page, 'limit': limit,
        'data': data
    })

@app.route('/api/visitors', methods=['DELETE'])
@admin_required
def clear_visitors():
    db.execute_query("DELETE FROM visitors")
    return jsonify({'success': True})

# ══════════════════════════════════════════════════════════
#  CONTACT MESSAGES & CHATBOT LOGS
# ══════════════════════════════════════════════════════════
@app.route('/api/contact', methods=['POST'])
def contact():
    data = request.get_json(silent=True) or {}
    name = data.get('name','').strip()
    email = data.get('email','').strip()
    message = data.get('message','').strip()
    
    if not all([name, email, message]):
        return jsonify({'error': 'All fields required'}), 400
        
    m_id = str(uuid.uuid4())
    time_now = datetime.utcnow().isoformat()
    ip = request.headers.get('X-Forwarded-For', request.remote_addr or 'unknown')
    
    db.execute_query('''
        INSERT INTO messages (id, name, email, message, time, read, ip)
        VALUES (?, ?, ?, ?, ?, 0, ?)
    ''', (m_id, name, email, message, time_now, ip))
    
    return jsonify({'success': True})

@app.route('/api/chatbot_logs', methods=['POST'])
def log_chatbot():
    data = request.get_json(silent=True) or {}
    user_msg = data.get('user_message', '')
    ai_resp = data.get('ai_response', '')
    
    if user_msg and ai_resp:
        db.execute_query('''
            INSERT INTO chatbot_logs (id, user_message, ai_response, time, ip)
            VALUES (?, ?, ?, ?, ?)
        ''', (str(uuid.uuid4()), user_msg, ai_resp, datetime.utcnow().isoformat(), 
              request.headers.get('X-Forwarded-For', request.remote_addr or 'unknown')))
    return jsonify({'success': True})

@app.route('/api/messages')
@admin_required
def get_messages():
    return jsonify(db.fetch_all("SELECT * FROM messages ORDER BY time DESC"))

@app.route('/api/messages/<msg_id>/read', methods=['PATCH'])
@admin_required
def mark_read(msg_id):
    db.execute_query("UPDATE messages SET read = 1 WHERE id = ?", (msg_id,))
    return jsonify({'success': True})

@app.route('/api/messages/<msg_id>', methods=['DELETE'])
@admin_required
def del_message(msg_id):
    db.execute_query("DELETE FROM messages WHERE id = ?", (msg_id,))
    return jsonify({'success': True})

# ══════════════════════════════════════════════════════════
#  NOTES
# ══════════════════════════════════════════════════════════
@app.route('/api/notes')
@admin_required
def get_notes():
    return jsonify(db.fetch_all("SELECT * FROM notes ORDER BY updated DESC"))

@app.route('/api/notes', methods=['POST'])
@admin_required
def add_note():
    data = request.get_json(silent=True) or {}
    if not data.get('content','').strip():
        return jsonify({'error': 'Content required'}), 400
        
    n_id = str(uuid.uuid4())
    title = data.get('title','Untitled').strip() or 'Untitled'
    content = data['content'].strip()
    color = data.get('color','cyan')
    time_now = datetime.utcnow().isoformat()
    
    db.execute_query('''
        INSERT INTO notes (id, title, content, color, time, updated)
        VALUES (?, ?, ?, ?, ?, ?)
    ''', (n_id, title, content, color, time_now, time_now))
    
    return jsonify({'id': n_id, 'title': title, 'content': content, 
                    'color': color, 'time': time_now, 'updated': time_now})

@app.route('/api/notes/<note_id>', methods=['PUT'])
@admin_required
def update_note(note_id):
    data = request.get_json(silent=True) or {}
    
    # only update provided fields
    updates = []
    args = []
    for k in ('title', 'content', 'color'):
        if k in data:
            updates.append(f"{k} = ?")
            args.append(data[k])
            
    if updates:
        updates.append("updated = ?")
        args.append(datetime.utcnow().isoformat())
        args.append(note_id)
        
        query = f"UPDATE notes SET {', '.join(updates)} WHERE id = ?"
        db.execute_query(query, tuple(args))
        
    return jsonify({'success': True})

@app.route('/api/notes/<note_id>', methods=['DELETE'])
@admin_required
def del_note(note_id):
    db.execute_query("DELETE FROM notes WHERE id = ?", (note_id,))
    return jsonify({'success': True})

# ══════════════════════════════════════════════════════════
#  PASSWORDS
# ══════════════════════════════════════════════════════════
@app.route('/api/passwords')
@admin_required
def get_passwords():
    return jsonify(db.fetch_all("SELECT * FROM passwords ORDER BY time DESC"))

@app.route('/api/passwords', methods=['POST'])
@admin_required
def add_password():
    data = request.get_json(silent=True) or {}
    if not data.get('site') or not data.get('password'):
        return jsonify({'error': 'Site and password required'}), 400
        
    p_id = str(uuid.uuid4())
    site = data['site'].strip()
    username = data.get('username','').strip()
    password = data['password']
    category = data.get('category','General')
    notes = data.get('notes','').strip()
    time_now = datetime.utcnow().isoformat()
    
    db.execute_query('''
        INSERT INTO passwords (id, site, username, password, category, notes, time, updated)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ''', (p_id, site, username, password, category, notes, time_now, time_now))
    
    return jsonify({'id': p_id, 'site': site, 'username': username, 'password': password, 
                    'category': category, 'notes': notes, 'time': time_now})

@app.route('/api/passwords/<pw_id>', methods=['PUT'])
@admin_required
def update_password(pw_id):
    data = request.get_json(silent=True) or {}
    updates = []
    args = []
    for k in ('site','username','password','category','notes'):
        if k in data:
            updates.append(f"{k} = ?")
            args.append(data[k])
            
    if updates:
        updates.append("updated = ?")
        args.append(datetime.utcnow().isoformat())
        args.append(pw_id)
        
        query = f"UPDATE passwords SET {', '.join(updates)} WHERE id = ?"
        db.execute_query(query, tuple(args))
        
    return jsonify({'success': True})

@app.route('/api/passwords/<pw_id>', methods=['DELETE'])
@admin_required
def del_password(pw_id):
    db.execute_query("DELETE FROM passwords WHERE id = ?", (pw_id,))
    return jsonify({'success': True})

# ══════════════════════════════════════════════════════════
#  FILE STORAGE
# ══════════════════════════════════════════════════════════
@app.route('/api/upload', methods=['POST'])
@admin_required
def upload_files():
    uploaded_files = request.files.getlist('files')
    if not uploaded_files:
        return jsonify({'error': 'No files provided'}), 400

    results = []

    for file in uploaded_files:
        if not file.filename: continue
        mime = file.mimetype or mimetypes.guess_type(file.filename)[0] or ''
        is_img = mime in ALLOWED_IMG
        is_pdf = mime in ALLOWED_PDF
        if not (is_img or is_pdf): continue

        ext = os.path.splitext(secure_filename(file.filename))[1]
        new_name = str(uuid.uuid4()) + ext
        dest_dir = PHOTOS_DIR if is_img else PDFS_DIR
        dest = os.path.join(dest_dir, new_name)
        file.save(dest)
        size = os.path.getsize(dest)
        
        f_id = str(uuid.uuid4())
        f_type = 'photo' if is_img else 'pdf'
        path = f"static/{'photos' if is_img else 'pdfs'}/{new_name}"
        time_now = datetime.utcnow().isoformat()

        db.execute_query('''
            INSERT INTO files (id, original_name, filename, type, mimetype, size, path, time)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (f_id, file.filename, new_name, f_type, mime, size, path, time_now))
        
        results.append({
            'id': f_id, 'originalName': file.filename, 'filename': new_name,
            'type': f_type, 'mimetype': mime, 'size': size, 'path': path, 'time': time_now
        })

    return jsonify({'success': True, 'files': results})

@app.route('/api/files')
@admin_required
def get_files():
    ftype = request.args.get('type')
    if ftype:
        files = db.fetch_all("SELECT * FROM files WHERE type = ? ORDER BY time DESC", (ftype,))
    else:
        files = db.fetch_all("SELECT * FROM files ORDER BY time DESC")
    return jsonify(files)

@app.route('/api/files/<file_id>', methods=['DELETE'])
@admin_required
def del_file(file_id):
    entry = db.fetch_one("SELECT * FROM files WHERE id = ?", (file_id,))
    if entry:
        full = os.path.join(BASE_DIR, entry['path'])
        try: os.remove(full)
        except: pass
        db.execute_query("DELETE FROM files WHERE id = ?", (file_id,))
    return jsonify({'success': True})

# ══════════════════════════════════════════════════════════
#  GAMES LEADERBOARD
# ══════════════════════════════════════════════════════════
@app.route('/api/game/submit_score', methods=['POST'])
def submit_game_score():
    data = request.get_json(silent=True) or {}
    player_name = data.get('player_name', '').strip()[:15]
    game_name = data.get('game_name', '').strip()
    score = data.get('score', 0)
    
    if not player_name: player_name = "Anonymous"
    if not game_name or not isinstance(score, int):
        return jsonify({'error': 'Invalid data'}), 400
        
    s_id = str(uuid.uuid4())
    time_now = datetime.utcnow().isoformat()
    
    db.execute_query('''
        INSERT INTO game_scores (id, player_name, game_name, score, timestamp)
        VALUES (?, ?, ?, ?, ?)
    ''', (s_id, player_name, game_name, score, time_now))
    
    return jsonify({'success': True})

@app.route('/api/game/leaderboard')
def get_game_leaderboard():
    game_name = request.args.get('game_name', '')
    if not game_name:
        return jsonify({'error': 'Game name required'}), 400
        
    scores = db.fetch_all('''
        SELECT player_name, score 
        FROM game_scores 
        WHERE game_name = ? 
        ORDER BY score DESC 
        LIMIT 10
    ''', (game_name,))
    
    return jsonify(scores)

# ══════════════════════════════════════════════════════════
#  RUN
# ══════════════════════════════════════════════════════════
if __name__ == '__main__':
    print('\n🚀 TOXIBH FLASK SERVER (SQLite / Termux Cloudflare Deploy)')
    print('   Portfolio  :  http://localhost:8080')
    print('   Admin      :  http://localhost:8080/admin\n')
    app.run(host='0.0.0.0', port=8080, debug=False)
