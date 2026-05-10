from typing import List, Literal, Optional
from pydantic import BaseModel
class TeamConfig(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    mode: Literal['sequential','round_robin','selector','manual'] = 'sequential'
    maxTurns: int = 20
    retryLimit: int = 2
    termination: str = 'workflow_completed'
    agents: List[str]
