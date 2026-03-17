# ═══════════════════════════════════════════════════════════
#  TOXIBH ADMIN  —  app.py  (Flask Backend + SQLite DB)
#  Run:  python app.py
# ═══════════════════════════════════════════════════════════

import os, uuid, bcrypt, mimetypes, json, time, re, logging
import urllib.request, urllib.error
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
DATA_ROOT   = db.DATA_ROOT
DB_DIR      = os.path.join(DATA_ROOT, 'databases')
VAULT_DIR   = os.path.join(DATA_ROOT, 'vault')
PHOTOS_DIR  = os.path.join(VAULT_DIR, 'photos')
PDFS_DIR    = os.path.join(VAULT_DIR, 'pdfs')
LOGS_DIR    = os.path.join(DATA_ROOT, 'logs')
SERVER_LOG  = os.path.join(LOGS_DIR, 'server.log')

for d in [DB_DIR, PHOTOS_DIR, PDFS_DIR, LOGS_DIR]:
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
DEFAULT_TMDB_KEY = 'e1ab6c29240869d03ce20472b94dd2e4'
TMDB_PROXY_WORKER_URL = 'https://snowy-bush-2e58.subhamj422.workers.dev/'

def log_admin_action(action, detail=''):
    actor = session.get('admin') and 'admin' or 'guest'
    logger.info(f'ADMIN_ACTION | actor={actor} | action={action} | detail={detail}')

def _get_tmdb_key():
    saved = (db.get_setting('tmdb_key') or '').strip()
    if saved:
        return saved
    return DEFAULT_TMDB_KEY

def _set_tmdb_key(key):
    value = (key or '').strip()
    if value:
        return db.set_setting('tmdb_key', value)
    return False

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
    return {
        'id': profile_row.get('id'),
        'name': profile_row.get('profile_name'),
        'emoji': profile_row.get('avatar') or '👤',
        'created_at': profile_row.get('created_at')
    }

def _resolve_profile(profile_id=None, profile_name=None, avatar='👤'):
    pid = (profile_id or '').strip()
    pname = (profile_name or '').strip()

    if pid:
        row = db.fetch_one('SELECT * FROM profiles WHERE id = ?', (pid,))
        if row:
            return row

    if pname:
        existing = db.fetch_one(
            'SELECT * FROM profiles WHERE user_id = ? AND lower(profile_name) = lower(?)',
            ('local_user', pname)
        )
        if existing:
            return existing

        new_id = str(uuid.uuid4())
        now = datetime.utcnow().isoformat()
        db.execute_query(
            'INSERT INTO profiles (id, user_id, profile_name, avatar, created_at) VALUES (?, ?, ?, ?, ?)',
            (new_id, 'local_user', pname, avatar or '👤', now)
        )
        return db.fetch_one('SELECT * FROM profiles WHERE id = ?', (new_id,))

    return db.fetch_one('SELECT * FROM profiles ORDER BY created_at ASC LIMIT 1')

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

@app.route('/api/movies/profiles', methods=['GET'])
def api_movies_profiles_get():
    rows = db.fetch_all('SELECT id, profile_name, avatar, created_at FROM profiles ORDER BY created_at ASC')
    if rows:
        return jsonify([_normalize_profile(r) for r in rows])

    defaults = [
        {'id': 'guest', 'name': 'Guest', 'emoji': '👤'},
    ]
    now = datetime.utcnow().isoformat()
    for p in defaults:
        name = (p.get('name') or '').strip()
        if not name:
            continue
        db.execute_query(
            'INSERT OR IGNORE INTO profiles (id, user_id, profile_name, avatar, created_at) VALUES (?, ?, ?, ?, ?)',
            (p.get('id') or str(uuid.uuid4()), 'local_user', name, p.get('emoji') or '👤', now)
        )

    rows = db.fetch_all('SELECT id, profile_name, avatar, created_at FROM profiles ORDER BY created_at ASC')
    return jsonify([_normalize_profile(r) for r in rows])

