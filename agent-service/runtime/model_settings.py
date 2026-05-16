import os
from dataclasses import dataclass


DEFAULT_PROVIDER = "openai_compatible"
DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/"
DEFAULT_MODEL = "gemini-3-flash-preview"


@dataclass(frozen=True)
class ModelSettings:
    provider: str
    base_url: str
    model: str
    fallback_model: str
    api_key: str

    @property
    def api_key_configured(self) -> bool:
        return bool(self.api_key)

    def safe_config(self) -> dict:
        return {
            "provider": self.provider,
            "baseUrl": self.base_url,
            "model": self.model,
            "fallbackModel": self.fallback_model,
            "apiKeyConfigured": self.api_key_configured,
        }


def load_model_settings_from_env() -> ModelSettings:
    return ModelSettings(
        provider=os.getenv("AUTOGEN_IDE_MODEL_PROVIDER") or DEFAULT_PROVIDER,
        base_url=os.getenv("AUTOGEN_IDE_MODEL_BASE_URL") or DEFAULT_BASE_URL,
        model=os.getenv("AUTOGEN_IDE_MODEL_NAME") or DEFAULT_MODEL,
        fallback_model=os.getenv("AUTOGEN_IDE_FALLBACK_MODEL") or DEFAULT_MODEL,
        api_key=os.getenv("AUTOGEN_IDE_MODEL_API_KEY") or "",
    )
