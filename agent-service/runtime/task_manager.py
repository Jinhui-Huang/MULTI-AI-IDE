import secrets
from datetime import datetime, timezone
from typing import Any


class TaskManager:
    def __init__(self) -> None:
        self._tasks: dict[str, dict[str, Any]] = {}
        self._events: dict[str, list[dict[str, Any]]] = {}

    def create_task(self, request: Any) -> dict[str, Any]:
        fields = getattr(request, "fields", {}) or {}
        created_at = self._now()
        task_id = f"task_{int(datetime.now(timezone.utc).timestamp() * 1000)}_{secrets.token_hex(3)}"
        task = {
            "id": task_id,
            "status": "created",
            "userRequest": getattr(request, "userRequest", "") or fields.get("task.userRequest", ""),
            "teamId": fields.get("task.teamId", ""),
            "workflowId": fields.get("task.workflowId", ""),
            "mode": fields.get("task.mode", ""),
            "targetAgent": fields.get("task.targetAgent", ""),
            "workspaceRoot": getattr(request, "workspaceRoot", ""),
            "source": getattr(request, "source", "unknown"),
            "createdAt": created_at,
        }
        self._tasks[task_id] = task
        self._events[task_id] = []
        return task

    def get_task(self, task_id: str) -> dict[str, Any] | None:
        return self._tasks.get(task_id)

    def append_event(self, task_id: str, event: dict[str, Any]) -> None:
        self._events.setdefault(task_id, []).append(event)
        if event.get("type") == "task.status":
            status = event.get("payload", {}).get("status")
            if isinstance(status, str) and task_id in self._tasks:
                self._tasks[task_id]["status"] = status
        if event.get("type") == "task.completed" and task_id in self._tasks:
            self._tasks[task_id]["status"] = "completed"

    def list_events(self, task_id: str) -> list[dict[str, Any]]:
        return list(self._events.get(task_id, []))

    def generate_placeholder_events(self, task_id: str) -> list[dict[str, Any]]:
        event_specs: list[tuple[str, dict[str, Any]]] = [
            ("task.status", {"status": "running"}),
            ("agent.status", {"agent": "PlannerAgent", "status": "running"}),
            ("agent.message", {"agent": "PlannerAgent", "content": "我将先拆分任务并生成执行计划。"}),
            (
                "approval.required",
                {
                    "approvalType": "plan",
                    "title": "Plan approval required",
                    "summary": "这是 placeholder 计划确认事件。",
                },
            ),
            ("agent.status", {"agent": "CodebaseAgent", "status": "running"}),
            ("tool.call", {"agent": "CodebaseAgent", "tool": "read_file", "args": {"path": "pom.xml"}}),
            (
                "tool.result",
                {
                    "agent": "CodebaseAgent",
                    "tool": "read_file",
                    "summary": "placeholder file analysis completed",
                },
            ),
            ("agent.status", {"agent": "DeveloperAgent", "status": "running"}),
            (
                "patch.proposed",
                {
                    "patchId": "patch_placeholder",
                    "files": [
                        {"path": "src/main/java/example/AuthController.java", "changeType": "add"},
                        {"path": "pom.xml", "changeType": "modify"},
                    ],
                    "summary": "placeholder patch proposed",
                },
            ),
            (
                "task.completed",
                {
                    "status": "completed",
                    "summary": "Placeholder task event stream completed.",
                },
            ),
        ]
        return [
            {
                "type": event_type,
                "taskId": task_id,
                "seq": index + 1,
                "timestamp": self._now(),
                "payload": payload,
            }
            for index, (event_type, payload) in enumerate(event_specs)
        ]

    def create_missing_task_event(self, task_id: str) -> dict[str, Any]:
        return {
            "type": "error",
            "taskId": task_id,
            "seq": 1,
            "timestamp": self._now(),
            "payload": {
                "error": {
                    "code": "TASK_NOT_FOUND",
                    "message": f"Task not found: {task_id}",
                },
            },
        }

    def _now(self) -> str:
        return datetime.now(timezone.utc).isoformat()
