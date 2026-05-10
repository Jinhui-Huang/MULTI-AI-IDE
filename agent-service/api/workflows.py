from fastapi import APIRouter
router = APIRouter(prefix='//api/workflows', tags=['workflows'])
@router.get('')
async def list_items():
    return {'items': [], 'note': 'placeholder endpoint for workflows'}
