from fastapi import APIRouter
router = APIRouter(prefix='//api/teams', tags=['teams'])
@router.get('')
async def list_items():
    return {'items': [], 'note': 'placeholder endpoint for teams'}
