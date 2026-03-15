import sqlite3
import os
import bcrypt
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'database', 'toxibh.db')

DEFAULT_MOVIE_PROFILES = [
    ('profile_shubham', 'local_user', 'Shubham', '🤖'),
    ('profile_chill', 'local_user', 'Chill Mode', '🎮'),
    ('profile_night', 'local_user', 'Night Owl', '🌙'),
    ('profile_action', 'local_user', 'Action Fan', '⚡'),
]

def get_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    c = conn.cursor()

    # ToxibhFlix users
    c.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            created_at TEXT NOT NULL
        )
    ''')

    # ToxibhFlix profiles
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

    # ToxibhFlix watch history
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

    # ToxibhFlix resume progress (one row per profile/content)
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

    # ToxibhFlix watchlist (one row per profile/content)
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

    c.execute('CREATE INDEX IF NOT EXISTS idx_watch_history_profile_time ON watch_history(profile_id, last_watched DESC)')
    c.execute('CREATE INDEX IF NOT EXISTS idx_resume_profile_updated ON resume_progress(profile_id, updated_at DESC)')
    c.execute('CREATE INDEX IF NOT EXISTS idx_watchlist_profile_added ON watchlist(profile_id, added_at DESC)')
    
    # Admins
    c.execute('''
        CREATE TABLE IF NOT EXISTS admins (
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL
        )
    ''')
    
    # Visitors
    c.execute('''
        CREATE TABLE IF NOT EXISTS visitors (
            id TEXT PRIMARY KEY,
            ip TEXT,
            user_agent TEXT,
            referrer TEXT,
            time TEXT,
            page TEXT
        )
    ''')
    
    # Messages
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
    
    # Notes
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
    
    # Passwords
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
    
    # Files
    c.execute('''
        CREATE TABLE IF NOT EXISTS files (
            id TEXT PRIMARY KEY,
            original_name TEXT,
            filename TEXT,
            type TEXT,
            mimetype TEXT,
            size INTEGER,
            path TEXT,
            time TEXT
        )
    ''')
    
    # Chatbot Logs
    c.execute('''
        CREATE TABLE IF NOT EXISTS chatbot_logs (
            id TEXT PRIMARY KEY,
            user_message TEXT,
            ai_response TEXT,
            time TEXT,
            ip TEXT
        )
    ''')
    
    # Game Scores
    c.execute('''
        CREATE TABLE IF NOT EXISTS game_scores (
            id TEXT PRIMARY KEY,
            player_name TEXT,
            game_name TEXT,
            score INTEGER,
            timestamp TEXT
        )
    ''')
    
    # Create default admin if not exists
    c.execute("SELECT * FROM admins WHERE username = 'toxibh-shubh@6969'")
    if not c.fetchone():
        hashed = bcrypt.hashpw(b'toxibh@6967', bcrypt.gensalt()).decode('utf-8')
        c.execute("INSERT INTO admins (id, username, password_hash) VALUES (?, ?, ?)", 
                  ('admin_1', 'toxibh-shubh@6969', hashed))

    # Create default local user and movie profiles if they don't exist
    now = datetime.utcnow().isoformat()
    c.execute("INSERT OR IGNORE INTO users (id, username, created_at) VALUES (?, ?, ?)",
              ('local_user', 'Local User', now))

    for profile_id, user_id, profile_name, avatar in DEFAULT_MOVIE_PROFILES:
        c.execute('''
            INSERT OR IGNORE INTO profiles (id, user_id, profile_name, avatar, created_at)
            VALUES (?, ?, ?, ?, ?)
        ''', (profile_id, user_id, profile_name, avatar, now))
        
    conn.commit()
    conn.close()

def execute_query(query, args=()):
    conn = get_db()
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

def fetch_all(query, args=()):
    conn = get_db()
    try:
        c = conn.cursor()
        c.execute(query, args)
        return [dict(row) for row in c.fetchall()]
    except Exception as e:
        print(f"DB Error: {e}")
        return []
    finally:
        conn.close()

def fetch_one(query, args=()):
    conn = get_db()
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
