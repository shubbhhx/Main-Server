# ═══════════════════════════════════════════════════════════
#  TOXIBH ADMIN  —  app.py  (Flask Backend + SQLite DB)
#  Run:  python app.py
# ═══════════════════════════════════════════════════════════

import os, uuid, bcrypt, mimetypes, json
from datetime import datetime, timedelta
from functools import wraps
from flask import (Flask, request, jsonify, session,
                   send_from_directory, abort)
from werkzeug.utils import secure_filename
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_session import Session
import db

# ── APP SETUP ────────────────────────────────────────────
app = Flask(__name__, static_folder='static', template_folder='templates')

# Termux/Android Session Optimizations
app.config['SECRET_KEY'] = 'toxibh_flask_secret_xR9pQz2026'
app.config['SESSION_TYPE'] = 'filesystem'
app.config['SESSION_FILE_DIR'] = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'flask_session')
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(hours=8)
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SECURE'] = False
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024  # 100 MB

Session(app)
limiter = Limiter(get_remote_address, app=app, default_limits=["500 per hour"])

# ── INIT DATABASE ────────────────────────────────────────
db.init_db()

# ── PATHS ─────────────────────────────────────────────────
BASE_DIR    = os.path.dirname(os.path.abspath(__file__))
PHOTOS_DIR  = os.path.join(BASE_DIR, 'static', 'photos')
PDFS_DIR    = os.path.join(BASE_DIR, 'static', 'pdfs')

for d in [PHOTOS_DIR, PDFS_DIR, app.config['SESSION_FILE_DIR']]:
    os.makedirs(d, exist_ok=True)

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
    return send_from_directory('templates', 'admin.html')

# Protected file serving
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
#  RUN
# ══════════════════════════════════════════════════════════
if __name__ == '__main__':
    print('\n🚀 TOXIBH FLASK SERVER (SQLite / Termux Cloudflare Deploy)')
    print('   Portfolio  :  http://localhost:5000')
    print('   Admin      :  http://localhost:5000/admin\n')
    app.run(host='0.0.0.0', port=5000, debug=False)
