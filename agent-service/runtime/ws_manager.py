from fastapi import WebSocket
class WsManager:
    def __init__(self): self.connections: dict[str, list[WebSocket]] = {}
    async def connect(self, task_id: str, ws: WebSocket):
        await ws.accept(); self.connections.setdefault(task_id, []).append(ws); await ws.send_json({'type':'ws.connected','taskId':task_id})
        try:
            while True: await ws.receive_text()
        except Exception:
            if ws in self.connections.get(task_id, []): self.connections[task_id].remove(ws)
    async def emit(self, task_id: str, event: dict):
        for ws in list(self.connections.get(task_id, [])):
            try: await ws.send_json(event)
            except Exception:
                if ws in self.connections.get(task_id, []): self.connections[task_id].remove(ws)
