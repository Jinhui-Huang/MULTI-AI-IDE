from typing import Literal, Optional, Dict, Any
from pydantic import BaseModel, Field
TaskStatus = Literal['created','planning','waiting_plan_approval','analyzing_codebase','developing_patch','reviewing','waiting_patch_approval','applying_patch','testing','fixing','completed','failed','cancelled','paused']
class TaskCreateRequest(BaseModel):
    workspaceRoot: str
    userRequest: str
    teamId: str = 'java-spring-team'
    workflowId: str = 'code-edit'
    mode: Literal['auto','semi-auto','manual'] = 'semi-auto'
    contextRefs: Dict[str, Any] = Field(default_factory=dict)
class TaskSummary(BaseModel):
    id: str
    status: TaskStatus
    title: str
    currentStep: Optional[str] = None
