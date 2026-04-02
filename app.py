# ═══════════════════════════════════════════════════════════
#  TOXIBH ADMIN  —  app.py  (Flask Backend + SQLite DB)
#  Run:  python app.py
# ═══════════════════════════════════════════════════════════

import os, uuid, bcrypt, mimetypes, json, time, re, logging
import urllib.request, urllib.error
from urllib.parse import parse_qs, urlparse, quote
import requests as req_session   # for Vidking proxy (streaming)
from datetime import datetime, timedelta
from functools import wraps
from logging.handlers import RotatingFileHandler
from flask import (Flask, request, jsonify, session,
                   send_from_directory, abort, g, redirect, Response)
from werkzeug.utils import secure_filename
from werkzeug.exceptions import HTTPException
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_session import Session
import psutil
import db
from werkzeug.middleware.proxy_fix import ProxyFix


class ForceHTTPSMiddleware:
    def __init__(self, app):
        self.app = app

    def __call__(self, environ, start_response):
        environ['wsgi.url_scheme'] = 'https'
        environ['HTTPS'] = 'on'
        return self.app(environ, start_response)

# ── APP SETUP ────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
app = Flask(
    __name__,
    static_folder=os.path.join(BASE_DIR, 'static'),
    static_url_path='/static',
    template_folder=os.path.join(BASE_DIR, 'templates')
)

# Trust Cloudflare forwarded headers so Flask sees the original HTTPS request.
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_prefix=1)
app.wsgi_app = ForceHTTPSMiddleware(app.wsgi_app)

# Termux/Android Session Optimizations
app.config['SECRET_KEY'] = 'toxibh_flask_secret_xR9pQz2026'
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(hours=8)
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SECURE'] = True
app.config['PREFERRED_URL_SCHEME'] = 'https'
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024  # 100 MB

limiter = Limiter(get_remote_address, app=app, default_limits=["500 per hour"])

# ── INIT DATABASE ────────────────────────────────────────
db.init_db()

# ── PATHS ─────────────────────────────────────────────────
BASE_DIR    = os.path.dirname(os.path.abspath(__file__))
DATA_ROOT   = db.DATA_ROOT
DB_DIR      = os.path.join(DATA_ROOT, 'databases')
VAULT_DIR   = os.path.join(DATA_ROOT, 'vault')
PHOTOS_DIR  = os.path.join(VAULT_DIR, 'photos')
PDFS_DIR    = os.path.join(VAULT_DIR, 'pdfs')
PROFILE_PHOTOS_DIR = os.path.join(BASE_DIR, 'static', 'profile_photos')
LOGS_DIR    = os.path.join(DATA_ROOT, 'logs')
SERVER_LOG  = os.path.join(LOGS_DIR, 'server.log')

for d in [DB_DIR, PHOTOS_DIR, PDFS_DIR, PROFILE_PHOTOS_DIR, LOGS_DIR]:
    os.makedirs(d, exist_ok=True)

logger = logging.getLogger('toxibh-control-center')
if not logger.handlers:
    logger.setLevel(logging.INFO)
    file_handler = RotatingFileHandler(SERVER_LOG, maxBytes=5 * 1024 * 1024, backupCount=3, encoding='utf-8')
    file_handler.setFormatter(logging.Formatter('%(asctime)s | %(levelname)s | %(message)s'))
    logger.addHandler(file_handler)
    logger.propagate = False

# ── TORRENT AUTO-CLEANUP (1-day TTL) ─────────────────────────
import threading, shutil

def _torrent_cleanup_loop():
    """Background thread: delete torrent files older than 24 hours."""
    TORRENT_DIR = os.path.expanduser(
        os.environ.get('QBITTORRENT_DOWNLOAD_DIR')
        or os.environ.get('ARIA2_DIR')
        or '~/torrents'
    )
    TTL_SECONDS = 24 * 60 * 60  # 1 day
    CHECK_EVERY = 60 * 60       # check every 1 hour
    while True:
        try:
            if os.path.isdir(TORRENT_DIR):
                now = time.time()
                deleted = []
                tracked_downloads = db.fetch_all(
                    'SELECT content_path FROM downloaded_torrents WHERE content_path IS NOT NULL AND trim(content_path) <> ""',
                    db_name='flix'
                )
                protected_paths = {
                    os.path.abspath(os.path.expanduser(row.get('content_path', '')))
                    for row in tracked_downloads
                    if row.get('content_path')
                }
                for entry in os.listdir(TORRENT_DIR):
                    full = os.path.join(TORRENT_DIR, entry)
                    try:
                        abs_full = os.path.abspath(full)
                        keep_entry = False
                        for protected in protected_paths:
                            try:
                                common = os.path.commonpath([abs_full, protected])
                                if common == abs_full or common == protected:
                                    keep_entry = True
                                    break
                            except Exception:
                                continue
                        if keep_entry:
                            continue

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
WORKER_URL = (os.environ.get('TMDB_METADATA_WORKER_URL') or 'https://snowy-bush-2e58.subhamj422.workers.dev').rstrip('/')

STREAM_SERVER_PRIORITY = [
    'vidfast',
    'vidking',
    'vidsrc',
    'vidsrc2',
    'embed_su',
    'autoembed',
    'superembed',
    '2embed',
    'multiembed',
    'smashystream',
    'vidsrc_to',
    'vidsrc_cc',
    'vidsrc_me',
]

STREAM_SERVER_LABELS = {
    'vidfast': 'VidFast',
    'vidking': 'VidKing',
    'vidsrc': 'VidSrc',
    'vidsrc2': 'VidSrc2',
    'embed_su': 'Embed.su',
    'autoembed': 'AutoEmbed',
    'superembed': 'SuperEmbed',
    '2embed': '2Embed',
    'multiembed': 'MultiEmbed',
    'smashystream': 'SmashyStream',
    'vidsrc_to': 'VidSrc.to',
    'vidsrc_cc': 'VidSrc.cc',
    'vidsrc_me': 'VidSrc.me',
}

DEFAULT_AVATAR_URLS = [
    '/static/default-avatar.png',
    '/static/avatars/avatar1.png',
    '/static/avatars/avatar2.png',
    '/static/avatars/avatar3.png',
    '/static/avatars/avatar4.png',
    '/static/avatars/avatar5.png',
]

ALLOWED_PROFILE_PHOTO_EXTENSIONS = {'png', 'jpg', 'jpeg', 'webp'}
ALLOWED_PROFILE_PHOTO_MIME_TYPES = {'image/png', 'image/jpeg', 'image/webp'}
MAX_PROFILE_PHOTO_BYTES = 2 * 1024 * 1024

def log_admin_action(action, detail=''):
    actor = session.get('admin') and 'admin' or 'guest'
    logger.info(f'ADMIN_ACTION | actor={actor} | action={action} | detail={detail}')

# ── AUTH DECORATOR ────────────────────────────────────────
def admin_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not session.get('admin'):
            return jsonify({'error': 'Unauthorized'}), 401
        return f(*args, **kwargs)
    return decorated

