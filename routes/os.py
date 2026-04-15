import os
import uuid

from flask import Blueprint, current_app, jsonify, request, send_from_directory

from services.code_runner import CodeRunnerService
from services.filesystem import UserFilesystemService
from services.os_shared import build_file_items, ensure_dir, read_json_file, write_json_file

os_bp = Blueprint('os_bp', __name__)


def _os_context():
    app = current_app._get_current_object()
    data_root = app.config['TOXIBH_DATA_ROOT']
    state_dir = app.config['TOXIBH_OS_STATE_DIR']
    wallpapers_dir = app.config['TOXIBH_WALLPAPERS_DIR']
    projects_root = app.config['TOXIBH_PROJECTS_DIR']
    temp_root = app.config['TOXIBH_TEMP_DIR']

    return {
        'app': app,
        'data_root': data_root,
        'state_dir': state_dir,
        'settings_file': app.config['TOXIBH_OS_SETTINGS_FILE'],
        'chat_file': app.config['TOXIBH_OS_CHAT_FILE'],
        'wallpapers_dir': wallpapers_dir,
        'wallpaper_index_file': app.config['TOXIBH_WALLPAPER_INDEX_FILE'],
        'projects_root': projects_root,
        'temp_root': temp_root,
        'wallpaper_web_prefix': '/static/os/wallpapers',
        'default_wallpaper_url': '/static/os/default-wallpaper.jpg',
    }


def _default_os_settings():
    return {
        'pin': '0000',
        'wallpaper': {'mode': 'default', 'url': '/static/os/default-wallpaper.jpg', 'name': 'default'},
        'accent': '#00f5ff',
        'bootSound': False,
        'fullscreen': False,
    }


def _get_settings():
    ctx = _os_context()
    saved = read_json_file(ctx['settings_file'], _default_os_settings())
    merged = _default_os_settings()
    if isinstance(saved, dict):
        merged.update(saved)
    wallpaper = merged.get('wallpaper') or {}
    if isinstance(wallpaper, str):
        merged['wallpaper'] = {'mode': 'preset', 'name': wallpaper, 'url': ctx['default_wallpaper_url']}
    elif not isinstance(wallpaper, dict):
        merged['wallpaper'] = {'mode': 'default', 'url': ctx['default_wallpaper_url'], 'name': 'default'}
    return merged


def _save_settings(settings):
    ctx = _os_context()
    ensure_dir(ctx['state_dir'])
    write_json_file(ctx['settings_file'], settings)


def _get_file_service():
    ctx = _os_context()
    return UserFilesystemService(ctx['projects_root'])


def _get_code_runner():
    ctx = _os_context()
    return CodeRunnerService(ctx['temp_root'])


@os_bp.route('/os')
def os_page():
    return send_from_directory('templates/os', 'index.html')


@os_bp.route('/api/os/settings', methods=['GET'])
def api_os_settings_get():
    return jsonify(_get_settings())


@os_bp.route('/api/os/settings', methods=['POST'])
def api_os_settings_set():
    payload = request.get_json(silent=True) or {}
    if not isinstance(payload, dict):
        return jsonify({'error': 'Invalid payload'}), 400

    settings = _get_settings()
    pin = str(payload.get('pin', settings.get('pin', '0000'))).strip()
    if not pin.isdigit() or not (4 <= len(pin) <= 8):
        return jsonify({'error': 'PIN must be 4 to 8 digits'}), 400

    wallpaper = settings.get('wallpaper') or {}
    if 'wallpaper' in payload:
        value = payload['wallpaper']
        if isinstance(value, dict):
            wallpaper = value
        elif isinstance(value, str):
            wallpaper = {'mode': 'preset', 'name': value, 'url': '/static/os/default-wallpaper.jpg'}

    settings['pin'] = pin
    settings['wallpaper'] = wallpaper
    settings['accent'] = payload.get('accent', settings.get('accent', '#00f5ff'))
    settings['bootSound'] = bool(payload.get('bootSound', settings.get('bootSound', False)))
    _save_settings(settings)
    return jsonify({'success': True, 'settings': settings})


@os_bp.route('/api/wallpaper/current', methods=['GET'])
def api_wallpaper_current():
    settings = _get_settings()
    wallpaper = settings.get('wallpaper') or {}
    if isinstance(wallpaper, str):
        wallpaper = {'mode': 'preset', 'name': wallpaper, 'url': '/static/os/default-wallpaper.jpg'}
    return jsonify({'wallpaper': wallpaper})


@os_bp.route('/api/wallpaper/upload', methods=['POST'])
def api_wallpaper_upload():
    ctx = _os_context()
    file_obj = request.files.get('wallpaper') or request.files.get('file')
    if not file_obj:
        return jsonify({'error': 'wallpaper file is required'}), 400

    filename = file_obj.filename or ''
    ext = os.path.splitext(filename)[1].lower()
    if ext not in {'.png', '.jpg', '.jpeg', '.webp'}:
        return jsonify({'error': 'Unsupported file type'}), 400

    ensure_dir(ctx['wallpapers_dir'])
    stored_name = f"{uuid.uuid4().hex}{ext}"
    stored_path = os.path.join(ctx['wallpapers_dir'], stored_name)
    file_obj.save(stored_path)

    index = read_json_file(ctx['wallpaper_index_file'], {})
    if not isinstance(index, dict):
        index = {}
    index[stored_name] = {
        'name': filename,
        'url': f"{ctx['wallpaper_web_prefix']}/{stored_name}",
        'createdAt': uuid.uuid4().hex,
    }
    write_json_file(ctx['wallpaper_index_file'], index)

    return jsonify({'success': True, 'wallpaper': index[stored_name]})


