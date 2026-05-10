from dataclasses import dataclass
import os
@dataclass
class RuntimeSettings:
    host: str; port: int; runtime_provider: str; model_provider: str; base_url: str | None; model: str; fallback_model: str; api_key: str | None; session_token: str | None; tool_server_url: str | None
    @classmethod
    def from_env(cls):
        tool_port = os.environ.get('TOOL_SERVER_PORT')
        return cls(os.environ.get('AGENT_SERVICE_HOST','127.0.0.1'), int(os.environ.get('AGENT_SERVICE_PORT','8765')), os.environ.get('AUTOGEN_RUNTIME_PROVIDER','autogen'), os.environ.get('AUTOGEN_MODEL_PROVIDER','openai-compatible'), os.environ.get('AUTOGEN_BASE_URL') or None, os.environ.get('AUTOGEN_MODEL','gpt-4.1'), os.environ.get('AUTOGEN_FALLBACK_MODEL','gpt-4.1-mini'), os.environ.get('OPENAI_API_KEY') or None, os.environ.get('AGENT_SESSION_TOKEN') or None, f'http://127.0.0.1:{tool_port}' if tool_port else None)
