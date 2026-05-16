import json
from typing import Any

from tools.tool_gateway import ToolGateway


MAX_TOOL_RESULT_CHARS = 20000


class AutoGenToolGateway:
    """Safe AutoGen tool wrappers that delegate all work to the VS Code ToolServer."""

    def __init__(self, tool_gateway: ToolGateway | None = None) -> None:
        self.tool_gateway = tool_gateway or ToolGateway(timeout_seconds=15.0)

    async def health(self) -> dict[str, Any]:
        return await self.tool_gateway.health()

    async def list_files(self, dir: str = ".", max_files: int = 100) -> str:
        """List files under a workspace-relative directory."""
        return await self.call_tool_text("list_files", {
            "dir": dir,
            "maxFiles": max_files,
        })

    async def read_file(self, path: str, max_bytes: int = 200000) -> str:
        """Read a guarded workspace-relative text file."""
        return await self.call_tool_text("read_file", {
            "path": path,
            "maxBytes": max_bytes,
        })

    async def search_code(self, query: str, dir: str = ".", max_results: int = 20) -> str:
        """Search text in workspace files."""
        return await self.call_tool_text("search_code", {
            "query": query,
            "dir": dir,
            "maxResults": max_results,
        })

    async def git_status(self) -> str:
        """Return read-only git status for the workspace."""
        return await self.call_tool_text("git_status", {})

    async def git_diff(self, path: str | None = None, cached: bool = False, max_bytes: int = 200000) -> str:
        """Return read-only git diff for the workspace."""
        args: dict[str, Any] = {
            "cached": cached,
            "maxBytes": max_bytes,
        }
        if path:
            args["path"] = path
        return await self.call_tool_text("git_diff", args)

    def tool_callables(self) -> list:
        return [
            self.list_files,
            self.read_file,
            self.search_code,
            self.git_status,
            self.git_diff,
        ]

    async def call_tool_text(self, tool: str, args: dict[str, Any]) -> str:
        response = await self.tool_gateway.call_tool(tool, args)
        if response.get("ok") is not True:
            error = response.get("error") if isinstance(response.get("error"), dict) else {}
            code = error.get("code") or "TOOL_GATEWAY_CALL_FAILED"
            message = error.get("message") or "Tool call failed."
            return self.truncate_text(f"ERROR {code}: {message}")

        return self.truncate_text(json.dumps(response.get("result", response), ensure_ascii=False, indent=2))

    def truncate_text(self, value: str) -> str:
        if len(value) <= MAX_TOOL_RESULT_CHARS:
            return value
        return value[:MAX_TOOL_RESULT_CHARS] + "\n... truncated ..."
