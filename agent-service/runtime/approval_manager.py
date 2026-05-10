import asyncio
class ApprovalManager:
    def __init__(self):
        self._pending = {}
    async def request(self, approval_id: str, payload: dict, timeout: int = 600):
        fut = asyncio.get_event_loop().create_future()
        self._pending[approval_id] = fut
        return await asyncio.wait_for(fut, timeout=timeout)
    def resolve(self, approval_id: str, decision: dict):
        fut = self._pending.pop(approval_id, None)
        if fut and not fut.done(): fut.set_result(decision)
