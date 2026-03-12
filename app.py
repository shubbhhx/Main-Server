# ═══════════════════════════════════════════════════════════
#  TOXIBH ADMIN  —  app.py  (Flask Backend)
#  Run:  python app.py
#  Portfolio : http://localhost:5000
#  Admin     : http://localhost:5000/admin
# ═══════════════════════════════════════════════════════════

import os, json, uuid, bcrypt, mimetypes
from datetime import datetime, timedelta
from functools import wraps
from flask import (Flask, request, jsonify, session,
                   send_from_directory, render_template,
                   send_file, abort)
from werkzeug.utils import secure_filename
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

# ── APP SETUP ────────────────────────────────────────────
app = Flask(__name__, static_folder='static', template_folder='templates')
app.secret_key = 'toxibh_flask_secret_xR9pQz2026'
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(hours=8)
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024  # 100 MB
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SECURE'] = False

limiter = Limiter(get_remote_address, app=app, default_limits=["500 per hour"])

# ── PATHS ─────────────────────────────────────────────────
BASE_DIR    = os.path.dirname(os.path.abspath(__file__))
DATA_DIR    = os.path.join(BASE_DIR, 'data')
PHOTOS_DIR  = os.path.join(BASE_DIR, 'static', 'photos')
PDFS_DIR    = os.path.join(BASE_DIR, 'static', 'pdfs')

for d in [DATA_DIR, PHOTOS_DIR, PDFS_DIR]:
    os.makedirs(d, exist_ok=True)

VISITORS_F  = os.path.join(DATA_DIR, 'visitors.json')
MESSAGES_F  = os.path.join(DATA_DIR, 'messages.json')
NOTES_F     = os.path.join(DATA_DIR, 'notes.json')
PASSWORDS_F = os.path.join(DATA_DIR, 'passwords.json')
FILES_F     = os.path.join(DATA_DIR, 'files.json')

# ── CREDENTIALS ──────────────────────────────────────────
ADMIN_USER   = 'toxibh-shubh@6969'
ADMIN_PASS   = bcrypt.hashpw(b'toxibh@6967', bcrypt.gensalt())
SECRET_KEY   = 'toxibh-shubh@6969'

ALLOWED_IMG  = {'image/jpeg', 'image/png', 'image/gif', 'image/webp'}
ALLOWED_PDF  = {'application/pdf'}

# ── JSON HELPERS ─────────────────────────────────────────
def rj(path, default=None):
    if default is None: default = []
    try:
        with open(path, 'r') as f: return json.load(f)
    except: return default

def wj(path, data):
    with open(path, 'w') as f: json.dump(data, f, indent=2, default=str)

# Init files
for f in [VISITORS_F, MESSAGES_F, NOTES_F, PASSWORDS_F, FILES_F]:
    if not os.path.exists(f): wj(f, [])

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
        visitors = rj(VISITORS_F)
        visitors.insert(0, {
            'id': str(uuid.uuid4()),
            'ip': request.headers.get('X-Forwarded-For', request.remote_addr or 'unknown'),
            'user_agent': request.headers.get('User-Agent', 'unknown'),
            'referrer': request.headers.get('Referer', 'direct'),
            'time': datetime.utcnow().isoformat(),
            'page': request.path
        })
        if len(visitors) > 1000: visitors = visitors[:1000]
        wj(VISITORS_F, visitors)

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
    if u == ADMIN_USER and bcrypt.checkpw(p, ADMIN_PASS):
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
    visitors  = rj(VISITORS_F)
    messages  = rj(MESSAGES_F)
    notes     = rj(NOTES_F)
    passwords = rj(PASSWORDS_F)
    files     = rj(FILES_F)

    today = datetime.utcnow().date().isoformat()
    today_vis = sum(1 for v in visitors if v.get('time','')[:10] == today)

    # 7-day chart
    chart = {}
    for i in range(6, -1, -1):
        d = (datetime.utcnow() - timedelta(days=i))
        label = d.strftime('%d %b')
        chart[label] = 0
    for v in visitors:
        try:
            d = datetime.fromisoformat(v['time'])
            label = d.strftime('%d %b')
            if label in chart:
                chart[label] += 1
        except: pass

    return jsonify({
        'totalVisitors':  len(visitors),
        'todayVisitors':  today_vis,
        'totalMessages':  len(messages),
        'unreadMessages': sum(1 for m in messages if not m.get('read')),
        'totalNotes':     len(notes),
        'totalPasswords': len(passwords),
        'totalFiles':     len(files),
        'photos':         sum(1 for f in files if f.get('type') == 'photo'),
        'pdfs':           sum(1 for f in files if f.get('type') == 'pdf'),
        'visitorChart':   chart
    })

