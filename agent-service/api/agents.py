from fastapi import APIRouter
router = APIRouter(prefix='//api/agents', tags=['agents'])
@router.get('')
async def list_items():
    return {'items': [], 'note': 'placeholder endpoint for agents'}
