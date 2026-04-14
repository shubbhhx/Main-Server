import os
import re
import sqlite3
import bcrypt
from datetime import datetime

def _is_writable_dir(path):
    try:
        os.makedirs(path, exist_ok=True)
        test_file = os.path.join(path, '.toxibh_write_test')
        with open(test_file, 'w', encoding='utf-8') as f:
            f.write('ok')
        os.remove(test_file)
        return True
    except Exception:
        return False


def _detect_data_root():
    env_path = os.environ.get('TOXIBH_DATA_ROOT', '').strip()
    candidates = []
    if env_path:
        candidates.append(env_path)
    candidates.append(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data'))
    candidates.append(os.path.abspath(os.path.join(os.sep, 'data')))
    candidates.append(os.path.join(os.path.expanduser('~'), 'data'))

    for candidate in candidates:
        if _is_writable_dir(candidate):
            return candidate

    return os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')


DATA_ROOT = _detect_data_root()
DB_DIR = os.path.join(DATA_ROOT, 'databases')

ADMIN_DB_PATH = os.path.join(DB_DIR, 'admin.db')
FLIX_DB_PATH = os.path.join(DB_DIR, 'flix.db')
ANALYTICS_DB_PATH = os.path.join(DB_DIR, 'analytics.db')

DEFAULT_MOVIE_PROFILES = [
    ('guest', 'local_user', 'Guest', '👤'),
]

LEGACY_DUMMY_PROFILE_IDS = [
    'profile_shubham',
    'profile_chill',
    'profile_night',
    'profile_action',
]

DB_NAME_TO_PATH = {
    'admin': ADMIN_DB_PATH,
    'flix': FLIX_DB_PATH,
    'analytics': ANALYTICS_DB_PATH,
}

TABLE_TO_DB = {
    'admins': 'admin',
    'visitors': 'admin',
    'messages': 'admin',
    'notes': 'admin',
    'passwords': 'admin',
    'vault_files': 'admin',
    'chatbot_logs': 'admin',
    'game_scores': 'admin',
    'leaderboards': 'admin',
    'settings': 'admin',

    'users': 'flix',
    'profiles': 'flix',
    'watch_history': 'flix',
    'resume_progress': 'flix',
    'watchlist': 'flix',
    'downloaded_torrents': 'flix',

    'daily_visitors': 'analytics',
    'request_logs': 'analytics',
    'error_logs': 'analytics',
}


def _ensure_dirs():
    os.makedirs(DB_DIR, exist_ok=True)


def get_db(db_name='admin'):
    _ensure_dirs()
    db_path = DB_NAME_TO_PATH.get(db_name, ADMIN_DB_PATH)
    conn = sqlite3.connect(db_path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def _extract_table_name(query):
    q = (query or '').lower()
    patterns = [
        r'\binto\s+([a-zA-Z_][a-zA-Z0-9_]*)',
        r'\bupdate\s+([a-zA-Z_][a-zA-Z0-9_]*)',
        r'\bfrom\s+([a-zA-Z_][a-zA-Z0-9_]*)',
        r'\bjoin\s+([a-zA-Z_][a-zA-Z0-9_]*)',
    ]
    for pattern in patterns:
        m = re.search(pattern, q)
        if m:
            return m.group(1)
    return None


def _resolve_db_name(query, db_name=None):
    if db_name:
        return db_name
    table_name = _extract_table_name(query)
    return TABLE_TO_DB.get(table_name, 'admin')


def _init_admin_db():
    conn = get_db('admin')
    c = conn.cursor()

    c.execute('''
        CREATE TABLE IF NOT EXISTS admins (
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL
        )
    ''')

    c.execute('''
        CREATE TABLE IF NOT EXISTS visitors (
            id TEXT PRIMARY KEY,
            ip TEXT,
            user_agent TEXT,
            referrer TEXT,
            page TEXT,
            country TEXT,
            time TEXT
        )
    ''')

    c.execute('''
        CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,
            name TEXT,
            email TEXT,
            message TEXT,
            time TEXT,
            read INTEGER DEFAULT 0,
            ip TEXT
        )
    ''')

    c.execute('''
        CREATE TABLE IF NOT EXISTS notes (
            id TEXT PRIMARY KEY,
            title TEXT,
            content TEXT,
            color TEXT,
            time TEXT,
            updated TEXT
        )
    ''')

    c.execute('''
        CREATE TABLE IF NOT EXISTS passwords (
            id TEXT PRIMARY KEY,
            site TEXT,
            username TEXT,
            password TEXT,
            category TEXT,
            notes TEXT,
            time TEXT,
            updated TEXT
        )
    ''')

    c.execute('''
        CREATE TABLE IF NOT EXISTS vault_files (
            id TEXT PRIMARY KEY,
            filename TEXT NOT NULL,
            filetype TEXT NOT NULL,
            filepath TEXT NOT NULL,
            upload_date TEXT NOT NULL,
            original_name TEXT,
            mimetype TEXT,
            size INTEGER
        )
    ''')

    c.execute('''
        CREATE TABLE IF NOT EXISTS chatbot_logs (
            id TEXT PRIMARY KEY,
            user_message TEXT,
            ai_response TEXT,
            time TEXT,
            ip TEXT
        )
    ''')

    c.execute('''
        CREATE TABLE IF NOT EXISTS game_scores (
            id TEXT PRIMARY KEY,
            player_name TEXT,
            game_name TEXT,
            score INTEGER,
            timestamp TEXT
        )
    ''')

    c.execute('''
        CREATE TABLE IF NOT EXISTS leaderboards (
            id TEXT PRIMARY KEY,
            game_name TEXT NOT NULL,
            player_name TEXT NOT NULL,
            high_score INTEGER NOT NULL DEFAULT 0,
            updated_at TEXT NOT NULL,
            UNIQUE(game_name, player_name)
        )
    ''')

    c.execute('CREATE INDEX IF NOT EXISTS idx_leaderboards_game_score ON leaderboards(game_name, high_score DESC)')

    c.execute('''
        INSERT INTO leaderboards (id, game_name, player_name, high_score, updated_at)
        SELECT
            lower(hex(randomblob(16))),
            lower(trim(game_name)),
            trim(player_name),
            MAX(COALESCE(score, 0)) AS high_score,
            COALESCE(MAX(timestamp), CURRENT_TIMESTAMP)
        FROM game_scores
        WHERE trim(COALESCE(game_name, '')) <> ''
          AND trim(COALESCE(player_name, '')) <> ''
        GROUP BY lower(trim(game_name)), trim(player_name)
        ON CONFLICT(game_name, player_name)
        DO UPDATE SET
            high_score = CASE
                WHEN excluded.high_score > leaderboards.high_score THEN excluded.high_score
                ELSE leaderboards.high_score
            END,
            updated_at = CASE
                WHEN excluded.high_score > leaderboards.high_score THEN excluded.updated_at
                ELSE leaderboards.updated_at
            END
    ''')

    c.execute('''
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
        )
    ''')

    c.execute("SELECT * FROM admins WHERE username = 'toxibh-shubh@6969'")
    if not c.fetchone():
        hashed = bcrypt.hashpw(b'toxibh@6967', bcrypt.gensalt()).decode('utf-8')
        c.execute(
            "INSERT INTO admins (id, username, password_hash) VALUES (?, ?, ?)",
            ('admin_1', 'toxibh-shubh@6969', hashed)
        )

    conn.commit()
    conn.close()


def _init_flix_db():
    conn = get_db('flix')
    c = conn.cursor()

    c.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            created_at TEXT NOT NULL
        )
    ''')

    c.execute('''
        CREATE TABLE IF NOT EXISTS profiles (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            profile_name TEXT NOT NULL,
            avatar TEXT,
            created_at TEXT NOT NULL,
            UNIQUE(user_id, profile_name),
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    ''')

    c.execute('''
        CREATE TABLE IF NOT EXISTS watch_history (
            id TEXT PRIMARY KEY,
            profile_id TEXT NOT NULL,
            content_id TEXT NOT NULL,
            content_type TEXT NOT NULL,
            timestamp INTEGER DEFAULT 0,
            duration INTEGER DEFAULT 0,
            progress REAL DEFAULT 0,
            last_watched TEXT NOT NULL,
            FOREIGN KEY (profile_id) REFERENCES profiles(id)
        )
    ''')

    c.execute('''
        CREATE TABLE IF NOT EXISTS resume_progress (
            profile_id TEXT NOT NULL,
            content_id TEXT NOT NULL,
            content_type TEXT NOT NULL,
            title TEXT,
            poster TEXT,
            season INTEGER,
            episode INTEGER,
            timestamp INTEGER DEFAULT 0,
            duration INTEGER DEFAULT 0,
            progress_percent REAL DEFAULT 0,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (profile_id, content_id, content_type),
            FOREIGN KEY (profile_id) REFERENCES profiles(id)
        )
    ''')

    c.execute('''
        CREATE TABLE IF NOT EXISTS watchlist (
            profile_id TEXT NOT NULL,
            content_id TEXT NOT NULL,
            content_type TEXT NOT NULL,
            title TEXT,
            poster TEXT,
            added_at TEXT NOT NULL,
            PRIMARY KEY (profile_id, content_id, content_type),
            FOREIGN KEY (profile_id) REFERENCES profiles(id)
        )
    ''')

    c.execute('''
        CREATE TABLE IF NOT EXISTS downloaded_torrents (
            id TEXT PRIMARY KEY,
            torrent_hash TEXT NOT NULL UNIQUE,
            name TEXT,
            content_path TEXT,
            total_size INTEGER DEFAULT 0,
            removed_at TEXT NOT NULL
        )
    ''')

    c.execute('CREATE INDEX IF NOT EXISTS idx_watch_history_profile_time ON watch_history(profile_id, last_watched DESC)')
    c.execute('CREATE INDEX IF NOT EXISTS idx_resume_profile_updated ON resume_progress(profile_id, updated_at DESC)')
    c.execute('CREATE INDEX IF NOT EXISTS idx_watchlist_profile_added ON watchlist(profile_id, added_at DESC)')
    c.execute('CREATE INDEX IF NOT EXISTS idx_downloaded_torrents_removed ON downloaded_torrents(removed_at DESC)')

    c.execute('''
        CREATE VIEW IF NOT EXISTS Profiles AS
        SELECT id, profile_name AS name, avatar
        FROM profiles
    ''')

    c.execute('''
        CREATE VIEW IF NOT EXISTS WatchHistory AS
        SELECT profile_id, content_id AS movie_id, progress
        FROM watch_history
    ''')

    c.execute('''
        CREATE VIEW IF NOT EXISTS Wishlist AS
        SELECT profile_id, content_id AS movie_id
        FROM watchlist
    ''')

    now = datetime.utcnow().isoformat()
    c.execute(
        "INSERT OR IGNORE INTO users (id, username, created_at) VALUES (?, ?, ?)",
        ('local_user', 'Local User', now)
    )

    for profile_id, user_id, profile_name, avatar in DEFAULT_MOVIE_PROFILES:
        c.execute('''
            INSERT OR IGNORE INTO profiles (id, user_id, profile_name, avatar, created_at)
            VALUES (?, ?, ?, ?, ?)
        ''', (profile_id, user_id, profile_name, avatar, now))

    for legacy_profile_id in LEGACY_DUMMY_PROFILE_IDS:
        c.execute('DELETE FROM watch_history WHERE profile_id = ?', (legacy_profile_id,))
        c.execute('DELETE FROM resume_progress WHERE profile_id = ?', (legacy_profile_id,))
        c.execute('DELETE FROM watchlist WHERE profile_id = ?', (legacy_profile_id,))
        c.execute('DELETE FROM profiles WHERE id = ?', (legacy_profile_id,))

    conn.commit()
    conn.close()


def _init_analytics_db():
    conn = get_db('analytics')
    c = conn.cursor()

    c.execute('''
        CREATE TABLE IF NOT EXISTS daily_visitors (
            visit_date TEXT PRIMARY KEY,
            total_count INTEGER NOT NULL DEFAULT 0
        )
    ''')

    c.execute('''
        CREATE TABLE IF NOT EXISTS request_logs (
            id TEXT PRIMARY KEY,
            method TEXT,
            path TEXT,
            status_code INTEGER,
            response_ms REAL,
            ip TEXT,
            user_agent TEXT,
            created_at TEXT
        )
    ''')

    c.execute('''
        CREATE TABLE IF NOT EXISTS error_logs (
            id TEXT PRIMARY KEY,
            path TEXT,
            method TEXT,
            status_code INTEGER,
            error_message TEXT,
            ip TEXT,
            created_at TEXT
        )
    ''')

    conn.commit()
    conn.close()


def init_db():
    _ensure_dirs()
    _init_admin_db()
    _init_flix_db()
    _init_analytics_db()


def execute_query(query, args=(), db_name=None):
    resolved_db = _resolve_db_name(query, db_name=db_name)
    conn = get_db(resolved_db)
    try:
        c = conn.cursor()
        c.execute(query, args)
        conn.commit()
        return True
    except Exception as e:
        print(f"DB Error: {e}")
        return False
    finally:
        conn.close()


def fetch_all(query, args=(), db_name=None):
    resolved_db = _resolve_db_name(query, db_name=db_name)
    conn = get_db(resolved_db)
    try:
        c = conn.cursor()
        c.execute(query, args)
        return [dict(row) for row in c.fetchall()]
    except Exception as e:
        print(f"DB Error: {e}")
        return []
    finally:
        conn.close()


def fetch_one(query, args=(), db_name=None):
    resolved_db = _resolve_db_name(query, db_name=db_name)
    conn = get_db(resolved_db)
    try:
        c = conn.cursor()
        c.execute(query, args)
        row = c.fetchone()
        return dict(row) if row else None
    except Exception as e:
        print(f"DB Error: {e}")
        return None
    finally:
        conn.close()


def set_setting(key, value):
    return execute_query(
        '''
        INSERT INTO settings (key, value)
        VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
        ''',
        (key, value),
        db_name='admin'
    )


def get_setting(key, default=None):
    row = fetch_one('SELECT value FROM settings WHERE key = ?', (key,), db_name='admin')
    if not row:
        return default
    return row.get('value', default)
