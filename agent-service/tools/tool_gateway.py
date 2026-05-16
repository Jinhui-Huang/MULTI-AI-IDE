import os
from typing import Any

import httpx


class ToolGateway:
    def __init__(
        self,
        base_url: str | None = None,
        session_token: str | None = None,
        timeout_seconds: float = 5.0,
    ) -> None:
        self.base_url = (base_url or os.getenv("AUTOGEN_IDE_TOOL_SERVER_URL") or "http://127.0.0.1:18765").rstrip("/")
        self.session_token = session_token if session_token is not None else os.getenv("AUTOGEN_IDE_TOOL_SERVER_TOKEN", "")
        self.timeout_seconds = timeout_seconds

    async def health(self) -> dict[str, Any]:
        try:
            async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                response = await client.get(f"{self.base_url}/health")
                response.raise_for_status()
                return {
                    "ok": True,
                    "toolServerUrl": self.base_url,
                    "toolServer": response.json(),
                }
        except Exception as error:
            return {
                "ok": False,
                "toolServerUrl": self.base_url,
                "error": {
                    "code": "TOOL_SERVER_UNAVAILABLE",
                    "message": str(error),
                },
            }

    async def call_tool(
        self,
        tool: str,
        args: dict[str, Any] | None = None,
        request_id: str | None = None,
    ) -> dict[str, Any]:
        payload = {
            "tool": tool,
            "args": args or {},
        }
        if request_id:
            payload["requestId"] = request_id

        headers = {"Content-Type": "application/json"}
        if self.session_token:
            headers["x-agent-session"] = self.session_token

        try:
            async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                response = await client.post(f"{self.base_url}/tools/call", json=payload, headers=headers)
                body = self._safe_json(response)
                if response.status_code >= 400:
                    return {
                        "ok": False,
                        "tool": tool,
                        "requestId": request_id,
                        "error": self._normalize_error(body, response.status_code),
                    }

                if body.get("ok") is False:
                    return {
                        "ok": False,
                        "tool": tool,
                        "requestId": request_id,
                        "error": self._normalize_error(body, response.status_code),
                    }

                return {
                    "ok": True,
                    "tool": tool,
                    "requestId": request_id,
                    "result": body.get("data", body),
                }
        except Exception as error:
            return {
                "ok": False,
                "tool": tool,
                "requestId": request_id,
                "error": {
                    "code": "TOOL_GATEWAY_CALL_FAILED",
                    "message": str(error),
                },
            }

    async def call(self, agent_id: str, tool_name: str, args: dict[str, Any]) -> dict[str, Any]:
        return await self.call_tool(
            tool=tool_name,
            args=args,
            request_id=f"{agent_id}:{tool_name}",
        )

    def _safe_json(self, response: httpx.Response) -> dict[str, Any]:
        try:
            body = response.json()
            return body if isinstance(body, dict) else {"data": body}
        except Exception:
            return {"error": {"code": "BAD_TOOL_SERVER_RESPONSE", "message": response.text}}

    def _normalize_error(self, body: dict[str, Any], status_code: int) -> dict[str, str]:
        error = body.get("error")
        if isinstance(error, dict):
            code = error.get("code")
            message = error.get("message")
            return {
                "code": str(code or f"TOOL_SERVER_HTTP_{status_code}"),
                "message": str(message or "Tool server request failed"),
            }
        return {
            "code": f"TOOL_SERVER_HTTP_{status_code}",
            "message": str(body),
        }