@app.errorhandler(Exception)
def handle_unexpected_error(ex):
    if isinstance(ex, HTTPException):
        return ex

    ip = request.headers.get('X-Forwarded-For', request.remote_addr or 'unknown')
    now_iso = datetime.utcnow().isoformat()
    logger.exception(f'SERVER_ERROR | {request.method} {request.path} | ip={ip} | error={str(ex)}')
    db.execute_query('''
        INSERT INTO error_logs (id, path, method, status_code, error_message, ip, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ''', (str(uuid.uuid4()), request.path, request.method, 500, str(ex), ip, now_iso), db_name='analytics')

    if request.path.startswith('/api/'):
        return jsonify({'error': 'Internal server error'}), 500
    return 'Internal server error', 500

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

        ip = request.headers.get('X-Forwarded-For', request.remote_addr or 'unknown')
        ua = request.headers.get('User-Agent', 'unknown')
        now_iso = datetime.utcnow().isoformat()

        db.execute_query('''
            INSERT INTO request_logs (id, method, path, status_code, response_ms, ip, user_agent, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            str(uuid.uuid4()), request.method, request.path, response.status_code,
            round(duration * 1000, 2), ip, ua, now_iso
        ), db_name='analytics')

        if response.status_code >= 400:
            db.execute_query('''
                INSERT INTO error_logs (id, path, method, status_code, error_message, ip, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (
                str(uuid.uuid4()), request.path, request.method, response.status_code,
                response.status, ip, now_iso
            ), db_name='analytics')
            logger.error(f"API_ERROR | {request.method} {request.path} | status={response.status_code} | ip={ip}")
    return response

# ── VISITOR TRACKER ───────────────────────────────────────
@app.before_request
def track_visitor():
    if request.path in ('/', '/index.html'):
        v_id = str(uuid.uuid4())
        ip = request.headers.get('X-Forwarded-For', request.remote_addr or 'unknown')
        ua = request.headers.get('User-Agent', 'unknown')
        ref = request.headers.get('Referer', 'direct')
        country = (
            request.headers.get('CF-IPCountry')
            or request.headers.get('X-Country-Code')
            or request.headers.get('X-Country')
            or 'unknown'
        )
        time_now = datetime.utcnow().isoformat()
        day_key = datetime.utcnow().date().isoformat()
        
        db.execute_query('''
            INSERT INTO visitors (id, ip, user_agent, referrer, page, country, time)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (v_id, ip, ua, ref, request.path, country, time_now))
        db.execute_query('''
            INSERT INTO daily_visitors (visit_date, total_count)
            VALUES (?, 1)
            ON CONFLICT(visit_date) DO UPDATE SET total_count = total_count + 1
        ''', (day_key,), db_name='analytics')

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

@app.route('/movies/watch')
def movies_watch_alias():
    return send_from_directory('templates/movies', 'watch.html')

@app.route('/movies/tvshows')
def movies_tvshows():
    return send_from_directory('templates/movies', 'tvshows.html')

@app.route('/movies/watch-tv')
def movies_watch_tv():
    return send_from_directory('templates/movies', 'watch-tv.html')

@app.route('/profile')
def profile_dashboard_page():
    return send_from_directory('templates/movies', 'profile.html')

@app.route('/movies/history')
def movies_history_page():
    return send_from_directory('templates/movies', 'history.html')

@app.route('/movies/torrent')
def movies_torrent():
    return send_from_directory('templates/movies', 'torrent.html')

@app.route('/movies/<path:filename>')
def movies_static(filename):
    return send_from_directory('templates/movies', filename)

@app.route('/js/<path:filename>')
def root_js_static(filename):
    return send_from_directory('js', filename)

# ── TOXIBHFLIX MANAGEMENT API ─────────────────────────────────────

def _normalize_profile(profile_row):
    if not profile_row:
        return None
    avatar_url = (profile_row.get('avatar_url') or profile_row.get('avatar') or DEFAULT_AVATAR_URLS[0]).strip()
    return {
        'id': profile_row.get('id'),
        'name': profile_row.get('profile_name'),
        'avatar_url': avatar_url,
        'avatar': avatar_url,
        'emoji': avatar_url,
        'is_default': bool(profile_row.get('is_default')),
        'created_at': profile_row.get('created_at')
    }


def _sanitize_avatar_url(raw_avatar):
    avatar_url = (raw_avatar or '').strip()
    if avatar_url.startswith('/static/profile_photos/'):
        return avatar_url
    if avatar_url in DEFAULT_AVATAR_URLS:
        return avatar_url

    # Migrate legacy absolute paths stored in DB (Windows/Linux) to static URL paths.
    lower_avatar = avatar_url.replace('\\', '/').lower()
    if '/static/profile_photos/' in lower_avatar:
        filename = os.path.basename(avatar_url.replace('\\', '/'))
        if filename:
            return f'/static/profile_photos/{filename}'

    return DEFAULT_AVATAR_URLS[0]


def _is_allowed_profile_photo(filename):
    if not filename:
        return False
    ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''
    return ext in ALLOWED_PROFILE_PHOTO_EXTENSIONS

def _default_profile():
    row = db.fetch_one(
        'SELECT * FROM profiles WHERE user_id = ? AND is_default = 1 ORDER BY created_at ASC LIMIT 1',
        ('local_user',),
        db_name='flix'
    )
    if row:
        return row
    row = db.fetch_one(
        'SELECT * FROM profiles WHERE user_id = ? AND lower(profile_name) = lower(?) ORDER BY created_at ASC LIMIT 1',
        ('local_user', 'Guest'),
        db_name='flix'
    )
    if row:
        db.execute_query('UPDATE profiles SET is_default = 0 WHERE user_id = ?', ('local_user',), db_name='flix')
        db.execute_query('UPDATE profiles SET is_default = 1 WHERE id = ?', (row.get('id'),), db_name='flix')
        return row
    return db.fetch_one('SELECT * FROM profiles WHERE user_id = ? ORDER BY created_at ASC LIMIT 1', ('local_user',), db_name='flix')


def get_active_profile(profile_id=None, profile_name=None):
    pid = (profile_id or '').strip() or (session.get('profile_id') or '').strip()
    pname = (profile_name or '').strip()

    row = None
    if pid:
        row = db.fetch_one('SELECT * FROM profiles WHERE id = ?', (pid,), db_name='flix')

    if not row and pname:
        row = db.fetch_one(
            'SELECT * FROM profiles WHERE user_id = ? AND lower(trim(profile_name)) = lower(trim(?))',
            ('local_user', pname),
            db_name='flix'
        )

    if not row:
        row = _default_profile()

    if row and row.get('id'):
        session['profile_id'] = row.get('id')
    return row


def _resolve_profile(profile_id=None, profile_name=None, avatar='👤'):
    # Backward-compatible wrapper used by existing routes.
    return get_active_profile(profile_id=profile_id, profile_name=profile_name)

def _float_or_zero(value):
    try:
        return float(value)
    except Exception:
        return 0.0

def _int_or_zero(value):
    try:
        return int(float(value))
    except Exception:
        return 0


def _poster_path_to_url(value):
    raw = (value or '').strip()
    if not raw:
        return '/static/no-poster.png'
    if raw.startswith('/static/') or raw.startswith('/tmdb_image'):
        return raw
    if raw.startswith('/'):
        abs_url = f'https://image.tmdb.org/t/p/w500{raw}'
        return f"/tmdb_image?url={urllib.parse.quote(abs_url, safe='')}"
    if 'image.tmdb.org/t/p/' in raw:
        return f"/tmdb_image?url={urllib.parse.quote(raw, safe='')}"
    return raw


def _enrich_watch_item(item):
    if not item:
        return item

    tmdb_id = str(item.get('tmdb_id') or item.get('tmdbId') or '').strip()
    media_type = (item.get('media_type') or item.get('mediaType') or 'movie').strip().lower()
    title = (item.get('title') or '').strip()
    poster_path = (item.get('poster_path') or item.get('posterPath') or item.get('poster') or '').strip()

    if tmdb_id and (not title or not poster_path):
        try:
            details = _tmdb_fetch(f'/{media_type}/{tmdb_id}')
            if not title:
                title = (details.get('title') or details.get('name') or '').strip()
            if not poster_path:
                poster_path = (details.get('poster_path') or '').strip()
        except Exception:
            pass

    poster_url = _poster_path_to_url(poster_path)
    if title:
        item['title'] = title
    item['poster_path'] = poster_path
    item['posterPath'] = poster_path
    item['poster'] = poster_url
    item['tmdb_id'] = tmdb_id or item.get('tmdb_id')
    item['media_type'] = media_type
    item['tmdbId'] = item.get('tmdbId') or item.get('tmdb_id')
    item['mediaType'] = item.get('mediaType') or item.get('media_type')
    return item

@app.route('/api/movies/profiles', methods=['GET'])
def api_movies_profiles_get():
    rows = db.fetch_all('SELECT id, profile_name, avatar, avatar_url, is_default, created_at FROM profiles ORDER BY is_default DESC, created_at ASC')
    if rows:
        return jsonify([_normalize_profile(r) for r in rows])

    defaults = [
        {'id': 'guest', 'name': 'Guest', 'avatar_url': DEFAULT_AVATAR_URLS[0]},
    ]
    now = datetime.utcnow().isoformat()
    for p in defaults:
        name = (p.get('name') or '').strip()
        if not name:
            continue
        db.execute_query(
            'INSERT OR IGNORE INTO profiles (id, user_id, profile_name, avatar, avatar_url, is_default, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
            (
                p.get('id') or str(uuid.uuid4()),
                'local_user',
                name,
                _sanitize_avatar_url(p.get('avatar_url')),
                _sanitize_avatar_url(p.get('avatar_url')),
                1 if name.lower() == 'guest' else 0,
                now,
            )
        )

    rows = db.fetch_all('SELECT id, profile_name, avatar, avatar_url, is_default, created_at FROM profiles ORDER BY is_default DESC, created_at ASC')
    return jsonify([_normalize_profile(r) for r in rows])

@app.route('/api/profiles', methods=['GET'])
def api_profiles_get():
    rows = db.fetch_all('SELECT id, profile_name, avatar, avatar_url, is_default, created_at FROM profiles ORDER BY is_default DESC, created_at ASC', db_name='flix')
    return jsonify([
        {
            'id': r.get('id'),
            'name': r.get('profile_name'),
            'avatar_url': _sanitize_avatar_url(r.get('avatar_url') or r.get('avatar')),
            'avatar': _sanitize_avatar_url(r.get('avatar_url') or r.get('avatar')),
            'is_default': bool(r.get('is_default')),
            'created_at': r.get('created_at')
        }
        for r in rows
    ])


@app.route('/api/profile/active', methods=['GET'])
def api_profile_active_get():
    profile = get_active_profile(
        profile_id=request.args.get('profile_id') or request.headers.get('X-Profile-Id'),
        profile_name=request.args.get('profile_name')
    )
    if not profile:
        return jsonify({'error': 'No profile available'}), 404
    return jsonify({'profile': _normalize_profile(profile)})


@app.route('/api/profile/active', methods=['POST'])
def api_profile_active_set():
    data = request.get_json(silent=True) or {}
    profile = get_active_profile(profile_id=data.get('profile_id'), profile_name=data.get('profile_name'))
    if not profile:
        return jsonify({'error': 'Profile not found'}), 404
    return jsonify({'success': True, 'profile': _normalize_profile(profile)})

@app.route('/api/profiles/create', methods=['POST'])
def api_profiles_create():
    data = request.get_json(silent=True) or {}
    profile_name = (data.get('name') or data.get('profile_name') or '').strip()
    avatar_url = _sanitize_avatar_url(data.get('avatar_url') or data.get('avatar') or data.get('emoji'))

    if not profile_name:
        return jsonify({'error': 'name is required'}), 400

    existing = db.fetch_one(
        'SELECT id FROM profiles WHERE user_id = ? AND lower(profile_name) = lower(?)',
        ('local_user', profile_name)
    )
    if existing:
        return jsonify({'error': 'Profile already exists'}), 409

    profile_id = str(uuid.uuid4())
    created_at = datetime.utcnow().isoformat()
    db.execute_query(
        'INSERT INTO profiles (id, user_id, profile_name, avatar, avatar_url, is_default, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        (profile_id, 'local_user', profile_name, avatar_url, avatar_url, 0, created_at),
        db_name='flix'
    )

    return jsonify({
        'success': True,
        'profile': {
            'id': profile_id,
            'name': profile_name,
            'avatar_url': avatar_url,
            'avatar': avatar_url,
            'created_at': created_at
        }
    })


@app.route('/api/profiles/update', methods=['POST'])
def api_profiles_update():
    data = request.get_json(silent=True) or {}
    profile_id = (data.get('id') or data.get('profile_id') or '').strip()
    profile_name = (data.get('name') or data.get('profile_name') or '').strip()
    requested_avatar = data.get('avatar_url') or data.get('avatar') or data.get('emoji')

    if not profile_id:
        return jsonify({'error': 'profile_id is required'}), 400

    existing = db.fetch_one('SELECT id, profile_name, avatar, avatar_url, is_default FROM profiles WHERE id = ? AND user_id = ?', (profile_id, 'local_user'), db_name='flix')
    if not existing:
        return jsonify({'error': 'Profile not found'}), 404

    update_name = profile_name or existing.get('profile_name')
    duplicate = db.fetch_one(
        'SELECT id FROM profiles WHERE user_id = ? AND lower(trim(profile_name)) = lower(trim(?)) AND id <> ?',
        ('local_user', update_name, profile_id),
        db_name='flix'
    )
    if duplicate:
        return jsonify({'error': 'Profile name already exists'}), 409

    avatar_url = _sanitize_avatar_url(requested_avatar) if requested_avatar else _sanitize_avatar_url(existing.get('avatar_url') or existing.get('avatar'))

    db.execute_query(
        'UPDATE profiles SET profile_name = ?, avatar = ?, avatar_url = ? WHERE id = ?',
        (update_name, avatar_url, avatar_url, profile_id),
        db_name='flix'
    )
    row = db.fetch_one('SELECT id, profile_name, avatar, avatar_url, is_default, created_at FROM profiles WHERE id = ?', (profile_id,), db_name='flix')
    if row and row.get('is_default'):
        session['profile_id'] = row.get('id')
    return jsonify({'success': True, 'profile': _normalize_profile(row)})

@app.route('/api/movies/profile/resolve', methods=['POST'])
def api_movies_profile_resolve():
    data = request.get_json(silent=True) or {}
    profile = get_active_profile(
        profile_id=data.get('profile_id'),
        profile_name=data.get('profile_name')
    )
    if not profile:
        return jsonify({'error': 'Unable to resolve profile'}), 400
    return jsonify({'profile': _normalize_profile(profile)})


@app.route('/api/upload-profile-photo', methods=['POST'])
def api_upload_profile_photo():
    profile_id = (request.form.get('profile_id') or '').strip()
    if not profile_id:
        return jsonify({'error': 'profile_id is required'}), 400

    profile = db.fetch_one('SELECT id FROM profiles WHERE id = ? AND user_id = ?', (profile_id, 'local_user'), db_name='flix')
    if not profile:
        return jsonify({'error': 'Profile not found'}), 404

    file = request.files.get('photo')
    if not file or not file.filename:
        return jsonify({'error': 'photo file is required'}), 400

    safe_name = secure_filename(file.filename)
    if not _is_allowed_profile_photo(safe_name):
        return jsonify({'error': 'Only PNG, JPG, JPEG, WEBP are allowed'}), 400

    if (file.mimetype or '').lower() not in ALLOWED_PROFILE_PHOTO_MIME_TYPES:
        return jsonify({'error': 'Invalid image content type'}), 400

    content_length = request.content_length or 0
    if content_length > MAX_PROFILE_PHOTO_BYTES + 1024:
        return jsonify({'error': 'File size exceeds 2MB'}), 413

    file.stream.seek(0, os.SEEK_END)
    file_size = file.stream.tell()
    file.stream.seek(0)
    if file_size > MAX_PROFILE_PHOTO_BYTES:
        return jsonify({'error': 'File size exceeds 2MB'}), 413

    ext = safe_name.rsplit('.', 1)[-1].lower()
    timestamp = int(time.time())
    filename = f'profile_{profile_id}_{timestamp}.{ext}'
    abs_path = os.path.join(PROFILE_PHOTOS_DIR, filename)
    file.save(abs_path)

    avatar_url = f'/static/profile_photos/{filename}'
    db.execute_query(
        'UPDATE profiles SET avatar = ?, avatar_url = ? WHERE id = ?',
        (avatar_url, avatar_url, profile_id),
        db_name='flix'
    )

    return jsonify({'success': True, 'avatar_url': avatar_url, 'image_url': avatar_url})

@app.route('/api/movies/profiles', methods=['POST'])
@admin_required
def api_movies_profiles_save():
    data = request.get_json()
    if not isinstance(data, list):
        return jsonify({'error': 'Expected a list of profiles'}), 400

    now = datetime.utcnow().isoformat()
    for p in data:
        profile_name = (p.get('name') or '').strip()
        avatar_url = _sanitize_avatar_url(p.get('avatar_url') or p.get('avatar') or p.get('emoji'))
        if not profile_name:
            continue
        existing = db.fetch_one(
            'SELECT id FROM profiles WHERE user_id = ? AND lower(profile_name) = lower(?)',
            ('local_user', profile_name)
        )
        if existing:
            db.execute_query('UPDATE profiles SET avatar = ?, avatar_url = ? WHERE id = ?', (avatar_url, avatar_url, existing['id']), db_name='flix')
        else:
            db.execute_query(
                'INSERT INTO profiles (id, user_id, profile_name, avatar, avatar_url, is_default, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
                (str(uuid.uuid4()), 'local_user', profile_name, avatar_url, avatar_url, 0, now),
                db_name='flix'
            )
    log_admin_action('profiles_bulk_save', f'count={len(data)}')
    return jsonify({'success': True})

@app.route('/api/admin/profile/create', methods=['POST'])
@admin_required
def api_admin_profile_create():
    data = request.get_json(silent=True) or {}
    profile_name = (data.get('name') or data.get('profile_name') or '').strip()
    avatar_url = _sanitize_avatar_url(data.get('avatar_url') or data.get('avatar') or data.get('emoji'))

    if not profile_name:
        return jsonify({'error': 'profile_name is required'}), 400

    existing = db.fetch_one(
        'SELECT id FROM profiles WHERE user_id = ? AND lower(profile_name) = lower(?)',
        ('local_user', profile_name)
    )
    if existing:
        return jsonify({'error': 'Profile already exists'}), 409

    profile_id = str(uuid.uuid4())
    created_at = datetime.utcnow().isoformat()
    db.execute_query(
        'INSERT INTO profiles (id, user_id, profile_name, avatar, avatar_url, is_default, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        (profile_id, 'local_user', profile_name, avatar_url, avatar_url, 0, created_at),
        db_name='flix'
    )
    row = db.fetch_one('SELECT id, profile_name, avatar, avatar_url, created_at FROM profiles WHERE id = ?', (profile_id,))
    log_admin_action('profile_create', f'id={profile_id},name={profile_name}')
    return jsonify({'success': True, 'profile': _normalize_profile(row)})

@app.route('/api/admin/profile/update', methods=['POST'])
@admin_required
def api_admin_profile_update():
    data = request.get_json(silent=True) or {}
    profile_id = (data.get('id') or data.get('profile_id') or '').strip()
    profile_name = (data.get('name') or data.get('profile_name') or '').strip()
    avatar_url = _sanitize_avatar_url(data.get('avatar_url') or data.get('avatar') or data.get('emoji'))

    if not profile_id:
        return jsonify({'error': 'profile_id is required'}), 400
    if not profile_name:
        return jsonify({'error': 'profile_name is required'}), 400

    existing = db.fetch_one('SELECT id FROM profiles WHERE id = ?', (profile_id,))
    if not existing:
        return jsonify({'error': 'Profile not found'}), 404

    db.execute_query(
        'UPDATE profiles SET profile_name = ?, avatar = ?, avatar_url = ? WHERE id = ?',
        (profile_name, avatar_url, avatar_url, profile_id),
        db_name='flix'
    )
    row = db.fetch_one('SELECT id, profile_name, avatar, avatar_url, created_at FROM profiles WHERE id = ?', (profile_id,))
    log_admin_action('profile_update', f'id={profile_id},name={profile_name}')
    return jsonify({'success': True, 'profile': _normalize_profile(row)})

@app.route('/api/admin/profile/delete', methods=['POST'])
@admin_required
def api_admin_profile_delete():
    data = request.get_json(silent=True) or {}
    profile_id = (data.get('id') or data.get('profile_id') or '').strip()
    if not profile_id:
        return jsonify({'error': 'profile_id is required'}), 400

    existing = db.fetch_one('SELECT id FROM profiles WHERE id = ?', (profile_id,))
    if not existing:
        return jsonify({'error': 'Profile not found'}), 404

    default_row = db.fetch_one('SELECT id FROM profiles WHERE is_default = 1 LIMIT 1', db_name='flix')
    if default_row and default_row.get('id') == profile_id:
        return jsonify({'error': 'Default profile cannot be deleted'}), 400

    db.execute_query('DELETE FROM watch_history WHERE profile_id = ?', (profile_id,), db_name='flix')
    db.execute_query('DELETE FROM resume_progress WHERE profile_id = ?', (profile_id,), db_name='flix')
    db.execute_query('DELETE FROM watchlist WHERE profile_id = ?', (profile_id,), db_name='flix')
    db.execute_query('DELETE FROM watch_progress WHERE profile_id = ?', (profile_id,), db_name='flix')
    db.execute_query('DELETE FROM profiles WHERE id = ?', (profile_id,), db_name='flix')
    log_admin_action('profile_delete', f'id={profile_id}')
    return jsonify({'success': True})

def _save_watch_progress(data, explicit_profile=None):
    content_id = str(data.get('content_id') or data.get('tmdb_id') or '').strip()
    content_type = (data.get('content_type') or data.get('media_type') or 'movie').strip().lower()
    if content_type not in ('movie', 'tv'):
        content_type = 'movie'
    if not content_id:
        return None, {'error': 'content_id is required'}, 400

    profile = explicit_profile or get_active_profile(
        profile_id=data.get('profile_id') or request.headers.get('X-Profile-Id'),
        profile_name=data.get('profile_name')
    )
    if not profile:
        return None, {'error': 'profile is required'}, 400

    ts = max(0, _int_or_zero(data.get('timestamp') or data.get('progress_seconds')))
    duration = max(0, _int_or_zero(data.get('duration') or data.get('duration_seconds')))
    pct = _float_or_zero(data.get('progress_percent'))
    if pct <= 0 and duration > 0:
        pct = (ts / duration) * 100.0
    pct = max(0.0, min(100.0, pct))
    completed = 1 if pct >= 95.0 else 0

    season = data.get('season')
    episode = data.get('episode')
    title = (data.get('title') or '').strip()
    poster = (data.get('poster') or data.get('poster_path') or '').strip()
    server_used = (data.get('server_used') or '').strip() or None
    skip_intro_time = data.get('skip_intro_time')
    now = datetime.utcnow().isoformat()

    # Legacy compatibility for existing APIs/UI.
    db.execute_query('''
        INSERT INTO resume_progress
        (profile_id, content_id, content_type, title, poster, season, episode, timestamp, duration, progress_percent, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(profile_id, content_id, content_type)
        DO UPDATE SET
            title = excluded.title,
            poster = excluded.poster,
            season = excluded.season,
            episode = excluded.episode,
            timestamp = excluded.timestamp,
            duration = excluded.duration,
            progress_percent = excluded.progress_percent,
            updated_at = excluded.updated_at
    ''', (profile['id'], content_id, content_type, title, poster, season, episode, ts, duration, pct, now), db_name='flix')

    identity = db.fetch_one('''
        SELECT id FROM watch_progress
        WHERE profile_id = ?
          AND tmdb_id = ?
          AND media_type = ?
          AND COALESCE(season, -1) = COALESCE(?, -1)
          AND COALESCE(episode, -1) = COALESCE(?, -1)
        LIMIT 1
    ''', (profile['id'], content_id, content_type, season, episode), db_name='flix')

    progress_id = identity.get('id') if identity else str(uuid.uuid4())
    db.execute_query('''
        INSERT INTO watch_progress
        (id, profile_id, tmdb_id, media_type, title, poster_path, season, episode, progress_seconds, duration_seconds, last_watched, completed, server_used, skip_intro_time, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id)
        DO UPDATE SET
            title = COALESCE(NULLIF(excluded.title, ''), watch_progress.title),
            poster_path = COALESCE(NULLIF(excluded.poster_path, ''), watch_progress.poster_path),
            progress_seconds = excluded.progress_seconds,
            duration_seconds = excluded.duration_seconds,
            last_watched = excluded.last_watched,
            completed = excluded.completed,
            server_used = COALESCE(excluded.server_used, watch_progress.server_used),
            skip_intro_time = COALESCE(excluded.skip_intro_time, watch_progress.skip_intro_time),
            updated_at = excluded.updated_at
    ''', (
        progress_id, profile['id'], content_id, content_type, title, poster, season, episode, ts, duration,
        now, completed, server_used, skip_intro_time, now
    ), db_name='flix')

    db.execute_query('''
        INSERT INTO watch_history
        (id, profile_id, content_id, content_type, title, poster_path, timestamp, duration, duration_seconds, progress, last_watched, tmdb_id, media_type, season, episode, watched_at, progress_seconds)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        str(uuid.uuid4()), profile['id'], content_id, content_type, title, poster, ts, duration, duration,
        pct / 100.0, now, content_id, content_type, season, episode, now, ts
    ), db_name='flix')

    payload = {
        'profile_id': profile['id'],
        'tmdb_id': content_id,
        'media_type': content_type,
        'season': season,
        'episode': episode,
        'progress_seconds': ts,
        'duration_seconds': duration,
        'completed': bool(completed),
        'server_used': server_used,
        'skip_intro_time': skip_intro_time,
        'updated_at': now,
    }
    return payload, {'success': True, 'progress': payload}, 200


def _map_watch_progress_row(row):
    if not row:
        return None
    duration = max(0, _int_or_zero(row.get('duration_seconds')))
    ts = max(0, _int_or_zero(row.get('progress_seconds')))
    pct = (float(ts) / duration * 100.0) if duration > 0 else 0.0
    return {
        'tmdbId': row.get('tmdb_id'),
        'mediaType': row.get('media_type'),
        'tmdb_id': row.get('tmdb_id'),
        'media_type': row.get('media_type'),
        'title': row.get('title') or '',
        'posterPath': row.get('poster_path') or '',
        'poster_path': row.get('poster_path') or '',
        'poster': _poster_path_to_url(row.get('poster_path') or ''),
        'season': row.get('season'),
        'episode': row.get('episode'),
        'timestamp': ts,
        'duration': duration,
        'progress': max(0.0, min(1.0, pct / 100.0)),
        'progressPercent': max(0.0, min(100.0, pct)),
        'completed': bool(row.get('completed')),
        'serverUsed': row.get('server_used'),
        'skipIntroTime': row.get('skip_intro_time'),
        'savedAt': int(datetime.fromisoformat(row.get('updated_at')).timestamp() * 1000) if row.get('updated_at') else 0,
    }


@app.route('/api/movies/resume-progress', methods=['POST'])
def api_movies_resume_progress_save():
    data = request.get_json(silent=True) or {}
    _, body, status = _save_watch_progress(data)
    return jsonify(body), status


@app.route('/api/movies/resume-progress', methods=['GET'])
def api_movies_resume_progress_get():
    content_id = str(request.args.get('content_id', '')).strip()
    content_type = (request.args.get('content_type', 'movie') or 'movie').strip().lower()
    profile = get_active_profile(
        profile_id=request.args.get('profile_id') or request.headers.get('X-Profile-Id'),
        profile_name=request.args.get('profile_name')
    )
    if not profile:
        return jsonify({'progress': None})

    if content_id:
        row = db.fetch_one('''
            SELECT * FROM watch_progress
            WHERE profile_id = ? AND tmdb_id = ? AND media_type = ?
            ORDER BY updated_at DESC
            LIMIT 1
        ''', (profile['id'], content_id, content_type), db_name='flix')
        mapped = _map_watch_progress_row(row)
        if not mapped:
            return jsonify({'progress': None})
        return jsonify({'progress': {
            'content_id': content_id,
            'content_type': content_type,
            'season': mapped.get('season'),
            'episode': mapped.get('episode'),
            'timestamp': mapped.get('timestamp'),
            'duration': mapped.get('duration'),
            'progress_percent': mapped.get('progressPercent'),
            'updated_at': row.get('updated_at')
        }})

    rows = db.fetch_all('''
        SELECT * FROM watch_progress
        WHERE profile_id = ?
        ORDER BY updated_at DESC
        LIMIT 100
    ''', (profile['id'],), db_name='flix')

    items = []
    for row in rows:
        mapped = _map_watch_progress_row(row)
        if not mapped:
            continue
        items.append({
            'content_id': mapped.get('tmdbId'),
            'content_type': mapped.get('mediaType'),
            'season': mapped.get('season'),
            'episode': mapped.get('episode'),
            'timestamp': mapped.get('timestamp'),
            'duration': mapped.get('duration'),
            'progress_percent': mapped.get('progressPercent'),
            'updated_at': row.get('updated_at')
        })
    return jsonify({'items': items})


@app.route('/api/movies/continue-watching', methods=['GET'])
def api_movies_continue_watching():
    profile = get_active_profile(
        profile_id=request.args.get('profile_id') or request.headers.get('X-Profile-Id'),
        profile_name=request.args.get('profile_name')
    )
    if not profile:
        return jsonify({'items': []})

    rows = db.fetch_all('''
        SELECT *
        FROM watch_progress
        WHERE profile_id = ?
          AND progress_seconds > 1
          AND completed = 0
        ORDER BY updated_at DESC
        LIMIT 80
    ''', (profile['id'],), db_name='flix')

    items = []
    for r in rows:
        mapped = _map_watch_progress_row(r)
        if not mapped:
            continue
        if mapped.get('progressPercent', 0.0) >= 95.0:
            continue
        items.append(_enrich_watch_item(mapped))
    return jsonify({'items': items})


@app.route('/api/progress', methods=['POST'])
def api_progress_save():
    data = request.get_json(silent=True) or {}
    _, body, status = _save_watch_progress(data)
    return jsonify(body), status


@app.route('/api/progress/<profile_id>/<tmdb_id>', methods=['GET'])
def api_progress_get(profile_id, tmdb_id):
    media_type = (request.args.get('media_type') or request.args.get('content_type') or 'movie').strip().lower()
    if media_type not in ('movie', 'tv'):
        media_type = 'movie'

    row = db.fetch_one('''
        SELECT *
        FROM watch_progress
        WHERE profile_id = ? AND tmdb_id = ? AND media_type = ?
        ORDER BY updated_at DESC
        LIMIT 1
    ''', (profile_id, str(tmdb_id), media_type), db_name='flix')
    mapped = _map_watch_progress_row(row)
    return jsonify({'progress': mapped})


@app.route('/api/continue-watching/<profile_id>', methods=['GET'])
def api_continue_watching(profile_id):
    rows = db.fetch_all('''
        SELECT *
        FROM watch_progress
        WHERE profile_id = ?
          AND progress_seconds > 1
          AND completed = 0
        ORDER BY updated_at DESC
        LIMIT 80
    ''', (profile_id,), db_name='flix')

    items = []
    for row in rows:
        mapped = _map_watch_progress_row(row)
        if not mapped:
            continue
        if mapped.get('progressPercent', 0.0) >= 95.0:
            continue
        items.append(_enrich_watch_item(mapped))
    return jsonify({'items': items})


@app.route('/api/recently-watched/<profile_id>', methods=['GET'])
def api_recently_watched(profile_id):
    rows = db.fetch_all('''
        SELECT * FROM watch_progress
        WHERE profile_id = ?
        ORDER BY last_watched DESC
        LIMIT 60
    ''', (profile_id,), db_name='flix')
    items = [_enrich_watch_item(m) for m in (_map_watch_progress_row(r) for r in rows) if m]
    return jsonify({'items': items})


@app.route('/api/watch-history/<profile_id>', methods=['GET'])
def api_watch_history(profile_id):
    rows = db.fetch_all('''
        SELECT id, profile_id, COALESCE(tmdb_id, content_id) AS tmdb_id,
               COALESCE(media_type, content_type) AS media_type,
               COALESCE(title, '') AS title,
               COALESCE(poster_path, '') AS poster_path,
               season, episode, COALESCE(watched_at, last_watched) AS watched_at,
               COALESCE(progress_seconds, timestamp, 0) AS progress_seconds,
               COALESCE(duration_seconds, duration, 0) AS duration_seconds
        FROM watch_history
        WHERE profile_id = ?
        ORDER BY COALESCE(watched_at, last_watched) DESC
        LIMIT 500
    ''', (profile_id,), db_name='flix')
    return jsonify({'items': [_enrich_watch_item(r) for r in rows]})


@app.route('/api/history', methods=['POST'])
def api_history_save():
    data = request.get_json(silent=True) or {}
    profile = get_active_profile(
        profile_id=data.get('profile_id') or request.headers.get('X-Profile-Id'),
        profile_name=data.get('profile_name')
    )
    if not profile:
        return jsonify({'error': 'profile is required'}), 400

    tmdb_id = str(data.get('tmdb_id') or data.get('content_id') or '').strip()
    media_type = (data.get('media_type') or data.get('content_type') or 'movie').strip().lower()
    if media_type not in ('movie', 'tv'):
        media_type = 'movie'
    if not tmdb_id:
        return jsonify({'error': 'tmdb_id is required'}), 400

    season = data.get('season')
    episode = data.get('episode')
    progress_seconds = max(0, _int_or_zero(data.get('progress_seconds') or data.get('timestamp')))
    duration_seconds = max(0, _int_or_zero(data.get('duration_seconds') or data.get('duration')))
    progress_ratio = 0.0
    if duration_seconds > 0:
        progress_ratio = max(0.0, min(1.0, float(progress_seconds) / float(duration_seconds)))

    title = (data.get('title') or '').strip()
    poster_path = (data.get('poster_path') or data.get('poster') or '').strip()
    now = datetime.utcnow().isoformat()

    db.execute_query('''
        INSERT INTO watch_history
        (id, profile_id, content_id, content_type, title, poster_path, timestamp, duration, duration_seconds, progress, last_watched, tmdb_id, media_type, season, episode, watched_at, progress_seconds)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        str(uuid.uuid4()), profile['id'], tmdb_id, media_type, title, poster_path,
        progress_seconds, duration_seconds, duration_seconds, progress_ratio,
        now, tmdb_id, media_type, season, episode, now, progress_seconds
    ), db_name='flix')

    return jsonify({'success': True})


@app.route('/api/skip-intro', methods=['POST'])
def api_skip_intro_save():
    data = request.get_json(silent=True) or {}
    tmdb_id = str(data.get('tmdb_id') or data.get('content_id') or '').strip()
    if not tmdb_id:
        return jsonify({'error': 'tmdb_id is required'}), 400

    media_type = (data.get('media_type') or data.get('content_type') or 'movie').strip().lower()
    if media_type not in ('movie', 'tv'):
        media_type = 'movie'

    profile = get_active_profile(
        profile_id=data.get('profile_id') or request.headers.get('X-Profile-Id'),
        profile_name=data.get('profile_name')
    )
    if not profile:
        return jsonify({'error': 'profile is required'}), 400

    season = data.get('season')
    episode = data.get('episode')
    skip_intro_time = max(0, _int_or_zero(data.get('skip_intro_time')))
    now = datetime.utcnow().isoformat()

    existing = db.fetch_one('''
        SELECT * FROM watch_progress
        WHERE profile_id = ?
          AND tmdb_id = ?
          AND media_type = ?
          AND COALESCE(season, -1) = COALESCE(?, -1)
          AND COALESCE(episode, -1) = COALESCE(?, -1)
        LIMIT 1
    ''', (profile['id'], tmdb_id, media_type, season, episode), db_name='flix')

    if existing:
        db.execute_query(
            'UPDATE watch_progress SET skip_intro_time = ?, updated_at = ? WHERE id = ?',
            (skip_intro_time, now, existing.get('id')),
            db_name='flix'
        )
    else:
        db.execute_query('''
            INSERT INTO watch_progress
            (id, profile_id, tmdb_id, media_type, season, episode, progress_seconds, duration_seconds, last_watched, completed, server_used, skip_intro_time, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, 0, NULL, ?, ?)
        ''', (str(uuid.uuid4()), profile['id'], tmdb_id, media_type, season, episode, now, skip_intro_time, now), db_name='flix')

    return jsonify({'success': True, 'skip_intro_time': skip_intro_time})

@app.route('/api/movies/watchlist', methods=['GET'])
def api_movies_watchlist_get():
    profile = _resolve_profile(
        profile_id=request.args.get('profile_id') or request.headers.get('X-Profile-Id'),
        profile_name=request.args.get('profile_name')
    )
    if not profile:
        return jsonify({'items': []})
    rows = db.fetch_all('''
        SELECT * FROM watchlist
        WHERE profile_id = ?
        ORDER BY added_at DESC
    ''', (profile['id'],))
    return jsonify({'items': rows})

@app.route('/api/movies/watchlist', methods=['POST'])
def api_movies_watchlist_add():
    data = request.get_json(silent=True) or {}
    profile = _resolve_profile(
        profile_id=data.get('profile_id') or request.headers.get('X-Profile-Id'),
        profile_name=data.get('profile_name')
    )
    if not profile:
        return jsonify({'error': 'profile is required'}), 400

    content_id = str(data.get('content_id') or '').strip()
    content_type = (data.get('content_type') or 'movie').strip().lower()
    if not content_id:
        return jsonify({'error': 'content_id is required'}), 400

    db.execute_query('''
        INSERT INTO watchlist (profile_id, content_id, content_type, title, poster, added_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(profile_id, content_id, content_type)
        DO UPDATE SET title = excluded.title, poster = excluded.poster, added_at = excluded.added_at
    ''', (
        profile['id'], content_id, content_type,
        (data.get('title') or '').strip(),
        (data.get('poster') or '').strip(),
        datetime.utcnow().isoformat()
    ))

    return jsonify({'success': True})

@app.route('/api/movies/watchlist', methods=['DELETE'])
def api_movies_watchlist_delete():
    data = request.get_json(silent=True) or {}
    profile = _resolve_profile(
        profile_id=data.get('profile_id') or request.headers.get('X-Profile-Id'),
        profile_name=data.get('profile_name')
    )
    if not profile:
        return jsonify({'error': 'profile is required'}), 400

    content_id = str(data.get('content_id') or '').strip()
    content_type = (data.get('content_type') or 'movie').strip().lower()
    if not content_id:
        return jsonify({'error': 'content_id is required'}), 400

    db.execute_query('''
        DELETE FROM watchlist
        WHERE profile_id = ? AND content_id = ? AND content_type = ?
    ''', (profile['id'], content_id, content_type))

    return jsonify({'success': True})

@app.route('/api/movies/recommendations', methods=['GET'])
def api_movies_recommendations():
    profile = _resolve_profile(
        profile_id=request.args.get('profile_id') or request.headers.get('X-Profile-Id'),
        profile_name=request.args.get('profile_name')
    )
    if not profile:
        return jsonify({'results': []})

    content_type = (request.args.get('content_type') or 'movie').strip().lower()
    if content_type not in ('movie', 'tv'):
        content_type = 'movie'

    recent = db.fetch_all('''
        SELECT content_id, content_type
        FROM watch_history
        WHERE profile_id = ? AND content_type = ?
        ORDER BY last_watched DESC
        LIMIT 20
    ''', (profile['id'], content_type))

    if not recent:
        default_path = '/movie/popular' if content_type == 'movie' else '/tv/popular'
        return jsonify(_tmdb_fetch(default_path))

    genre_counts = {}
    cast_counts = {}
    for row in recent[:10]:
        cid = row.get('content_id')
        if not cid:
            continue
        details = _tmdb_fetch(f'/{content_type}/{cid}', {'append_to_response': 'credits'})
        for g in details.get('genres', [])[:3]:
            gid = str(g.get('id'))
            if gid:
                genre_counts[gid] = genre_counts.get(gid, 0) + 1
        for c in (details.get('credits', {}).get('cast', [])[:8]):
            cid_actor = str(c.get('id') or '')
            if cid_actor:
                cast_counts[cid_actor] = cast_counts.get(cid_actor, 0) + 1

    top_genres = [gid for gid, _ in sorted(genre_counts.items(), key=lambda kv: kv[1], reverse=True)[:3]]
    top_cast = [aid for aid, _ in sorted(cast_counts.items(), key=lambda kv: kv[1], reverse=True)[:3]]

    params = {}
    if top_genres:
        params['with_genres'] = ','.join(top_genres)
    if top_cast:
        params['with_cast'] = ','.join(top_cast)

    path = f'/discover/{content_type}'
    rec_data = _tmdb_fetch(path, params=params)

    watched_ids = {str(r.get('content_id')) for r in recent}
    rec_data['results'] = [r for r in rec_data.get('results', []) if str(r.get('id')) not in watched_ids][:20]
    return jsonify(rec_data)

@app.route('/api/movies/config', methods=['GET'])
@admin_required
def api_movies_config_get():
    return jsonify({'tmdb_key': '', 'worker_url': WORKER_URL})

@app.route('/api/movies/config', methods=['POST'])
@admin_required
def api_movies_config_save():
    log_admin_action('tmdb_key_ignored', 'tmdb key config is disabled; worker is used')
    return jsonify({'success': True, 'message': 'TMDB key is not used by Flask. Metadata is served via worker.'})

@app.route('/api/movies/tmdb-status', methods=['GET'])
@admin_required
def api_movies_tmdb_status():
    if not WORKER_URL:
        return jsonify({'status': 'unreachable', 'message': 'Metadata worker URL is not configured'})
    try:
        res = req_session.get(f'{WORKER_URL}/movie/popular', timeout=5, headers={'User-Agent': 'ToxibhFlix/1.0'})
        if res.status_code == 200:
            return jsonify({'status': 'ok', 'message': 'Metadata worker is reachable', 'code': 200})
        return jsonify({'status': 'error', 'message': f'HTTP {res.status_code}', 'code': res.status_code})
    except Exception as ex:
        return jsonify({'status': 'unreachable', 'message': str(ex)})
    return jsonify({'status': 'unknown'})


def get_stream_servers(tmdb_id, type, season=None, episode=None):
    media_type = (type or 'movie').strip().lower()
    tmdb_id = str(tmdb_id).strip()
    if not tmdb_id:
        return []

    s = int(season or 1)
    e = int(episode or 1)

    def _url_for(server_key):
        if media_type == 'tv':
            if server_key == 'vidfast':
                return f'https://vidfast.pro/tv/{tmdb_id}/{s}/{e}?autoPlay=true'
            if server_key == 'vidking':
                return f'https://www.vidking.net/embed/tv/{tmdb_id}/{s}/{e}?color=00f5ff&autoPlay=true'
            if server_key == 'vidsrc':
                return f'https://vidsrc.to/embed/tv/{tmdb_id}/{s}/{e}'
            if server_key == 'vidsrc2':
                return f'https://vidsrc.me/embed/tv/{tmdb_id}/{s}/{e}'
            if server_key == 'embed_su':
                return f'https://embed.su/embed/tv/{tmdb_id}/{s}/{e}'
            if server_key == 'autoembed':
                return f'https://autoembed.cc/embed/tv/{tmdb_id}/{s}/{e}'
            if server_key == 'superembed':
                return f'https://multiembed.mov/?video_id={tmdb_id}&tmdb=1&s={s}&e={e}'
            if server_key == '2embed':
                return f'https://www.2embed.cc/embedtv/{tmdb_id}&s={s}&e={e}'
            if server_key == 'multiembed':
                return f'https://multiembed.mov/?video_id={tmdb_id}&tmdb=1&s={s}&e={e}'
            if server_key == 'smashystream':
                return f'https://embed.smashystream.com/playertv.php?tmdb={tmdb_id}&season={s}&episode={e}'
            if server_key == 'vidsrc_to':
                return f'https://vidsrc.to/embed/tv/{tmdb_id}/{s}/{e}'
            if server_key == 'vidsrc_cc':
                return f'https://vidsrc.cc/embed/tv/{tmdb_id}/{s}/{e}'
            if server_key == 'vidsrc_me':
                return f'https://vidsrc.me/embed/tv/{tmdb_id}/{s}/{e}'
            return ''

        if server_key == 'vidfast':
            return f'https://vidfast.pro/movie/{tmdb_id}?autoPlay=true'
        if server_key == 'vidking':
            return f'https://www.vidking.net/embed/movie/{tmdb_id}?color=00f5ff&autoPlay=true'
        if server_key == 'vidsrc':
            return f'https://vidsrc.to/embed/movie/{tmdb_id}'
        if server_key == 'vidsrc2':
            return f'https://vidsrc.me/embed/movie/{tmdb_id}'
        if server_key == 'embed_su':
            return f'https://embed.su/embed/movie/{tmdb_id}'
        if server_key == 'autoembed':
            return f'https://autoembed.cc/embed/movie/{tmdb_id}'
        if server_key == 'superembed':
            return f'https://multiembed.mov/?video_id={tmdb_id}&tmdb=1'
        if server_key == '2embed':
            return f'https://www.2embed.cc/embed/{tmdb_id}'
        if server_key == 'multiembed':
            return f'https://multiembed.mov/?video_id={tmdb_id}&tmdb=1'
        if server_key == 'smashystream':
            return f'https://embed.smashystream.com/playere.php?tmdb={tmdb_id}'
        if server_key == 'vidsrc_to':
            return f'https://vidsrc.to/embed/movie/{tmdb_id}'
        if server_key == 'vidsrc_cc':
            return f'https://vidsrc.cc/embed/movie/{tmdb_id}'
        if server_key == 'vidsrc_me':
            return f'https://vidsrc.me/embed/movie/{tmdb_id}'
        return ''

    servers = []
    for idx, key in enumerate(STREAM_SERVER_PRIORITY):
        url = _url_for(key)
        if not url:
            continue
        servers.append({
            'key': key,
            'name': STREAM_SERVER_LABELS.get(key, key),
            'priority': idx + 1,
            'is_primary': key == 'vidfast',
            'url': url,
        })
    return servers


@app.route('/api/movies/stream-servers', methods=['GET'])
def api_movies_stream_servers():
    tmdb_id = (request.args.get('id') or '').strip()
    media_type = (request.args.get('type') or 'movie').strip().lower()
    if media_type not in ('movie', 'tv'):
        media_type = 'movie'

    if not tmdb_id:
        return jsonify({'error': 'id is required'}), 400

    season = request.args.get('season', type=int)
    episode = request.args.get('episode', type=int)
    servers = get_stream_servers(tmdb_id, media_type, season=season, episode=episode)

    return jsonify({
        'default_server': 'vidfast',
        'media_type': media_type,
        'servers': servers,
    })

# ── TMDB PROXY API ────────────────────────────────────────────────
_TMDB_CACHE = {}
TMDB_CACHE_TTL = 300  # 5 minutes


def _metadata_image_url(path, size='w500'):
    raw = (path or '').strip()
    if not raw:
        return None
    if raw.startswith('http://') or raw.startswith('https://'):
        return raw
    if not raw.startswith('/'):
        raw = f'/{raw}'
    return f'https://image.tmdb.org/t/p/{size}{raw}'


def _metadata_year(value):
    raw = (value or '').strip()
    if not raw:
        return None
    return raw.split('-', 1)[0]


def _normalize_genres(genres):
    out = []
    for g in (genres or []):
        if isinstance(g, str):
            name = g.strip()
        elif isinstance(g, dict):
            name = (g.get('name') or '').strip()
        else:
            name = ''
        if name:
            out.append(name)
    return out


def _normalize_seasons(seasons):
    items = []
    for season in (seasons or []):
        if not isinstance(season, dict):
            continue
        items.append({
            'id': season.get('id'),
            'season_number': season.get('season_number'),
            'name': season.get('name'),
            'episode_count': season.get('episode_count'),
            'air_date': season.get('air_date'),
            'poster': season.get('poster') or _metadata_image_url(season.get('poster_path'), size='w342')
        })
    return items


def _normalize_metadata_payload(data, media_type):
    if not isinstance(data, dict):
        return None

    title = (data.get('title') or data.get('name') or '').strip()
    year = data.get('year') or _metadata_year(data.get('release_date') or data.get('first_air_date'))
    rating = data.get('rating', data.get('vote_average'))
    try:
        rating = float(rating) if rating is not None else 0.0
    except Exception:
        rating = 0.0

    genres = _normalize_genres(data.get('genres'))
    seasons = _normalize_seasons(data.get('seasons') if media_type == 'tv' else [])

    return {
        'id': data.get('id'),
        'title': title,
        'poster': data.get('poster') or _metadata_image_url(data.get('poster_path'), size='w500'),
        'backdrop': data.get('backdrop') or _metadata_image_url(data.get('backdrop_path'), size='original'),
        'overview': data.get('overview') or '',
        'year': year,
        'rating': rating,
        'genres': genres,
        'seasons': seasons,
        'media_type': media_type,
    }


def _worker_fetch_json(path, timeout=6):
    if not WORKER_URL or 'your-worker.workers.dev' in WORKER_URL:
        raise RuntimeError('Metadata worker is not configured')

    url = f'{WORKER_URL}{path}'
    res = req_session.get(url, timeout=timeout, headers={'User-Agent': 'ToxibhFlix/1.0'})
    if res.status_code >= 400:
        raise RuntimeError(f'Worker HTTP {res.status_code}')
    return res.json()


def get_movie_data(tmdb_id):
    tmdb_id = int(tmdb_id)
    try:
        worker_data = _worker_fetch_json(f'/movie/{tmdb_id}')
        normalized = _normalize_metadata_payload(worker_data, 'movie')
        if normalized and normalized.get('id'):
            return normalized, 'worker'
    except Exception:
        pass

    direct = _tmdb_fetch(f'/movie/{tmdb_id}')
    return _normalize_metadata_payload(direct, 'movie'), 'tmdb'


def get_tv_data(tmdb_id):
    tmdb_id = int(tmdb_id)
    try:
        worker_data = _worker_fetch_json(f'/tv/{tmdb_id}')
        normalized = _normalize_metadata_payload(worker_data, 'tv')
        if normalized and normalized.get('id'):
            return normalized, 'worker'
    except Exception:
        pass

    direct = _tmdb_fetch(f'/tv/{tmdb_id}')
    return _normalize_metadata_payload(direct, 'tv'), 'tmdb'


def get_search_data(query, page=1):
    q = (query or '').strip()
    if not q:
        return {'results': []}, 'worker'

    page_num = int(page or 1)
    if page_num < 1:
        page_num = 1

    try:
        encoded = quote(q, safe='')
        worker_data = _worker_fetch_json(f'/search/{encoded}?page={page_num}')
        source_results = []
        if isinstance(worker_data, list):
            source_results = worker_data
        elif isinstance(worker_data, dict) and isinstance(worker_data.get('results'), list):
            source_results = worker_data.get('results', [])

        if source_results:
            results = []
            for item in source_results:
                media_type = (item.get('media_type') or 'movie').strip().lower()
                if media_type not in ('movie', 'tv'):
                    media_type = 'movie'
                normalized = _normalize_metadata_payload(item, media_type)
                if not normalized:
                    continue
                results.append(normalized)
            return {'results': results}, 'worker'
    except Exception:
        pass

    direct = _tmdb_fetch('/search/multi', {'query': q, 'page': page_num})
    results = []
    for item in direct.get('results', []):
        media_type = (item.get('media_type') or '').strip().lower()
        if media_type not in ('movie', 'tv'):
            continue
        normalized = _normalize_metadata_payload(item, media_type)
        if not normalized:
            continue
        results.append(normalized)
    return {'results': results}, 'tmdb'


@app.route('/api/movie/<int:tmdb_id>', methods=['GET'])
def api_movie_metadata(tmdb_id):
    data, source = get_movie_data(tmdb_id)
    if not data:
        return jsonify({'error': 'Metadata not found'}), 404
    resp = jsonify(data)
    resp.headers['Cache-Control'] = 'public, max-age=3600'
    resp.headers['X-Metadata-Source'] = source
    return resp


@app.route('/api/tv/<int:tmdb_id>', methods=['GET'])
def api_tv_metadata(tmdb_id):
    data, source = get_tv_data(tmdb_id)
    if not data:
        return jsonify({'error': 'Metadata not found'}), 404
    resp = jsonify(data)
    resp.headers['Cache-Control'] = 'public, max-age=3600'
    resp.headers['X-Metadata-Source'] = source
    return resp


@app.route('/api/search/<path:query>', methods=['GET'])
def api_search_metadata_path(query):
    page = request.args.get('page', 1, type=int)
    data, source = get_search_data(query, page=page)
    resp = jsonify(data)
    resp.headers['Cache-Control'] = 'public, max-age=900'
    resp.headers['X-Metadata-Source'] = source
    return resp


@app.route('/api/search', methods=['GET'])
def api_search_metadata_query():
    query = request.args.get('q', '')
    page = request.args.get('page', 1, type=int)
    data, source = get_search_data(query, page=page)
    resp = jsonify(data)
    resp.headers['Cache-Control'] = 'public, max-age=900'
    resp.headers['X-Metadata-Source'] = source
    return resp

def _tmdb_empty_payload(path=''):
    normalized = (path or '').strip('/').lower()
    if normalized.endswith('/videos'):
        return {'results': []}
    if normalized.endswith('/recommendations'):
        return {'results': []}
    if normalized.endswith('/credits'):
        return {'cast': [], 'crew': []}
    if normalized.startswith('genre/'):
        return {'genres': []}
    if '/season/' in normalized:
        return {'episodes': []}
    if normalized.startswith('search') or normalized.startswith('discover'):
        return {'results': []}
    if normalized.startswith('movie/') or normalized.startswith('tv/') or normalized.startswith('trending/'):
        return {'results': []}
    return {'results': []}


def _tmdb_fetch(path, params=None):
    """Fetch TMDB-compatible payloads from the metadata worker with lightweight in-memory caching."""
    clean_path = f"/{(path or '').lstrip('/')}"
    query = {'language': 'en-US'}
    if params:
        for key, value in dict(params).items():
            if value is None or value == '':
                continue
            query[key] = value

    target_url = req_session.Request('GET', f"{WORKER_URL}{clean_path}", params=query).prepare().url
    now = time.time()
    if target_url in _TMDB_CACHE:
        cached = _TMDB_CACHE[target_url]
        if now - cached['ts'] < TMDB_CACHE_TTL:
            return cached['data']

    try:
        res = req_session.get(f"{WORKER_URL}{clean_path}", params=query, timeout=5, headers={'User-Agent': 'ToxibhFlix/1.0'})
        if res.status_code >= 400:
            return _tmdb_empty_payload(clean_path)

        data = res.json()
        _TMDB_CACHE[target_url] = {'data': data, 'ts': now}

        if len(_TMDB_CACHE) > 100:
            expired = [k for k, v in _TMDB_CACHE.items() if now - v['ts'] > TMDB_CACHE_TTL]
            for k in expired:
                _TMDB_CACHE.pop(k, None)

        return data
    except Exception:
        return _tmdb_empty_payload(clean_path)


@app.route('/api/tmdb/<path:subpath>', methods=['GET'])
def proxy_tmdb(subpath):
    clean_subpath = (subpath or '').strip('/')
    if not clean_subpath:
        return jsonify({'results': []})

    worker_url = f"{WORKER_URL}/{clean_subpath}"
    try:
        upstream = req_session.get(
            worker_url,
            params=request.args,
            timeout=5,
            headers={'User-Agent': 'ToxibhFlix/1.0'}
        )
        if upstream.status_code >= 400:
            return jsonify(_tmdb_empty_payload(clean_subpath))
        return jsonify(upstream.json())
    except Exception:
        return jsonify(_tmdb_empty_payload(clean_subpath))


@app.route('/api/tmdb/search', methods=['GET'])
def proxy_tmdb_search():
    # Support both `q` and `query` from clients and always map to worker's `query`.
    query = (request.args.get('query') or request.args.get('q') or '').strip()
    page = request.args.get('page', 1, type=int)
    if page < 1:
        page = 1

    if not query:
        return jsonify({'results': []})

    worker_url = f"{WORKER_URL}/search/multi"
    try:
        upstream = req_session.get(
            worker_url,
            params={'query': query, 'page': page},
            timeout=5,
            headers={'User-Agent': 'ToxibhFlix/1.0'}
        )
        if upstream.status_code >= 400:
            return jsonify({'results': []})
        return jsonify(upstream.json())
    except Exception:
        return jsonify({'results': []})

@app.route('/tmdb_image')
def tmdb_image_proxy():
    """Proxy TMDB images to avoid browser-side CORS and blocked requests."""
    from urllib.parse import urlparse

    image_url = (request.args.get('url') or '').strip()
    if not image_url:
        return jsonify({'error': 'Missing required query param: url'}), 400

    try:
        parsed = urlparse(image_url)
    except Exception:
        return jsonify({'error': 'Invalid URL'}), 400

    if parsed.scheme not in ('http', 'https'):
        return jsonify({'error': 'Invalid URL scheme'}), 400

    if parsed.netloc not in ('image.tmdb.org', 'www.image.tmdb.org'):
        return jsonify({'error': 'Only TMDB image URLs are allowed'}), 400

    try:
        upstream = req_session.get(
            image_url,
            timeout=10,
            headers={'User-Agent': 'ToxibhFlix/1.0'}
        )
    except req_session.RequestException as ex:
        return jsonify({'error': f'Failed to fetch image: {str(ex)}'}), 502

    if upstream.status_code >= 400:
        return jsonify({'error': 'TMDB image fetch failed'}), upstream.status_code

    content_type = upstream.headers.get('Content-Type', 'image/jpeg').split(';')[0].strip()
    resp = Response(upstream.content, status=200, mimetype=content_type)
    resp.headers['Cache-Control'] = 'public, max-age=86400'
    return resp


# ── QBITTORRENT TORRENT STREAMING API ──────────────────────────
QBITTORRENT_URL = os.environ.get('QBITTORRENT_URL', 'http://localhost:8090').rstrip('/')
QBITTORRENT_USER = os.environ.get('QBITTORRENT_USER', 'admin')
QBITTORRENT_PASS = os.environ.get('QBITTORRENT_PASS', 'hello6969')
QBITTORRENT_DOWNLOAD_DIR = os.path.expanduser(
    os.environ.get('QBITTORRENT_DOWNLOAD_DIR')
    or os.environ.get('ARIA2_DIR')
    or '~/torrents'
)

VIDEO_EXTS = ('.mp4', '.mkv', '.avi', '.webm', '.mov', '.m4v', '.ogv', '.wmv')
MIME_MAP   = {
    'mp4': 'video/mp4', 'webm': 'video/webm', 'ogv': 'video/ogg',
    'mkv': 'video/x-matroska', 'avi': 'video/x-msvideo',
    'mov': 'video/quicktime', 'm4v': 'video/x-m4v', 'wmv': 'video/x-ms-wmv',
}

_qbt_session = None

def _extract_btih(magnet):
    """Extract BTIH hash from magnet; return lowercase v1 hash when available."""
    try:
        parsed = urlparse(magnet)
        xt_values = parse_qs(parsed.query).get('xt', [])
        for value in xt_values:
            if value.lower().startswith('urn:btih:'):
                btih = value.split(':')[-1].strip()
                if re.fullmatch(r'[a-fA-F0-9]{40}', btih):
                    return btih.lower()
    except Exception:
        pass
    return None

def _qbt_get_session(force_login=False):
    global _qbt_session
    if _qbt_session is None:
        _qbt_session = req_session.Session()

    if force_login:
        login_resp = _qbt_session.post(
            f'{QBITTORRENT_URL}/api/v2/auth/login',
            data={'username': QBITTORRENT_USER, 'password': QBITTORRENT_PASS},
            timeout=8,
        )
        if login_resp.status_code >= 400 or login_resp.text.strip() != 'Ok.':
            raise RuntimeError('qBittorrent login failed. Check QBITTORRENT_USER/QBITTORRENT_PASS.')
    return _qbt_session

def qbt_call(method, path, *, params=None, data=None):
    """Call qBittorrent Web API and return response object or raise."""
    session_obj = _qbt_get_session(force_login=False)
    url = f'{QBITTORRENT_URL}{path}'
    resp = session_obj.request(method, url, params=params, data=data, timeout=8)

    if resp.status_code in (401, 403):
        session_obj = _qbt_get_session(force_login=True)
        resp = session_obj.request(method, url, params=params, data=data, timeout=8)

    if resp.status_code >= 400:
        body = (resp.text or '').strip()
        raise RuntimeError(body or f'qBittorrent API error ({resp.status_code})')
    return resp

def _torrent_path_within_download_dir(path_value):
    if not path_value:
        return False
    try:
        base = os.path.abspath(QBITTORRENT_DOWNLOAD_DIR)
        target = os.path.abspath(os.path.expanduser(path_value))
        return os.path.commonpath([base, target]) == base
    except Exception:
        return False

def _persist_downloaded_torrent(torrent_hash, name='', content_path='', total_size=0):
    if not torrent_hash:
        return False
    now_iso = datetime.utcnow().isoformat()
    safe_path = (content_path or '').strip()
    if safe_path and not _torrent_path_within_download_dir(safe_path):
        safe_path = ''
    return db.execute_query(
        '''
        INSERT INTO downloaded_torrents (id, torrent_hash, name, content_path, total_size, removed_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(torrent_hash) DO UPDATE SET
            name = excluded.name,
            content_path = excluded.content_path,
            total_size = excluded.total_size,
            removed_at = excluded.removed_at
        ''',
        (str(uuid.uuid4()), torrent_hash, name or torrent_hash, safe_path, int(total_size or 0), now_iso),
        db_name='flix'
    )

def _list_downloaded_torrents():
    rows = db.fetch_all(
        '''
        SELECT id, torrent_hash, name, content_path, total_size, removed_at
        FROM downloaded_torrents
        ORDER BY removed_at DESC
        ''',
        db_name='flix'
    )
    items = []
    for row in rows:
        content_path = (row.get('content_path') or '').strip()
        exists_on_disk = bool(content_path and os.path.exists(os.path.expanduser(content_path)))
        total = int(row.get('total_size', 0) or 0)
        items.append({
            'id': row.get('id'),
            'gid': row.get('torrent_hash'),
            'hash': row.get('torrent_hash'),
            'name': row.get('name') or row.get('torrent_hash'),
            'status': 'downloaded',
            'totalLength': str(total),
            'completedLength': str(total),
            'contentPath': content_path,
            'exists': exists_on_disk,
            'removedAt': row.get('removed_at'),
        })
    return items

def _qbt_to_stream_status(torrent_hash):
    info_resp = qbt_call('GET', '/api/v2/torrents/info', params={'hashes': torrent_hash})
    infos = info_resp.json() or []
    if not infos:
        raise RuntimeError('Torrent not found')

    info = infos[0]
    files_resp = qbt_call('GET', '/api/v2/torrents/files', params={'hash': torrent_hash})
    files_data = files_resp.json() or []

    content_path = info.get('content_path') or ''
    base_dir = content_path if os.path.isdir(content_path) else os.path.dirname(content_path)

    files = []
    for idx, file_item in enumerate(files_data):
        rel_name = file_item.get('name', '')
        abs_path = os.path.join(base_dir, rel_name) if base_dir else rel_name
        ext = os.path.splitext(rel_name)[1].lower()
        files.append({
            'index': str(file_item.get('index', idx)),
            'path': abs_path,
            'name': rel_name,
            'length': str(int(file_item.get('size', 0))),
            'completedLength': str(int(file_item.get('progress', 0) * file_item.get('size', 0))),
            'selected': 'true' if int(file_item.get('priority', 1)) > 0 else 'false',
            'is_video': ext in VIDEO_EXTS,
        })

    total_length = int(info.get('total_size', 0) or 0)
    completed_length = int(total_length * float(info.get('progress', 0) or 0))

    raw_state = info.get('state', '')
    state_map = {
        'downloading': 'active',
        'forcedDL': 'active',
        'metaDL': 'active',
        'checkingDL': 'active',
        'stalledDL': 'active',
        'uploading': 'active',
        'forcedUP': 'active',
        'stalledUP': 'active',
        'queuedDL': 'waiting',
        'queuedUP': 'waiting',
        'checkingResumeData': 'waiting',
        'moving': 'waiting',
        'pausedDL': 'paused',
        'pausedUP': 'paused',
        'error': 'error',
        'missingFiles': 'error',
    }
    mapped_status = state_map.get(raw_state, 'complete' if int(info.get('completion_on', 0) or 0) > 0 else raw_state)

    return {
        'gid': info.get('hash', torrent_hash),
        'status': mapped_status,
        'totalLength': str(total_length),
        'completedLength': str(completed_length),
        'downloadSpeed': str(int(info.get('dlspeed', 0) or 0)),
        'uploadSpeed': str(int(info.get('upspeed', 0) or 0)),
        'connections': str(int(info.get('num_leechs', 0) or 0) + int(info.get('num_seeds', 0) or 0)),
        'bittorrent': {'info': {'name': info.get('name') or info.get('hash', torrent_hash)}},
        'files': files,
        'errorMessage': info.get('state_description') or raw_state,
    }

@app.route('/api/torrent/ping')
def api_torrent_ping():
    """Check if qBittorrent Web API is reachable."""
    try:
        v = qbt_call('GET', '/api/v2/app/version').text.strip()
        return jsonify({'ok': True, 'version': v})
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)})

def _print_qbt_startup_healthcheck():
    print(f'   qBittorrent URL :  {QBITTORRENT_URL}')
    try:
        version = qbt_call('GET', '/api/v2/app/version').text.strip()
        print(f'   qBittorrent OK  :  version {version}')
    except req_session.RequestException as e:
        print('   qBittorrent WARN:  WebUI not reachable')
        print(f'      Details       :  {e}')
        print('      Fix           :  Start qBittorrent WebUI and set QBITTORRENT_URL correctly')
    except RuntimeError as e:
        print('   qBittorrent WARN:  WebUI reachable but API/login failed')
        print(f'      Details       :  {e}')
        print('      Fix           :  Check QBITTORRENT_USER / QBITTORRENT_PASS and WebUI settings')
    except Exception as e:
        print('   qBittorrent WARN:  Health check failed unexpectedly')
        print(f'      Details       :  {e}')

@app.route('/api/torrent/add', methods=['POST'])
def api_torrent_add():
    data = request.get_json()
    magnet = (data or {}).get('magnet', '').strip()
    if not magnet.startswith('magnet:'):
        return jsonify({'error': 'Invalid magnet link'}), 400
    try:
        qbt_call(
            'POST',
            '/api/v2/torrents/add',
            data={
                'urls': magnet,
                'savepath': QBITTORRENT_DOWNLOAD_DIR,
                'sequentialDownload': 'true',
                'firstLastPiecePrio': 'true',
                'autoTMM': 'false',
            },
        )

        gid = _extract_btih(magnet)
        if not gid:
            latest = qbt_call('GET', '/api/v2/torrents/info', params={'limit': 50}).json() or []
            if latest:
                gid = max(latest, key=lambda item: int(item.get('added_on', 0) or 0)).get('hash')

        if not gid:
            return jsonify({'error': 'Torrent added but could not resolve hash'}), 500

        return jsonify({'gid': gid})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/torrent/status/<gid>')
def api_torrent_status(gid):
    try:
        s = _qbt_to_stream_status(gid)
        return jsonify(s)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/torrent/list')
def api_torrent_list():
    try:
        all_items = qbt_call('GET', '/api/v2/torrents/info').json() or []

        active_states = {'downloading', 'forcedDL', 'metaDL', 'checkingDL', 'stalledDL', 'uploading', 'forcedUP', 'stalledUP'}
        waiting_states = {'queuedDL', 'queuedUP', 'checkingResumeData', 'moving'}

        active, waiting, stopped = [], [], []
        for item in all_items:
            raw_state = item.get('state', '')
            mapped_status = {
                'downloading': 'active',
                'forcedDL': 'active',
                'metaDL': 'active',
                'checkingDL': 'active',
                'stalledDL': 'active',
                'uploading': 'active',
                'forcedUP': 'active',
                'stalledUP': 'active',
                'queuedDL': 'waiting',
                'queuedUP': 'waiting',
                'checkingResumeData': 'waiting',
                'moving': 'waiting',
                'pausedDL': 'paused',
                'pausedUP': 'paused',
                'error': 'error',
                'missingFiles': 'error',
            }.get(raw_state, 'complete' if int(item.get('completion_on', 0) or 0) > 0 else raw_state)

            mapped = {
                'gid': item.get('hash'),
                'hash': item.get('hash'),
                'status': mapped_status,
                'totalLength': str(int(item.get('total_size', 0) or 0)),
                'completedLength': str(int((item.get('total_size', 0) or 0) * float(item.get('progress', 0) or 0))),
                'downloadSpeed': str(int(item.get('dlspeed', 0) or 0)),
                'uploadSpeed': str(int(item.get('upspeed', 0) or 0)),
                'bittorrent': {'info': {'name': item.get('name') or item.get('hash')}},
                'files': [{'path': item.get('content_path', '')}],
            }

            state = raw_state
            if state in active_states:
                active.append(mapped)
            elif state in waiting_states:
                waiting.append(mapped)
            else:
                stopped.append(mapped)

        downloaded = _list_downloaded_torrents()
        return jsonify({'active': active, 'waiting': waiting, 'stopped': stopped, 'downloaded': downloaded})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/torrent/remove/<gid>', methods=['DELETE'])
def api_torrent_remove(gid):
    try:
        infos = qbt_call('GET', '/api/v2/torrents/info', params={'hashes': gid}).json() or []
        info = infos[0] if infos else {}
        name = info.get('name') or gid
        content_path = info.get('content_path') or ''
        if not content_path and name:
            content_path = os.path.join(QBITTORRENT_DOWNLOAD_DIR, name)
        total_size = int(info.get('total_size', 0) or 0)

        qbt_call('POST', '/api/v2/torrents/delete', data={'hashes': gid, 'deleteFiles': 'false'})
        _persist_downloaded_torrent(gid, name=name, content_path=content_path, total_size=total_size)
        return jsonify({'ok': True, 'movedToDownloaded': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/torrent/downloaded/<downloaded_id>', methods=['DELETE'])
def api_torrent_delete_downloaded(downloaded_id):
    try:
        row = db.fetch_one(
            'SELECT id, content_path FROM downloaded_torrents WHERE id = ?',
            (downloaded_id,),
            db_name='flix'
        )
        if not row:
            return jsonify({'error': 'Downloaded torrent not found'}), 404

        deleted_files = False
        content_path = (row.get('content_path') or '').strip()
        if content_path:
            abs_path = os.path.abspath(os.path.expanduser(content_path))
            if _torrent_path_within_download_dir(abs_path) and os.path.exists(abs_path):
                if os.path.isdir(abs_path):
                    shutil.rmtree(abs_path, ignore_errors=True)
                else:
                    os.remove(abs_path)
                deleted_files = True

        db.execute_query('DELETE FROM downloaded_torrents WHERE id = ?', (downloaded_id,), db_name='flix')
        return jsonify({'ok': True, 'deletedFiles': deleted_files})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/torrent/stream/<gid>')
def api_torrent_stream(gid):
    """Stream the largest video file in a torrent via Range requests."""
    try:
        file_idx = request.args.get('file', None)
        s = _qbt_to_stream_status(gid)
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
        files = db.fetch_all("SELECT filetype FROM vault_files")
        
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
            'photos': sum(1 for f in files if f.get('filetype') == 'photo'),
            'pdfs': sum(1 for f in files if f.get('filetype') == 'pdf'),
            'visitorChart': chart
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ══════════════════════════════════════════════════════════
#  REAL-TIME METRICS
# ══════════════════════════════════════════════════════════
def _system_metrics_payload():
    try:
        mem = psutil.virtual_memory()
        disk = psutil.disk_usage(DATA_ROOT)
        net = psutil.net_io_counters()
        uptime_seconds = time.time() - psutil.boot_time()
        
        h = int(uptime_seconds // 3600)
        m = int((uptime_seconds % 3600) // 60)
        
        return {
            'cpu': psutil.cpu_percent(interval=0.1),
            'ram': mem.percent,
            'disk': disk.percent,
            'processes': len(psutil.pids()),
            'uptime': f"{h}h {m}m",
            'net_sent': net.bytes_sent,
            'net_recv': net.bytes_recv
        }
    except Exception as e:
        logger.exception(f'SYSTEM_METRICS_ERROR | {str(e)}')
        return {'error': str(e)}

@app.route('/api/admin/system')
@admin_required
def api_admin_system_metrics():
    payload = _system_metrics_payload()
    if payload.get('error'):
        return jsonify(payload), 500
    return jsonify(payload)

@app.route('/api/metrics/system')
@admin_required
def metric_system():
    payload = _system_metrics_payload()
    if payload.get('error'):
        return jsonify(payload), 500
    return jsonify(payload)

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
    log_admin_action('clear_visitors', 'all_visitor_logs_deleted')
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
    log_admin_action('add_note', f'id={n_id}')
    
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
        log_admin_action('update_note', f'id={note_id}')
        
    return jsonify({'success': True})

@app.route('/api/notes/<note_id>', methods=['DELETE'])
@admin_required
def del_note(note_id):
    db.execute_query("DELETE FROM notes WHERE id = ?", (note_id,))
    log_admin_action('delete_note', f'id={note_id}')
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
    log_admin_action('add_password', f'id={p_id},site={site}')
    
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
        log_admin_action('update_password', f'id={pw_id}')
        
    return jsonify({'success': True})

@app.route('/api/passwords/<pw_id>', methods=['DELETE'])
@admin_required
def del_password(pw_id):
    db.execute_query("DELETE FROM passwords WHERE id = ?", (pw_id,))
    log_admin_action('delete_password', f'id={pw_id}')
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
        public_path = f"static/{'photos' if is_img else 'pdfs'}/{new_name}"
        time_now = datetime.utcnow().isoformat()

        db.execute_query('''
            INSERT INTO vault_files (id, filename, filetype, filepath, upload_date, original_name, mimetype, size)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (f_id, new_name, f_type, dest, time_now, file.filename, mime, size))

        log_admin_action('upload_file', f'type={f_type},filename={new_name},size={size}')
        
        results.append({
            'id': f_id, 'originalName': file.filename, 'filename': new_name,
            'type': f_type, 'mimetype': mime, 'size': size, 'path': public_path, 'time': time_now
        })

    return jsonify({'success': True, 'files': results})

@app.route('/api/files')
@admin_required
def get_files():
    ftype = request.args.get('type')
    if ftype:
        files = db.fetch_all("SELECT * FROM vault_files WHERE filetype = ? ORDER BY upload_date DESC", (ftype,))
    else:
        files = db.fetch_all("SELECT * FROM vault_files ORDER BY upload_date DESC")

    normalized = []
    for entry in files:
        filetype = entry.get('filetype')
        filename = entry.get('filename')
        normalized.append({
            'id': entry.get('id'),
            'originalName': entry.get('original_name') or filename,
            'filename': filename,
            'type': filetype,
            'mimetype': entry.get('mimetype'),
            'size': entry.get('size') or 0,
            'path': f"static/{'photos' if filetype == 'photo' else 'pdfs'}/{filename}",
            'time': entry.get('upload_date')
        })
    return jsonify(normalized)

@app.route('/api/files/<file_id>', methods=['DELETE'])
@admin_required
def del_file(file_id):
    entry = db.fetch_one("SELECT * FROM vault_files WHERE id = ?", (file_id,))
    if entry:
        full = entry.get('filepath')
        try:
            if full and os.path.exists(full):
                os.remove(full)
        except Exception:
            pass
        db.execute_query("DELETE FROM vault_files WHERE id = ?", (file_id,))
        log_admin_action('delete_file', f'id={file_id},filename={entry.get("filename")}')
    return jsonify({'success': True})

# ══════════════════════════════════════════════════════════
#  GAMES LEADERBOARD
# ══════════════════════════════════════════════════════════
def _normalize_score(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _submit_game_high_score(payload):
    player_name = (payload.get('player_name') or '').strip()[:15] or 'Anonymous'
    game_name = (payload.get('game') or payload.get('game_name') or '').strip().lower()
    score = _normalize_score(payload.get('high_score', payload.get('score')))

    if not game_name or score is None:
        return {'error': 'Invalid data'}, 400

    if score < 0:
        score = 0

    now_iso = datetime.utcnow().isoformat()
    db.execute_query('''
        INSERT INTO leaderboards (id, game_name, player_name, high_score, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(game_name, player_name)
        DO UPDATE SET high_score = excluded.high_score, updated_at = excluded.updated_at
        WHERE excluded.high_score > leaderboards.high_score
    ''', (str(uuid.uuid4()), game_name, player_name, score, now_iso), db_name='admin')

    return {'success': True, 'player_name': player_name, 'game': game_name, 'high_score': score}, 200


def _get_game_leaderboard_rows(game_name):
    normalized_game = (game_name or '').strip().lower()
    if not normalized_game:
        return None

    return db.fetch_all('''
        SELECT player_name, high_score AS score
        FROM leaderboards
        WHERE game_name = ?
        ORDER BY high_score DESC, updated_at ASC
        LIMIT 10
    ''', (normalized_game,), db_name='admin')


@app.route('/api/games/score', methods=['POST'])
def submit_universal_game_score():
    data = request.get_json(silent=True) or {}
    body, status = _submit_game_high_score(data)
    return jsonify(body), status


@app.route('/api/games/leaderboard')
def get_universal_game_leaderboard():
    game_name = request.args.get('game', '')
    rows = _get_game_leaderboard_rows(game_name)
    if rows is None:
        return jsonify({'error': 'Game is required'}), 400
    return jsonify(rows)


@app.route('/api/game/submit_score', methods=['POST'])
def submit_game_score():
    data = request.get_json(silent=True) or {}
    body, status = _submit_game_high_score(data)
    return jsonify(body), status

@app.route('/api/game/leaderboard')
def get_game_leaderboard():
    game_name = request.args.get('game', '') or request.args.get('game_name', '')
    rows = _get_game_leaderboard_rows(game_name)
    if rows is None:
        return jsonify({'error': 'Game name required'}), 400
    return jsonify(rows)

# ══════════════════════════════════════════════════════════
#  RUN
# ══════════════════════════════════════════════════════════
if __name__ == '__main__':
    host = os.environ.get('HOST', '0.0.0.0')
    port = int(os.environ.get('PORT', '8080'))
    print('\n🚀 TOXIBH FLASK SERVER (SQLite / Termux Cloudflare Deploy)')
    print(f'   Portfolio  :  http://{host}:{port}')
    print(f'   Admin      :  http://{host}:{port}/admin\n')
    _print_qbt_startup_healthcheck()
    print('')
    try:
        from waitress import serve
    except ImportError as ex:
        raise RuntimeError('Waitress is required. Install it with: pip install waitress') from ex

    # Use Waitress for production serving while preserving Cloudflare-compatible bind settings.
    serve(app, host=host, port=port, threads=8)
