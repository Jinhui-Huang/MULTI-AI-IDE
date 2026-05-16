from typing import Any

from pydantic import BaseModel, Field


class ToolGatewayCallRequest(BaseModel):
    tool: str
    args: dict[str, Any] = Field(default_factory=dict)
    requestId: str | None = None


class ToolGatewayError(BaseModel):
    code: str
    message: str


class ToolGatewayCallResult(BaseModel):
    ok: bool
    tool: str | None = None
    requestId: str | None = None
    result: Any | None = None
    error: ToolGatewayError | dict[str, Any] | None = None


class ToolCallRequest(BaseModel):
    taskId: str = ""
    agentId: str = ""
    toolName: str = ""
    args: dict[str, Any] = Field(default_factory=dict)


class ToolCallResult(BaseModel):
    ok: bool
    data: Any | None = None
    error: str | ToolGatewayError | dict[str, Any] | None = None
    summary: str | None = None
