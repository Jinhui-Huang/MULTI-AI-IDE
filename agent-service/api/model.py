from typing import Any

import httpx
from fastapi import APIRouter

from runtime.model_settings import ModelSettings, load_model_settings_from_env
from schemas.model import ModelHealthRequest


router = APIRouter(prefix="/api/model", tags=["model"])


@router.get("/config-safe")
async def model_config_safe() -> dict:
    return {
        "ok": True,
        "model": load_model_settings_from_env().safe_config(),
    }


@router.post("/health")
async def model_health(_: ModelHealthRequest | None = None) -> dict:
    settings = load_model_settings_from_env()
    validation_error = validate_model_settings(settings)
    if validation_error:
        return validation_error

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                build_chat_completions_url(settings.base_url),
                headers={
                    "Authorization": f"Bearer {settings.api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": settings.model,
                    "messages": [
                        {
                            "role": "user",
                            "content": "Reply with exactly: OK",
                        }
                    ],
                    "max_tokens": 16,
                    "temperature": 0,
                },
            )
    except Exception as error:
        return create_model_error("MODEL_HEALTH_FAILED", str(error))

    if response.status_code < 200 or response.status_code >= 300:
        return create_model_error(
            "MODEL_HEALTH_FAILED",
            sanitize_text(response.text, settings.api_key),
            response.status_code,
        )

    try:
        body = response.json()
        preview = extract_response_preview(body)
    except Exception:
        return create_model_error("MODEL_RESPONSE_INVALID", "Model response was not valid JSON.")

    if not preview:
        return create_model_error("MODEL_RESPONSE_INVALID", "Model response did not contain a message.")

    return {
        "ok": True,
        "provider": settings.provider,
        "model": settings.model,
        "message": "Model health check passed",
        "responsePreview": preview,
    }


def validate_model_settings(settings: ModelSettings) -> dict | None:
    if not settings.api_key:
        return create_model_error("MODEL_API_KEY_MISSING", "Model API key is not configured.")
    if not settings.base_url.strip():
        return create_model_error("MODEL_BASE_URL_MISSING", "Model base URL is not configured.")
    if not settings.model.strip():
        return create_model_error("MODEL_NAME_MISSING", "Model name is not configured.")
    return None


def build_chat_completions_url(base_url: str) -> str:
    return f"{base_url.rstrip('/')}/chat/completions"


def extract_response_preview(body: dict[str, Any]) -> str:
    choices = body.get("choices")
    if not isinstance(choices, list) or not choices:
        return ""
    first = choices[0]
    if not isinstance(first, dict):
        return ""
    message = first.get("message")
    if not isinstance(message, dict):
        return ""
    content = message.get("content")
    return str(content).strip()[:200] if content is not None else ""


def create_model_error(code: str, message: str, status_code: int | None = None) -> dict:
    error: dict[str, Any] = {
        "code": code,
        "message": message[:500],
    }
    if status_code is not None:
        error["statusCode"] = status_code
    return {
        "ok": False,
        "error": error,
    }


def sanitize_text(text: str, api_key: str) -> str:
    value = text[:500]
    if api_key:
        value = value.replace(api_key, "***")
    return value