@app.route('/api/profiles', methods=['GET'])
def api_profiles_get():
    rows = db.fetch_all('SELECT id, profile_name, avatar, created_at FROM profiles ORDER BY created_at ASC')
    return jsonify([
        {
            'id': r.get('id'),
            'name': r.get('profile_name'),
            'avatar': r.get('avatar') or '👤',
            'created_at': r.get('created_at')
        }
        for r in rows
    ])

@app.route('/api/profiles/create', methods=['POST'])
def api_profiles_create():
    data = request.get_json(silent=True) or {}
    profile_name = (data.get('name') or data.get('profile_name') or '').strip()
    avatar = (data.get('avatar') or data.get('emoji') or '👤').strip() or '👤'

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
        'INSERT INTO profiles (id, user_id, profile_name, avatar, created_at) VALUES (?, ?, ?, ?, ?)',
        (profile_id, 'local_user', profile_name, avatar, created_at)
    )

    return jsonify({
        'success': True,
        'profile': {
            'id': profile_id,
            'name': profile_name,
            'avatar': avatar,
            'created_at': created_at
        }
    })

@app.route('/api/movies/profile/resolve', methods=['POST'])
def api_movies_profile_resolve():
    data = request.get_json(silent=True) or {}
    profile = _resolve_profile(
        profile_id=data.get('profile_id'),
        profile_name=data.get('profile_name'),
        avatar=data.get('avatar') or '👤'
    )
    if not profile:
        return jsonify({'error': 'Unable to resolve profile'}), 400
    return jsonify({'profile': _normalize_profile(profile)})

@app.route('/api/movies/profiles', methods=['POST'])
@admin_required
def api_movies_profiles_save():
    data = request.get_json()
    if not isinstance(data, list):
        return jsonify({'error': 'Expected a list of profiles'}), 400

    now = datetime.utcnow().isoformat()
    for p in data:
        profile_name = (p.get('name') or '').strip()
        avatar = p.get('emoji') or '👤'
        if not profile_name:
            continue
        existing = db.fetch_one(
            'SELECT id FROM profiles WHERE user_id = ? AND lower(profile_name) = lower(?)',
            ('local_user', profile_name)
        )
        if existing:
            db.execute_query('UPDATE profiles SET avatar = ? WHERE id = ?', (avatar, existing['id']))
        else:
            db.execute_query(
                'INSERT INTO profiles (id, user_id, profile_name, avatar, created_at) VALUES (?, ?, ?, ?, ?)',
                (str(uuid.uuid4()), 'local_user', profile_name, avatar, now)
            )
    log_admin_action('profiles_bulk_save', f'count={len(data)}')
    return jsonify({'success': True})

@app.route('/api/admin/profile/create', methods=['POST'])
@admin_required
def api_admin_profile_create():
    data = request.get_json(silent=True) or {}
    profile_name = (data.get('name') or data.get('profile_name') or '').strip()
    avatar = (data.get('emoji') or data.get('avatar') or '👤').strip() or '👤'

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
        'INSERT INTO profiles (id, user_id, profile_name, avatar, created_at) VALUES (?, ?, ?, ?, ?)',
        (profile_id, 'local_user', profile_name, avatar, created_at)
    )
    row = db.fetch_one('SELECT id, profile_name, avatar, created_at FROM profiles WHERE id = ?', (profile_id,))
    log_admin_action('profile_create', f'id={profile_id},name={profile_name}')
    return jsonify({'success': True, 'profile': _normalize_profile(row)})

@app.route('/api/admin/profile/update', methods=['POST'])
@admin_required
def api_admin_profile_update():
    data = request.get_json(silent=True) or {}
    profile_id = (data.get('id') or data.get('profile_id') or '').strip()
    profile_name = (data.get('name') or data.get('profile_name') or '').strip()
    avatar = (data.get('emoji') or data.get('avatar') or '👤').strip() or '👤'

    if not profile_id:
        return jsonify({'error': 'profile_id is required'}), 400
    if not profile_name:
        return jsonify({'error': 'profile_name is required'}), 400

    existing = db.fetch_one('SELECT id FROM profiles WHERE id = ?', (profile_id,))
    if not existing:
        return jsonify({'error': 'Profile not found'}), 404

    db.execute_query(
        'UPDATE profiles SET profile_name = ?, avatar = ? WHERE id = ?',
        (profile_name, avatar, profile_id)
    )
    row = db.fetch_one('SELECT id, profile_name, avatar, created_at FROM profiles WHERE id = ?', (profile_id,))
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

    db.execute_query('DELETE FROM watch_history WHERE profile_id = ?', (profile_id,))
    db.execute_query('DELETE FROM resume_progress WHERE profile_id = ?', (profile_id,))
    db.execute_query('DELETE FROM watchlist WHERE profile_id = ?', (profile_id,))
    db.execute_query('DELETE FROM profiles WHERE id = ?', (profile_id,))
    log_admin_action('profile_delete', f'id={profile_id}')
    return jsonify({'success': True})

