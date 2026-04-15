import os
import shutil

from services.os_shared import detect_mime_from_name, ensure_dir, safe_join_under


class UserFilesystemService:
    def __init__(self, projects_root):
        self.projects_root = projects_root
        ensure_dir(self.projects_root)

    def _scan_dir(self, base_path, rel=''):
        entries = []
        try:
            for name in sorted(os.listdir(base_path), key=lambda n: n.lower()):
                full = os.path.join(base_path, name)
                child_rel = f"{rel}/{name}".strip('/')
                if os.path.isdir(full):
                    entries.append(
                        {
                            'type': 'folder',
                            'name': name,
                            'path': child_rel,
                            'children': self._scan_dir(full, child_rel),
                        }
                    )
                else:
                    entries.append(
                        {
                            'type': 'file',
                            'name': name,
                            'path': child_rel,
                            'size': os.path.getsize(full),
                            'mime': detect_mime_from_name(name),
                        }
                    )
        except Exception:
            return []
        return entries

    def list_tree(self):
        return self._scan_dir(self.projects_root)

    def read_file(self, rel_path):
        full = safe_join_under(self.projects_root, rel_path)
        if not os.path.isfile(full):
            raise FileNotFoundError('File not found')
        with open(full, 'r', encoding='utf-8') as f:
            content = f.read()
        return {
            'path': rel_path,
            'name': os.path.basename(full),
            'content': content,
            'mime': detect_mime_from_name(full),
        }

    def create(self, rel_path, is_folder=False):
        full = safe_join_under(self.projects_root, rel_path)
        parent = os.path.dirname(full)
        ensure_dir(parent)

        if os.path.exists(full):
            raise FileExistsError('Path already exists')

        if is_folder:
            os.makedirs(full, exist_ok=False)
            return {'created': True, 'type': 'folder', 'path': rel_path}

        with open(full, 'w', encoding='utf-8') as f:
            f.write('')
        return {'created': True, 'type': 'file', 'path': rel_path}

    def save(self, rel_path, content):
        full = safe_join_under(self.projects_root, rel_path)
        parent = os.path.dirname(full)
        ensure_dir(parent)
        with open(full, 'w', encoding='utf-8') as f:
            f.write(content)
        return {'saved': True, 'path': rel_path, 'size': len(content)}

    def delete(self, rel_path):
        full = safe_join_under(self.projects_root, rel_path)
        if not os.path.exists(full):
            raise FileNotFoundError('Path not found')

        if os.path.isdir(full):
            shutil.rmtree(full)
            return {'deleted': True, 'type': 'folder', 'path': rel_path}

        os.remove(full)
        return {'deleted': True, 'type': 'file', 'path': rel_path}
