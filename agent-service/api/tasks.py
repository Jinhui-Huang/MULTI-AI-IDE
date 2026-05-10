from fastapi import APIRouter
from schemas.task import TaskCreateRequest
router = APIRouter(prefix='/api/tasks', tags=['tasks'])
@router.post('')
async def create_task(req: TaskCreateRequest):
    return {'taskId': 'task-placeholder', 'status': 'created', 'request': req.model_dump()}
@router.post('/{task_id}/pause')
async def pause_task(task_id: str): return {'taskId': task_id, 'status': 'paused'}
@router.post('/{task_id}/resume')
async def resume_task(task_id: str): return {'taskId': task_id, 'status': 'running'}
@router.post('/{task_id}/cancel')
async def cancel_task(task_id: str): return {'taskId': task_id, 'status': 'cancelled'}