@app.route('/api/movies/resume-progress', methods=['POST'])
def api_movies_resume_progress_save():
    data = request.get_json(silent=True) or {}

    content_id = str(data.get('content_id') or '').strip()
    content_type = (data.get('content_type') or 'movie').strip().lower()
    if content_type not in ('movie', 'tv'):
        content_type = 'movie'
    if not content_id:
        return jsonify({'error': 'content_id is required'}), 400

    profile = _resolve_profile(
        profile_id=data.get('profile_id') or request.headers.get('X-Profile-Id'),
        profile_name=data.get('profile_name')
    )
    if not profile:
        return jsonify({'error': 'profile is required'}), 400

    ts = max(0, _int_or_zero(data.get('timestamp')))
    duration = max(0, _int_or_zero(data.get('duration')))
    pct = _float_or_zero(data.get('progress_percent'))
    if pct <= 0 and duration > 0:
        pct = (ts / duration) * 100.0
    pct = max(0.0, min(100.0, pct))

    now = datetime.utcnow().isoformat()
    title = (data.get('title') or '').strip()
    poster = (data.get('poster') or '').strip()
    season = data.get('season')
    episode = data.get('episode')

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
    ''', (profile['id'], content_id, content_type, title, poster, season, episode, ts, duration, pct, now))

    db.execute_query('''
        INSERT INTO watch_history (id, profile_id, content_id, content_type, timestamp, duration, progress, last_watched)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ''', (str(uuid.uuid4()), profile['id'], content_id, content_type, ts, duration, pct / 100.0, now))

    return jsonify({'success': True})

@app.route('/api/movies/resume-progress', methods=['GET'])
def api_movies_resume_progress_get():
    content_id = str(request.args.get('content_id', '')).strip()
    content_type = (request.args.get('content_type', 'movie') or 'movie').strip().lower()
    profile = _resolve_profile(
        profile_id=request.args.get('profile_id') or request.headers.get('X-Profile-Id'),
        profile_name=request.args.get('profile_name')
    )
    if not profile:
        return jsonify({'progress': None})

    if content_id:
        row = db.fetch_one('''
            SELECT * FROM resume_progress
            WHERE profile_id = ? AND content_id = ? AND content_type = ?
        ''', (profile['id'], content_id, content_type))
        return jsonify({'progress': row})

    rows = db.fetch_all('''
        SELECT * FROM resume_progress
        WHERE profile_id = ?
        ORDER BY updated_at DESC
        LIMIT 100
    ''', (profile['id'],))
    return jsonify({'items': rows})

@app.route('/api/movies/continue-watching', methods=['GET'])
def api_movies_continue_watching():
    profile = _resolve_profile(
        profile_id=request.args.get('profile_id') or request.headers.get('X-Profile-Id'),
        profile_name=request.args.get('profile_name')
    )
    if not profile:
        return jsonify({'items': []})

    rows = db.fetch_all('''
        SELECT profile_id, content_id, content_type, title, poster, season, episode, timestamp, duration, progress_percent, updated_at
        FROM resume_progress
        WHERE profile_id = ?
          AND timestamp > 0
          AND progress_percent < 98
        ORDER BY updated_at DESC
        LIMIT 40
    ''', (profile['id'],))

    items = []
    for r in rows:
        items.append({
            'tmdbId': r.get('content_id'),
            'mediaType': r.get('content_type'),
            'title': r.get('title'),
            'poster': r.get('poster'),
            'season': r.get('season'),
            'episode': r.get('episode'),
            'timestamp': r.get('timestamp') or 0,
            'duration': r.get('duration') or 0,
            'progress': max(0.0, min(1.0, (_float_or_zero(r.get('progress_percent')) / 100.0))),
            'savedAt': int(datetime.fromisoformat(r.get('updated_at')).timestamp() * 1000) if r.get('updated_at') else 0
        })

    return jsonify({'items': items})

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
    return jsonify({'tmdb_key': _get_tmdb_key()})

@app.route('/api/movies/config', methods=['POST'])
@admin_required
def api_movies_config_save():
    data = request.get_json(silent=True) or {}
    key = (data.get('tmdb_key') or '').strip()
    if not key:
        return jsonify({'error': 'tmdb_key is required'}), 400
    _set_tmdb_key(key)
    log_admin_action('tmdb_key_updated', 'key_updated')
    return jsonify({'success': True})

@app.route('/api/movies/tmdb-status', methods=['GET'])
@admin_required
def api_movies_tmdb_status():
    import urllib.request, urllib.error, urllib.parse
    key = _get_tmdb_key()
    if not key:
        return jsonify({'status': 'no_key', 'message': 'No TMDB API key configured'})
    try:
        target_url = f'https://api.themoviedb.org/3/configuration?api_key={key}'
        url = f"{TMDB_PROXY_WORKER_URL}?target={urllib.parse.quote(target_url, safe='')}"
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

# ── TMDB PROXY API ────────────────────────────────────────────────
_TMDB_CACHE = {}
TMDB_CACHE_TTL = 300  # 5 minutes

def _tmdb_fetch(path, params=None):
    """Fetch from TMDB using server's IP, with caching."""
    key = _get_tmdb_key()
    if not key:
        abort(500, description="TMDB API key not configured")
        
    import urllib.parse
    
    # Build URL
    base_url = f"https://api.themoviedb.org/3{path}"
    query = {'api_key': key, 'language': 'en-US'}
    if params:
        query.update(params)
    
    target_url = f"{base_url}?{urllib.parse.urlencode(query)}"
    url = f"{TMDB_PROXY_WORKER_URL}?target={urllib.parse.quote(target_url, safe='')}"
    
    # Check cache
    now = time.time()
    if url in _TMDB_CACHE:
        cached = _TMDB_CACHE[url]
        if now - cached['ts'] < TMDB_CACHE_TTL:
            return cached['data']
            
    # Fetch
    import urllib.request, urllib.error
    req = urllib.request.Request(url, headers={'User-Agent': 'ToxibhFlix/1.0'})
    try:
        with urllib.request.urlopen(req, timeout=10) as res:
            data = json.loads(res.read())
            _TMDB_CACHE[url] = {'data': data, 'ts': now}
            
            # Basic cleanup of old cache entries
            if len(_TMDB_CACHE) > 100:
                expired = [k for k, v in _TMDB_CACHE.items() if now - v['ts'] > TMDB_CACHE_TTL]
                for k in expired:
                    _TMDB_CACHE.pop(k, None)
                    
            return data
    except urllib.error.HTTPError as e:
        abort(e.code, description=f"TMDB API Error: {e.reason}")
    except Exception as e:
        abort(502, description=f"Bad Gateway: {str(e)}")

@app.route('/api/tmdb/trending')
def tmdb_proxy_trending():
    return jsonify(_tmdb_fetch('/trending/movie/week'))

@app.route('/api/tmdb/popular')
def tmdb_proxy_popular():
    return jsonify(_tmdb_fetch('/movie/popular'))

@app.route('/api/tmdb/top-rated')
def tmdb_proxy_top_rated():
    return jsonify(_tmdb_fetch('/movie/top_rated'))

@app.route('/api/tmdb/upcoming')
def tmdb_proxy_upcoming():
    return jsonify(_tmdb_fetch('/movie/upcoming'))

@app.route('/api/tmdb/search')
def tmdb_proxy_search():
    q = request.args.get('q', '')
    page = request.args.get('page', 1)
    if not q:
        return jsonify({'results': []})
    return jsonify(_tmdb_fetch('/search/movie', {'query': q, 'page': page}))

@app.route('/api/tmdb/movie/<int:movie_id>')
def tmdb_proxy_movie(movie_id):
    append = request.args.get('append_to_response', 'credits')
    return jsonify(_tmdb_fetch(f'/movie/{movie_id}', {'append_to_response': append}))

@app.route('/api/tmdb/movie/<int:movie_id>/recommendations')
def tmdb_proxy_movie_recommendations(movie_id):
    return jsonify(_tmdb_fetch(f'/movie/{movie_id}/recommendations'))

@app.route('/api/tmdb/movie/<int:movie_id>/videos')
def tmdb_proxy_movie_videos(movie_id):
    return jsonify(_tmdb_fetch(f'/movie/{movie_id}/videos'))

# ── TMDB TV SHOW PROXY ────────────────────────────────────────────
@app.route('/api/tmdb/trending/tv')
def tmdb_proxy_trending_tv():
    return jsonify(_tmdb_fetch('/trending/tv/week'))

@app.route('/api/tmdb/popular/tv')
def tmdb_proxy_popular_tv():
    return jsonify(_tmdb_fetch('/tv/popular'))

@app.route('/api/tmdb/top-rated/tv')
def tmdb_proxy_top_rated_tv():
    return jsonify(_tmdb_fetch('/tv/top_rated'))

@app.route('/api/tmdb/airing/tv')
def tmdb_proxy_airing_tv():
    return jsonify(_tmdb_fetch('/tv/airing_today'))

@app.route('/api/tmdb/on-air/tv')
def tmdb_proxy_on_air_tv():
    return jsonify(_tmdb_fetch('/tv/on_the_air'))

@app.route('/api/tmdb/search/tv')
def tmdb_proxy_search_tv():
    q = request.args.get('q', '')
    page = request.args.get('page', 1)
    if not q:
        return jsonify({'results': []})
    return jsonify(_tmdb_fetch('/search/tv', {'query': q, 'page': page}))

@app.route('/api/tmdb/tv/<int:show_id>')
def tmdb_proxy_tv_show(show_id):
    return jsonify(_tmdb_fetch(f'/tv/{show_id}'))

@app.route('/api/tmdb/tv/<int:show_id>/season/<int:season_num>')
def tmdb_proxy_tv_season(show_id, season_num):
    return jsonify(_tmdb_fetch(f'/tv/{show_id}/season/{season_num}'))

@app.route('/api/tmdb/tv/<int:show_id>/recommendations')
def tmdb_proxy_tv_recommendations(show_id):
    return jsonify(_tmdb_fetch(f'/tv/{show_id}/recommendations'))

@app.route('/api/tmdb/tv/<int:show_id>/videos')
def tmdb_proxy_tv_videos(show_id):
    return jsonify(_tmdb_fetch(f'/tv/{show_id}/videos'))

@app.route('/api/tmdb/tv/<int:show_id>/credits')
def tmdb_proxy_tv_credits(show_id):
    return jsonify(_tmdb_fetch(f'/tv/{show_id}/credits'))

# ── TMDB GENRES & DISCOVER ────────────────────────────────────────
@app.route('/api/tmdb/genres/movies')
def tmdb_proxy_genres_movies():
    return jsonify(_tmdb_fetch('/genre/movie/list'))

@app.route('/api/tmdb/genres/tv')
def tmdb_proxy_genres_tv():
    return jsonify(_tmdb_fetch('/genre/tv/list'))

@app.route('/api/tmdb/discover/movie')
def tmdb_proxy_discover_movie():
    return jsonify(_tmdb_fetch('/discover/movie', params=request.args))

@app.route('/api/tmdb/discover/tv')
def tmdb_proxy_discover_tv():
    return jsonify(_tmdb_fetch('/discover/tv', params=request.args))

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
    print('\n🚀 TOXIBH FLASK SERVER (SQLite / Termux Cloudflare Deploy)')
    print('   Portfolio  :  http://localhost:8080')
    print('   Admin      :  http://localhost:8080/admin\n')
    app.run(host='0.0.0.0', port=8080, debug=False)
