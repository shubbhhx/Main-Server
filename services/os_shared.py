import json
import os
from datetime import datetime


def ensure_dir(path):
    os.makedirs(path, exist_ok=True)


def read_json_file(path, default_value):
    try:
        if not os.path.exists(path):
            return default_value
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return default_value


def write_json_file(path, value):
    parent = os.path.dirname(path)
    if parent:
        ensure_dir(parent)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(value, f, ensure_ascii=True, indent=2)


def build_file_items(base_dir, web_prefix):
    items = []
    try:
        for name in os.listdir(base_dir):
            full = os.path.join(base_dir, name)
            if not os.path.isfile(full):
                continue
            stat = os.stat(full)
            items.append(
                {
                    'name': name,
                    'size': stat.st_size,
                    'modified': datetime.utcfromtimestamp(stat.st_mtime).isoformat(),
                    'url': f"{web_prefix}/{name}",
                }
            )
    except Exception:
        return []
    items.sort(key=lambda x: x['modified'], reverse=True)
    return items


def safe_join_under(base_dir, relative_path):
    rel = (relative_path or '').replace('\\', '/').strip('/')
    if not rel:
        return base_dir

    normalized = os.path.normpath(rel)
    if normalized.startswith('..') or os.path.isabs(normalized):
        raise ValueError('Invalid path')

    full = os.path.normpath(os.path.join(base_dir, normalized))
    base_norm = os.path.normpath(base_dir)
    if not full.startswith(base_norm):
        raise ValueError('Path escapes project root')
    return full


def detect_mime_from_name(name):
    lower = (name or '').lower()
    if lower.endswith('.py'):
        return 'text/x-python'
    if lower.endswith('.js'):
        return 'text/javascript'
    if lower.endswith('.ts'):
        return 'text/typescript'
    if lower.endswith('.java'):
        return 'text/x-java-source'
    if lower.endswith('.c'):
        return 'text/x-csrc'
    if lower.endswith('.cpp') or lower.endswith('.cc') or lower.endswith('.cxx'):
        return 'text/x-c++src'
    if lower.endswith('.html'):
        return 'text/html'
    if lower.endswith('.css'):
        return 'text/css'
    if lower.endswith('.json'):
        return 'application/json'
    if lower.endswith('.md'):
        return 'text/markdown'
    return 'text/plain'
