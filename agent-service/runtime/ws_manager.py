import asyncio
from collections.abc import Iterable
from typing import Any

from fastapi import WebSocket


class WsManager:
    async def stream_events(self, websocket: WebSocket, events: Iterable[dict[str, Any]]) -> None:
        await websocket.accept()
        for event in events:
            await websocket.send_json(event)
            await asyncio.sleep(0.35)
        await websocket.close()

    async def send_error_and_close(self, websocket: WebSocket, event: dict[str, Any]) -> None:
        await websocket.accept()
        await websocket.send_json(event)
        await websocket.close()
