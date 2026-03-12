import sqlite3
import os
import bcrypt

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'database', 'toxibh.db')

def get_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    c = conn.cursor()
    
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
    
    # Create default admin if not exists
    c.execute("SELECT * FROM admins WHERE username = 'toxibh-shubh@6969'")
    if not c.fetchone():
        hashed = bcrypt.hashpw(b'toxibh@6967', bcrypt.gensalt()).decode('utf-8')
        c.execute("INSERT INTO admins (id, username, password_hash) VALUES (?, ?, ?)", 
                  ('admin_1', 'toxibh-shubh@6969', hashed))
        
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
