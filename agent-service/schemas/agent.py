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


class AgentRunOnceRequest(BaseModel):
    userRequest: str = ""
    systemPrompt: Optional[str] = None


class AgentRunWithToolsRequest(BaseModel):
    userRequest: str = ""
    systemPrompt: Optional[str] = None


class AgentRunSequenceRequest(BaseModel):
    userRequest: str = ""


class AgentRunOnceError(BaseModel):
    code: str
    message: str


class AgentRunOnceResult(BaseModel):
    ok: bool = True
    model: str
    agent: str
    content: str


class AgentRunOnceResponse(BaseModel):
    ok: bool
    result: Optional[AgentRunOnceResult] = None
    error: Optional[AgentRunOnceError | Dict[str, Any]] = None


class AgentRunWithToolsResult(BaseModel):
    ok: bool = True
    model: str
    agent: str
    content: str
    tools: List[str] = Field(default_factory=list)


class AgentRunWithToolsResponse(BaseModel):
    ok: bool
    result: Optional[AgentRunWithToolsResult] = None
    error: Optional[AgentRunOnceError | Dict[str, Any]] = None


class AgentSequenceItem(BaseModel):
    agent: str
    content: str


class AgentRunSequenceResult(BaseModel):
    ok: bool = True
    mode: str = "sequence"
    model: str
    results: List[AgentSequenceItem] = Field(default_factory=list)
    summary: str = ""


class AgentRunSequenceResponse(BaseModel):
    ok: bool
    result: Optional[AgentRunSequenceResult] = None
    error: Optional[AgentRunOnceError | Dict[str, Any]] = None
