from fastapi import APIRouter
router = APIRouter(prefix='//api/settings', tags=['settings'])
@router.get('')
async def list_items():
    return {'items': [], 'note': 'placeholder endpoint for settings'}
