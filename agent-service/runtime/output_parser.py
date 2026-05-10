import json, re
class OutputParser:
    def parse_json_object(self, text: str):
        try: return json.loads(text)
        except Exception:
            match = re.search(r'\{.*\}', text, re.S)
            return json.loads(match.group(0)) if match else {'raw': text}
    def extract_patch(self, text: str):
        if 'diff --git' in text: return text[text.index('diff --git'):]
        return None
