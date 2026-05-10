from typing import Dict, Any, Optional
from pydantic import BaseModel, Field
class BaseEvent(BaseModel):
    seq: int
    type: str
    taskId: Optional[str] = None
    payload: Dict[str, Any] = Field(default_factory=dict)
    timestamp: str
