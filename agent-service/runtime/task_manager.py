import asyncio, uuid, time
from .workflow_runner import WorkflowRunner
class TaskManager:
    def __init__(self, settings, ws_manager): self.settings=settings; self.ws=ws_manager; self.tasks={}; self.patches={}
    async def create_and_start(self, payload):
        task_id='task_'+uuid.uuid4().hex[:10]; ctx={'taskId':task_id,'status':'created','payload':payload,'createdAt':time.time(),'patches':[]}; self.tasks[task_id]=ctx; asyncio.create_task(WorkflowRunner(self.settings,self.ws,self).run(ctx)); return {'taskId':task_id,'status':'created'}
    async def pause(self, task_id): self.tasks[task_id]['status']='paused'; await self.ws.emit(task_id, {'type':'task.status','taskId':task_id,'payload':{'status':'paused'}}); return {'ok':True}
    async def resume(self, task_id): self.tasks[task_id]['status']='running'; await self.ws.emit(task_id, {'type':'task.status','taskId':task_id,'payload':{'status':'running'}}); return {'ok':True}
    async def cancel(self, task_id): self.tasks[task_id]['status']='cancelled'; await self.ws.emit(task_id, {'type':'task.status','taskId':task_id,'payload':{'status':'cancelled'}}); return {'ok':True}
    async def approve(self, task_id, approval_type, payload): await self.ws.emit(task_id, {'type':'approval.resolved','taskId':task_id,'payload':{'approvalType':approval_type,'decision':'approved'}}); return {'ok':True}
    def save_patch(self, task_id, patch_text):
        patch_id='patch_'+uuid.uuid4().hex[:8]; obj={'taskId':task_id,'patchId':patch_id,'patchText':patch_text}; self.patches[f'{task_id}:{patch_id}']=obj; self.tasks[task_id]['patches'].append(obj); return obj
    def get_patch(self, task_id, patch_id): return self.patches.get(f'{task_id}:{patch_id}', {'taskId':task_id,'patchId':patch_id,'patchText':'# patch not found'})
