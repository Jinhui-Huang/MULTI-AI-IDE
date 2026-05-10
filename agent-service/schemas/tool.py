from typing import Dict, Any, Literal, Optional
from pydantic import BaseModel, Field
ToolPermission = Literal['deny','allow','confirm','readonly','whitelist']
class ToolCallRequest(BaseModel):
    taskId: str
    agentId: str
    toolName: str
    args: Dict[str, Any] = Field(default_factory=dict)
class ToolCallResult(BaseModel):
    ok: bool
    data: Optional[Any] = None
    error: Optional[str] = None
    summary: Optional[str] = None