@os_bp.route('/api/wallpaper/set', methods=['POST'])
def api_wallpaper_set():
    payload = request.get_json(silent=True) or {}
    wallpaper_url = (payload.get('url') or payload.get('wallpaperUrl') or '').strip()
    wallpaper_name = (payload.get('name') or payload.get('wallpaperName') or 'custom').strip()
    if not wallpaper_url:
        return jsonify({'error': 'wallpaper url is required'}), 400

    settings = _get_settings()
    settings['wallpaper'] = {'mode': 'custom', 'url': wallpaper_url, 'name': wallpaper_name}
    _save_settings(settings)
    return jsonify({'success': True, 'wallpaper': settings['wallpaper']})


@os_bp.route('/api/os/files', methods=['GET'])
def api_os_files():
    file_group = (request.args.get('group') or 'all').strip().lower()
    filesystem = _get_file_service()
    payload = {'tree': filesystem.list_tree()}
    if file_group in {'all', 'photos'}:
        payload['photos'] = build_file_items(os.path.join(_os_context()['app'].static_folder, 'photos'), '/static/photos')
    if file_group in {'all', 'pdfs'}:
        payload['pdfs'] = build_file_items(os.path.join(_os_context()['app'].static_folder, 'uploads', 'profiles'), '/static/uploads/profiles')
    payload['projects'] = filesystem.list_tree()
    return jsonify(payload)


@os_bp.route('/api/files', methods=['GET'])
def api_files_list():
    return jsonify({'tree': _get_file_service().list_tree()})


@os_bp.route('/api/files/create', methods=['POST'])
def api_files_create():
    payload = request.get_json(silent=True) or {}
    path = (payload.get('path') or '').strip()
    is_folder = bool(payload.get('isFolder') or payload.get('folder'))
    if not path:
        return jsonify({'error': 'path is required'}), 400
    try:
        result = _get_file_service().create(path, is_folder=is_folder)
        return jsonify(result)
    except FileExistsError:
        return jsonify({'error': 'Path already exists'}), 409
    except ValueError as ex:
        return jsonify({'error': str(ex)}), 400


@os_bp.route('/api/files/save', methods=['POST'])
def api_files_save():
    payload = request.get_json(silent=True) or {}
    path = (payload.get('path') or '').strip()
    content = payload.get('content') or ''
    if not path:
        return jsonify({'error': 'path is required'}), 400
    try:
        return jsonify(_get_file_service().save(path, content))
    except ValueError as ex:
        return jsonify({'error': str(ex)}), 400


@os_bp.route('/api/files/delete', methods=['DELETE'])
def api_files_delete():
    payload = request.get_json(silent=True) or {}
    path = (payload.get('path') or request.args.get('path') or '').strip()
    if not path:
        return jsonify({'error': 'path is required'}), 400
    try:
        return jsonify(_get_file_service().delete(path))
    except FileNotFoundError:
        return jsonify({'error': 'Path not found'}), 404
    except ValueError as ex:
        return jsonify({'error': str(ex)}), 400


@os_bp.route('/api/files/open', methods=['GET'])
def api_files_open():
    path = (request.args.get('path') or '').strip()
    if not path:
        return jsonify({'error': 'path is required'}), 400
    try:
        return jsonify(_get_file_service().read_file(path))
    except FileNotFoundError:
        return jsonify({'error': 'File not found'}), 404
    except ValueError as ex:
        return jsonify({'error': str(ex)}), 400


@os_bp.route('/api/code/run', methods=['POST'])
def api_code_run():
    payload = request.get_json(silent=True) or {}
    language = payload.get('language') or 'python'
    code = payload.get('code') or ''
    result = _get_code_runner().run(language, code)
    status = 200
    if not result.get('success') and result.get('error'):
        status = 400
    return jsonify(result), status


@os_bp.route('/api/os/code/execute', methods=['POST'])
def api_os_code_execute():
    payload = request.get_json(silent=True) or {}
    return jsonify(_get_code_runner().run(payload.get('language') or 'python', payload.get('code') or ''))


@os_bp.route('/api/os/chat', methods=['GET'])
def api_os_chat_get():
    ctx = _os_context()
    history = read_json_file(ctx['chat_file'], [])
    if not isinstance(history, list):
        history = []
    return jsonify(history[-60:])


@os_bp.route('/api/os/chat', methods=['POST'])
def api_os_chat_post():
    ctx = _os_context()
    payload = request.get_json(silent=True) or {}
    user_message = (payload.get('message') or '').strip()[:500]
    if not user_message:
        return jsonify({'error': 'message is required'}), 400

    history = read_json_file(ctx['chat_file'], [])
    if not isinstance(history, list):
        history = []

    reply = 'TOXIBH OS is online. Try opening apps from desktop or Start menu.'
    lowered = user_message.lower()
    if 'flix' in lowered or 'movie' in lowered:
        reply = 'Open the Flix app from desktop or run "open flix" in Terminal.'
    elif 'admin' in lowered:
        reply = 'Use the Admin app tile. It opens the /admin panel in a new tab.'
    elif 'vault' in lowered or 'file' in lowered:
        reply = 'Vault shows your photos and PDFs from secure storage.'
    elif 'pin' in lowered or 'password' in lowered:
        reply = 'You can update your lock PIN from Settings > Security.'
    elif not lowered:
        reply = 'Say something and I will help you navigate TOXIBH OS.'

    now_iso = os.environ.get('TOXIBH_NOW') or __import__('datetime').datetime.utcnow().isoformat()
    history.append({'role': 'user', 'message': user_message, 'time': now_iso})
    history.append({'role': 'assistant', 'message': reply, 'time': now_iso})
    history = history[-120:]
    write_json_file(ctx['chat_file'], history)
    return jsonify({'reply': reply, 'history': history[-60:]})