# ══════════════════════════════════════════════════════════
#  VISITORS
# ══════════════════════════════════════════════════════════
@app.route('/api/visitors')
@admin_required
def get_visitors():
    visitors = rj(VISITORS_F)
    page  = int(request.args.get('page', 1))
    limit = int(request.args.get('limit', 25))
    start = (page - 1) * limit
    return jsonify({
        'total': len(visitors),
        'page': page, 'limit': limit,
        'data': visitors[start:start+limit]
    })

@app.route('/api/visitors', methods=['DELETE'])
@admin_required
def clear_visitors():
    wj(VISITORS_F, [])
    return jsonify({'success': True})

# ══════════════════════════════════════════════════════════
#  CONTACT MESSAGES
# ══════════════════════════════════════════════════════════
@app.route('/api/contact', methods=['POST'])
def contact():
    data = request.get_json(silent=True) or {}
    name    = data.get('name','').strip()
    email   = data.get('email','').strip()
    message = data.get('message','').strip()
    if not all([name, email, message]):
        return jsonify({'error': 'All fields required'}), 400
    messages = rj(MESSAGES_F)
    messages.insert(0, {
        'id': str(uuid.uuid4()),
        'name': name, 'email': email, 'message': message,
        'time': datetime.utcnow().isoformat(),
        'read': False,
        'ip': request.headers.get('X-Forwarded-For', request.remote_addr or 'unknown')
    })
    wj(MESSAGES_F, messages)
    return jsonify({'success': True})

@app.route('/api/messages')
@admin_required
def get_messages():
    return jsonify(rj(MESSAGES_F))

@app.route('/api/messages/<msg_id>/read', methods=['PATCH'])
@admin_required
def mark_read(msg_id):
    messages = rj(MESSAGES_F)
    for m in messages:
        if m['id'] == msg_id: m['read'] = True
    wj(MESSAGES_F, messages)
    return jsonify({'success': True})

@app.route('/api/messages/<msg_id>', methods=['DELETE'])
@admin_required
def del_message(msg_id):
    messages = [m for m in rj(MESSAGES_F) if m['id'] != msg_id]
    wj(MESSAGES_F, messages)
    return jsonify({'success': True})

# ══════════════════════════════════════════════════════════
#  NOTES
# ══════════════════════════════════════════════════════════
@app.route('/api/notes')
@admin_required
def get_notes():
    return jsonify(rj(NOTES_F))

@app.route('/api/notes', methods=['POST'])
@admin_required
def add_note():
    data = request.get_json(silent=True) or {}
    if not data.get('content','').strip():
        return jsonify({'error': 'Content required'}), 400
    note = {
        'id': str(uuid.uuid4()),
        'title':   data.get('title','Untitled').strip() or 'Untitled',
        'content': data['content'].strip(),
        'color':   data.get('color','cyan'),
        'time':    datetime.utcnow().isoformat(),
        'updated': datetime.utcnow().isoformat()
    }
    notes = rj(NOTES_F)
    notes.insert(0, note)
    wj(NOTES_F, notes)
    return jsonify(note)

@app.route('/api/notes/<note_id>', methods=['PUT'])
@admin_required
def update_note(note_id):
    data  = request.get_json(silent=True) or {}
    notes = rj(NOTES_F)
    for n in notes:
        if n['id'] == note_id:
            n.update({k: v for k,v in data.items() if k in ('title','content','color')})
            n['updated'] = datetime.utcnow().isoformat()
    wj(NOTES_F, notes)
    return jsonify({'success': True})

