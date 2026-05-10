from fastapi import APIRouter
router = APIRouter(prefix='//api/tools', tags=['tools'])
@router.get('')
async def list_items():
    return {'items': [], 'note': 'placeholder endpoint for tools'}
