from typing import List, Optional, Literal
from pydantic import BaseModel
class WorkflowNode(BaseModel):
    id: str
    type: Literal['agent','team','tool','human_approval','condition','summary']
    label: str
    agentId: Optional[str] = None
    requireApproval: bool = False
class WorkflowEdge(BaseModel):
    from_: str
    to: str
    condition: Optional[str] = None
class WorkflowConfig(BaseModel):
    id: str
    name: str
    version: str = '1.0.0'
    nodes: List[WorkflowNode]
    edges: List[WorkflowEdge] = []
    failureStrategy: str = 'ask_user'
    confirmPolicy: str = 'all'
