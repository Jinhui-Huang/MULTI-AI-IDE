import json
from pathlib import Path

def test_json_configs_are_valid():
    for path in Path('config').rglob('*.json'):
        json.loads(path.read_text(encoding='utf-8'))
