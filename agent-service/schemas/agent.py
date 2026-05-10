from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
class AgentConfig(BaseModel):
    id: str
    name: str
    role: str
    description: Optional[str] = None
    model: str = 'gpt-4.1'
    temperature: float = 0.2
    maxTurns: int = 6
    maxToolCalls: int = 20
    timeoutSeconds: int = 120
    systemPrompt: str
    responseFormat: str = 'json'
    stopCondition: Optional[str] = None
    outputJsonSchema: Dict[str, Any] = Field(default_factory=dict)
    tools: List[str] = Field(default_factory=list)
    contextScope: List[str] = Field(default_factory=list)
    enabled: bool = True
