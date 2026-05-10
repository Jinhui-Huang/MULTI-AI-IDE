import json
from pathlib import Path
class ConfigStore:
    def __init__(self, root: str = 'config'):
        self.root = Path(root)
    def load_json(self, rel: str, default=None):
        path = self.root / rel
        if not path.exists(): return default
        return json.loads(path.read_text(encoding='utf-8'))
    def save_json(self, rel: str, data):
        path = self.root / rel; path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