@app.route('/api/notes/<note_id>', methods=['DELETE'])
@admin_required
def del_note(note_id):
    wj(NOTES_F, [n for n in rj(NOTES_F) if n['id'] != note_id])
    return jsonify({'success': True})

# ══════════════════════════════════════════════════════════
#  PASSWORDS
# ══════════════════════════════════════════════════════════
@app.route('/api/passwords')
@admin_required
def get_passwords():
    return jsonify(rj(PASSWORDS_F))

@app.route('/api/passwords', methods=['POST'])
@admin_required
def add_password():
    data = request.get_json(silent=True) or {}
    if not data.get('site') or not data.get('password'):
        return jsonify({'error': 'Site and password required'}), 400
    entry = {
        'id':       str(uuid.uuid4()),
        'site':     data['site'].strip(),
        'username': data.get('username','').strip(),
        'password': data['password'],
        'category': data.get('category','General'),
        'notes':    data.get('notes','').strip(),
        'time':     datetime.utcnow().isoformat()
    }
    passwords = rj(PASSWORDS_F)
    passwords.insert(0, entry)
    wj(PASSWORDS_F, passwords)
    return jsonify(entry)

@app.route('/api/passwords/<pw_id>', methods=['PUT'])
@admin_required
def update_password(pw_id):
    data  = request.get_json(silent=True) or {}
    passwords = rj(PASSWORDS_F)
    for p in passwords:
        if p['id'] == pw_id:
            for k in ('site','username','password','category','notes'):
                if k in data: p[k] = data[k]
            p['updated'] = datetime.utcnow().isoformat()
    wj(PASSWORDS_F, passwords)
    return jsonify({'success': True})

@app.route('/api/passwords/<pw_id>', methods=['DELETE'])
@admin_required
def del_password(pw_id):
    wj(PASSWORDS_F, [p for p in rj(PASSWORDS_F) if p['id'] != pw_id])
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

    files_meta = rj(FILES_F)
    results = []

    for file in uploaded_files:
        if not file.filename: continue
        mime = file.mimetype or mimetypes.guess_type(file.filename)[0] or ''
        is_img = mime in ALLOWED_IMG
        is_pdf = mime in ALLOWED_PDF
        if not (is_img or is_pdf): continue

        ext      = os.path.splitext(secure_filename(file.filename))[1]
        new_name = str(uuid.uuid4()) + ext
        dest_dir = PHOTOS_DIR if is_img else PDFS_DIR
        dest     = os.path.join(dest_dir, new_name)
        file.save(dest)
        size = os.path.getsize(dest)

        entry = {
            'id':           str(uuid.uuid4()),
            'originalName': file.filename,
            'filename':     new_name,
            'type':         'photo' if is_img else 'pdf',
            'mimetype':     mime,
            'size':         size,
            'path':         f"static/{'photos' if is_img else 'pdfs'}/{new_name}",
            'time':         datetime.utcnow().isoformat()
        }
        files_meta.insert(0, entry)
        results.append(entry)

    wj(FILES_F, files_meta)
    return jsonify({'success': True, 'files': results})

@app.route('/api/files')
@admin_required
def get_files():
    ftype  = request.args.get('type')
    files  = rj(FILES_F)
    if ftype: files = [f for f in files if f.get('type') == ftype]
    return jsonify(files)

@app.route('/api/files/<file_id>', methods=['DELETE'])
@admin_required
def del_file(file_id):
    files = rj(FILES_F)
    entry = next((f for f in files if f['id'] == file_id), None)
    if entry:
        full = os.path.join(BASE_DIR, entry['path'])
        try: os.remove(full)
        except: pass
        wj(FILES_F, [f for f in files if f['id'] != file_id])
    return jsonify({'success': True})

# ══════════════════════════════════════════════════════════
#  RUN
# ══════════════════════════════════════════════════════════
if __name__ == '__main__':
    print('\n🚀 TOXIBH FLASK SERVER')
    print('   Portfolio  :  http://localhost:5000')
    print('   Admin      :  http://localhost:5000/admin\n')
    app.run(host='0.0.0.0', port=5000, debug=False)
