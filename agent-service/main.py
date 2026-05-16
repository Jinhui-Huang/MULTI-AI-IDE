import argparse
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

import uvicorn
from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from api.agent import router as agent_router
from api.model import router as model_router
from runtime.task_manager import TaskManager
from runtime.ws_manager import WsManager
from schemas.tool import ToolGatewayCallRequest
from tools.tool_gateway import ToolGateway


VERSION = "0.1.0"


class TaskCreateRequest(BaseModel):
    userRequest: str = ""
    fields: dict[str, Any] = Field(default_factory=dict)
    workspaceRoot: str = ""
    source: str = "unknown"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="AutoGen Agent Service placeholder")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", default=8765, type=int)
    return parser.parse_args()


def create_app() -> FastAPI:
    app = FastAPI(title="AutoGen Agent Service Placeholder", version=VERSION)
    task_manager = TaskManager()
    ws_manager = WsManager()
    tool_gateway = ToolGateway()
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(model_router)
    app.include_router(agent_router)

    @app.get("/")
    async def root() -> dict:
        return {
            "ok": True,
            "message": "AutoGen Agent Service placeholder",
        }

    @app.get("/api/runtime/health")
    async def runtime_health() -> dict:
        return {
            "ok": True,
            "service": "autogen-agent-service",
            "status": "running",
            "version": VERSION,
            "runtimeProvider": "placeholder",
            "autogenEnabled": False,
            "python": sys.executable,
            "time": datetime.now(timezone.utc).isoformat(),
        }

    @app.get("/api/tools/health")
    async def tools_health() -> dict:
        return await tool_gateway.health()

    @app.post("/api/tools/call")
    async def call_tool(request: ToolGatewayCallRequest) -> dict:
        return await tool_gateway.call_tool(
            tool=request.tool,
            args=request.args,
            request_id=request.requestId,
        )

    @app.post("/api/tasks")
    async def create_task(request: TaskCreateRequest) -> dict:
        task = task_manager.create_task(request)
        return {
            "ok": True,
            "taskId": task["id"],
            "status": "created",
            "message": "Task created placeholder",
            "task": task,
        }

    @app.get("/api/tasks/{task_id}")
    async def get_task(task_id: str) -> dict:
        task = task_manager.get_task(task_id)
        if not task:
            return JSONResponse(
                status_code=404,
                content={
                    "ok": False,
                    "error": {
                        "code": "TASK_NOT_FOUND",
                        "message": f"Task not found: {task_id}",
                    },
                },
            )
        return {
            "ok": True,
            "task": task,
        }

    @app.websocket("/ws/tasks/{task_id}")
    async def task_events(websocket: WebSocket, task_id: str) -> None:
        if not task_manager.get_task(task_id):
            await ws_manager.send_error_and_close(websocket, task_manager.create_missing_task_event(task_id))
            return

        events = task_manager.generate_placeholder_events(task_id)
        for event in events:
            task_manager.append_event(task_id, event)
        await ws_manager.stream_events(websocket, events)

    return app


def main() -> None:
    args = parse_args()
    uvicorn.run(create_app(), host=args.host, port=args.port)


if __name__ == "__main__":
    main()
