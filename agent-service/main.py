from fastapi import FastAPI, WebSocket, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from runtime.settings import RuntimeSettings
from runtime.ws_manager import WsManager
from runtime.task_manager import TaskManager
settings = RuntimeSettings.from_env(); ws_manager = WsManager(); task_manager = TaskManager(settings, ws_manager)
app = FastAPI(title='AutoGen Code Agent Service', version='0.1.0')
app.add_middleware(CORSMiddleware, allow_origins=['*'], allow_credentials=False, allow_methods=['*'], allow_headers=['*'])
class TaskCreateRequest(BaseModel):
    workspaceRoot: str | None = None
    userRequest: str = ''
    teamId: str = 'java-spring-team'
    workflowId: str = 'code-edit'
    mode: str = 'semi-auto'
    contextRefs: list[str] = Field(default_factory=list)
    options: dict = Field(default_factory=dict)
def require_session(x_agent_session: str | None):
    if settings.session_token and x_agent_session != settings.session_token: raise HTTPException(status_code=401, detail='Invalid session token')
@app.get('/health')
async def health(): return {'ok': True, 'provider': settings.runtime_provider, 'model': settings.model, 'toolServer': settings.tool_server_url}
@app.post('/api/tasks')
async def create_task(req: TaskCreateRequest, x_agent_session: str | None = Header(default=None)): require_session(x_agent_session); return await task_manager.create_and_start(req.model_dump())
@app.post('/api/tasks/{task_id}/pause')
async def pause_task(task_id: str, x_agent_session: str | None = Header(default=None)): require_session(x_agent_session); return await task_manager.pause(task_id)
@app.post('/api/tasks/{task_id}/resume')
async def resume_task(task_id: str, x_agent_session: str | None = Header(default=None)): require_session(x_agent_session); return await task_manager.resume(task_id)
@app.post('/api/tasks/{task_id}/cancel')
async def cancel_task(task_id: str, x_agent_session: str | None = Header(default=None)): require_session(x_agent_session); return await task_manager.cancel(task_id)
@app.post('/api/tasks/{task_id}/approve-plan')
async def approve_plan(task_id: str, payload: dict | None = None, x_agent_session: str | None = Header(default=None)): require_session(x_agent_session); return await task_manager.approve(task_id, 'plan', payload or {})
@app.post('/api/tasks/{task_id}/apply-patch')
async def apply_patch(task_id: str, payload: dict | None = None, x_agent_session: str | None = Header(default=None)): require_session(x_agent_session); return await task_manager.approve(task_id, 'patch', payload or {})
@app.get('/api/tasks/{task_id}/patches/{patch_id}')
async def get_patch(task_id: str, patch_id: str, x_agent_session: str | None = Header(default=None)): require_session(x_agent_session); return task_manager.get_patch(task_id, patch_id)
@app.put('/api/agents/current')
async def save_agent(payload: dict, x_agent_session: str | None = Header(default=None)): require_session(x_agent_session); return {'saved': True, 'agent': payload}
@app.put('/api/teams/current')
async def save_team(payload: dict, x_agent_session: str | None = Header(default=None)): require_session(x_agent_session); return {'saved': True, 'team': payload}
@app.put('/api/tools/permissions')
async def save_permissions(payload: dict, x_agent_session: str | None = Header(default=None)): require_session(x_agent_session); return {'saved': True, 'permissions': payload}
@app.put('/api/workflows/current')
async def save_workflow(payload: dict, x_agent_session: str | None = Header(default=None)): require_session(x_agent_session); return {'saved': True, 'workflow': payload}
@app.post('/api/settings/model/test')
async def test_model(payload: dict | None = None, x_agent_session: str | None = Header(default=None)): require_session(x_agent_session); return {'ok': True, 'message': 'Model test endpoint stub.'}
@app.websocket('/ws/tasks/{task_id}')
async def task_ws(websocket: WebSocket, task_id: str): await ws_manager.connect(task_id, websocket)
if __name__ == '__main__':
    import uvicorn; uvicorn.run(app, host=settings.host, port=settings.port)
