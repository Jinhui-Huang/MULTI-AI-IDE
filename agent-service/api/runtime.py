from fastapi import APIRouter
router = APIRouter(prefix='/api/runtime', tags=['runtime'])
@router.get('/health')
async def health():
    return {'ok': True, 'provider': 'autogen', 'status': 'running'}
