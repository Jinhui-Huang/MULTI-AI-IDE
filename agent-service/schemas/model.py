from typing import Any

from pydantic import BaseModel


class ModelHealthRequest(BaseModel):
    message: str = "ping"


class ModelHealthError(BaseModel):
    code: str
    message: str
    statusCode: int | None = None


class ModelHealthResult(BaseModel):
    ok: bool
    provider: str | None = None
    model: str | None = None
    message: str | None = None
    responsePreview: str | None = None
    error: ModelHealthError | dict[str, Any] | None = None
