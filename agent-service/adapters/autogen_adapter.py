from typing import Any

from runtime.model_client_factory import ModelClientFactory
from runtime.model_settings import ModelSettings, load_model_settings_from_env
from runtime.autogen_tools import AutoGenToolGateway
from runtime.agent_factory import AgentFactory


DEBUG_AGENT_NAME = "DebugAssistantAgent"
TOOL_AGENT_NAME = "ToolEnabledAssistantAgent"
DEFAULT_SYSTEM_PROMPT = (
    "You are DebugAssistantAgent. Reply concisely and confirm whether the model "
    "connection is working. Do not call tools or modify files."
)
DEFAULT_TOOL_SYSTEM_PROMPT = (
    "你是一个代码库分析助手。你可以使用 list_files、read_file、search_code、git_status、git_diff 了解项目。\n"
    "你不能修改文件。\n"
    "你不能执行命令。\n"
    "你不能应用 patch。\n"
    "你不能访问 workspace 外文件。\n"
    "你不能读取敏感文件。\n"
    "如果工具返回权限错误或敏感文件错误，你必须停止该方向并说明原因。\n"
    "请根据工具结果回答用户问题。"
)
READ_ONLY_TOOL_NAMES = ["list_files", "read_file", "search_code", "git_status", "git_diff"]
MAX_AGENT_OUTPUT_CHARS = 20000


class AutoGenAdapter:
    """Minimal real AutoGen adapter for a single debug AssistantAgent run."""

    def __init__(
        self,
        model_settings: ModelSettings | None = None,
        model_client_factory: ModelClientFactory | None = None,
        ws_manager: object | None = None,
    ) -> None:
        if model_client_factory is not None and not hasattr(model_client_factory, "create_openai_compatible_client"):
            ws_manager = model_client_factory
            model_client_factory = None

        self.model_settings = model_settings if isinstance(model_settings, ModelSettings) else load_model_settings_from_env()
        self.model_client_factory = model_client_factory or ModelClientFactory()
        self.ws_manager = ws_manager

    async def run_once(self, user_request: str, system_prompt: str | None = None) -> dict[str, Any]:
        request = user_request.strip()
        if not request:
            return self.create_error("EMPTY_USER_REQUEST", "User request is empty.")

        if not self.model_settings.api_key:
            return self.create_error("MODEL_API_KEY_MISSING", "Model API key is not configured.")

        if self.model_settings.provider != ModelClientFactory.SUPPORTED_PROVIDER:
            return self.create_error(
                "MODEL_PROVIDER_NOT_SUPPORTED",
                f"Provider is not supported: {self.model_settings.provider}",
            )

        model_client = None
        try:
            from autogen_agentchat.agents import AssistantAgent

            model_client = self.model_client_factory.create_openai_compatible_client(self.model_settings)
            agent = AssistantAgent(
                name=DEBUG_AGENT_NAME,
                model_client=model_client,
                system_message=(system_prompt or DEFAULT_SYSTEM_PROMPT).strip() or DEFAULT_SYSTEM_PROMPT,
            )
            result = await agent.run(task=request)
            content = self.extract_content(result)
            if not content:
                return self.create_error("MODEL_RESPONSE_EMPTY", "AutoGen returned an empty response.")

            return {
                "ok": True,
                "model": self.model_settings.model,
                "agent": DEBUG_AGENT_NAME,
                "content": content,
            }
        except Exception as error:
            return self.create_error("AUTOGEN_RUN_FAILED", self.sanitize_error(error))
        finally:
            await self.close_model_client(model_client)

    async def run_with_tools(self, user_request: str, system_prompt: str | None = None) -> dict[str, Any]:
        request = user_request.strip()
        if not request:
            return self.create_error("EMPTY_USER_REQUEST", "User request is empty.")

        if not self.model_settings.api_key:
            return self.create_error("MODEL_API_KEY_MISSING", "Model API key is not configured.")

        if self.model_settings.provider != ModelClientFactory.SUPPORTED_PROVIDER:
            return self.create_error(
                "MODEL_PROVIDER_NOT_SUPPORTED",
                f"Provider is not supported: {self.model_settings.provider}",
            )

        tool_gateway = AutoGenToolGateway()
        tool_health = await tool_gateway.health()
        if tool_health.get("ok") is not True:
            error = tool_health.get("error") if isinstance(tool_health.get("error"), dict) else {}
            return self.create_error(
                "TOOL_SERVER_UNAVAILABLE",
                str(error.get("message") or "VS Code ToolServer is unavailable."),
            )

        model_client = None
        try:
            from autogen_agentchat.agents import AssistantAgent

            model_client = self.model_client_factory.create_openai_compatible_client(self.model_settings)
            agent = AssistantAgent(
                name=TOOL_AGENT_NAME,
                model_client=model_client,
                tools=tool_gateway.tool_callables(),
                system_message=(system_prompt or DEFAULT_TOOL_SYSTEM_PROMPT).strip() or DEFAULT_TOOL_SYSTEM_PROMPT,
                reflect_on_tool_use=True,
                max_tool_iterations=6,
            )
            result = await agent.run(task=request)
            content = self.extract_content(result)
            if not content:
                return self.create_error("MODEL_RESPONSE_EMPTY", "AutoGen returned an empty response.")

            return {
                "ok": True,
                "model": self.model_settings.model,
                "agent": TOOL_AGENT_NAME,
                "content": content,
                "tools": READ_ONLY_TOOL_NAMES,
            }
        except Exception as error:
            return self.create_error("AUTOGEN_TOOL_RUN_FAILED", self.sanitize_error(error))
        finally:
            await self.close_model_client(model_client)

    async def run_sequence(self, user_request: str) -> dict[str, Any]:
        request = user_request.strip()
        if not request:
            return self.create_error("EMPTY_USER_REQUEST", "User request is empty.")

        if not self.model_settings.api_key:
            return self.create_error("MODEL_API_KEY_MISSING", "Model API key is not configured.")

        if self.model_settings.provider != ModelClientFactory.SUPPORTED_PROVIDER:
            return self.create_error(
                "MODEL_PROVIDER_NOT_SUPPORTED",
                f"Provider is not supported: {self.model_settings.provider}",
            )

        tool_gateway = AutoGenToolGateway()
        tool_health = await tool_gateway.health()
        if tool_health.get("ok") is not True:
            error = tool_health.get("error") if isinstance(tool_health.get("error"), dict) else {}
            return self.create_error(
                "TOOL_SERVER_UNAVAILABLE",
                str(error.get("message") or "VS Code ToolServer is unavailable."),
            )

        results: list[dict[str, str]] = []
        agent_factory = AgentFactory(self.model_client_factory, tool_gateway)
        sequence = [
            ("planner", "PlannerAgent", self.build_planner_input),
            ("codebase", "CodebaseAgent", self.build_codebase_input),
            ("developer", "DeveloperAgent", self.build_developer_input),
            ("reviewer", "ReviewerAgent", self.build_reviewer_input),
            ("summary", "SummaryAgent", self.build_summary_input),
        ]

        try:
            for role, agent_name, input_builder in sequence:
                model_client = None
                try:
                    model_client = self.model_client_factory.create_openai_compatible_client(self.model_settings)
                    agent = agent_factory.create_agent(role, self.model_settings, model_client)
                    task_input = input_builder(request, results)
                    result = await agent.run(task=task_input)
                    content = self.truncate_agent_output(self.extract_content(result))
                    if not content:
                        return self.create_sequence_error(
                            "MODEL_RESPONSE_EMPTY",
                            f"{agent_name} returned an empty response.",
                            results,
                        )
                    results.append({
                        "agent": agent_name,
                        "content": content,
                    })
                finally:
                    await self.close_model_client(model_client)

            summary = results[-1]["content"] if results else ""
            return {
                "ok": True,
                "mode": "sequence",
                "model": self.model_settings.model,
                "results": results,
                "summary": summary,
            }
        except Exception as error:
            return self.create_sequence_error("AUTOGEN_SEQUENCE_FAILED", self.sanitize_error(error), results)

    async def run_agent(self, task_id: str, agent_name: str, user_request: str, ctx: dict) -> dict[str, Any]:
        result = await self.run_once(user_request, ctx.get("systemPrompt") if isinstance(ctx, dict) else None)
        if result.get("ok") is True:
            return {"content": result.get("content", "")}
        return {"content": result.get("error", {}).get("message", "AutoGen run failed.")}

    def extract_content(self, result: object) -> str:
        messages = getattr(result, "messages", None)
        if isinstance(messages, list) and messages:
            for message in reversed(messages):
                content = getattr(message, "content", None)
                if content:
                    return self.content_to_text(content)

        chat_message = getattr(result, "chat_message", None)
        if chat_message is not None:
            content = getattr(chat_message, "content", None)
            if content:
                return self.content_to_text(content)

        content = getattr(result, "content", None)
        if content:
            return self.content_to_text(content)

        text = str(result).strip()
        return "" if text in ("", "None") else text

    def content_to_text(self, content: object) -> str:
        if isinstance(content, str):
            return content.strip()
        if isinstance(content, list):
            return "\n".join(self.content_to_text(item) for item in content).strip()
        return str(content).strip()

    def build_planner_input(self, user_request: str, results: list[dict[str, str]]) -> str:
        return f"用户原始需求：\n{user_request}"

    def build_codebase_input(self, user_request: str, results: list[dict[str, str]]) -> str:
        return "\n\n".join([
            f"用户原始需求：\n{user_request}",
            self.get_result_text(results, "PlannerAgent", "PlannerAgent 尚未输出。"),
        ])

    def build_developer_input(self, user_request: str, results: list[dict[str, str]]) -> str:
        return "\n\n".join([
            f"用户原始需求：\n{user_request}",
            self.get_result_text(results, "PlannerAgent", "PlannerAgent 尚未输出。"),
            self.get_result_text(results, "CodebaseAgent", "CodebaseAgent 尚未输出。"),
        ])

    def build_reviewer_input(self, user_request: str, results: list[dict[str, str]]) -> str:
        return "\n\n".join([
            f"用户原始需求：\n{user_request}",
            self.get_result_text(results, "PlannerAgent", "PlannerAgent 尚未输出。"),
            self.get_result_text(results, "CodebaseAgent", "CodebaseAgent 尚未输出。"),
            self.get_result_text(results, "DeveloperAgent", "DeveloperAgent 尚未输出。"),
        ])

    def build_summary_input(self, user_request: str, results: list[dict[str, str]]) -> str:
        previous = "\n\n".join(f"{item['agent']}:\n{item['content']}" for item in results)
        return f"用户原始需求：\n{user_request}\n\n前序 Agent 输出：\n{previous}"

    def get_result_text(self, results: list[dict[str, str]], agent: str, fallback: str) -> str:
        for item in results:
            if item.get("agent") == agent:
                return f"{agent}:\n{item.get('content', '')}"
        return fallback

    def truncate_agent_output(self, content: str) -> str:
        if len(content) <= MAX_AGENT_OUTPUT_CHARS:
            return content
        return content[:MAX_AGENT_OUTPUT_CHARS] + "\n... truncated ..."

    async def close_model_client(self, model_client: object | None) -> None:
        if model_client is None:
            return

        close = getattr(model_client, "close", None)
        if callable(close):
            maybe_awaitable = close()
            if hasattr(maybe_awaitable, "__await__"):
                await maybe_awaitable
            return

        aclose = getattr(model_client, "aclose", None)
        if callable(aclose):
            maybe_awaitable = aclose()
            if hasattr(maybe_awaitable, "__await__"):
                await maybe_awaitable

    def create_error(self, code: str, message: str) -> dict[str, Any]:
        return {
            "ok": False,
            "error": {
                "code": code,
                "message": self.redact_secret(message),
            },
        }

    def create_sequence_error(
        self,
        code: str,
        message: str,
        results: list[dict[str, str]],
    ) -> dict[str, Any]:
        response = self.create_error(code, message)
        response["results"] = results
        response["mode"] = "sequence"
        response["model"] = self.model_settings.model
        return response

    def sanitize_error(self, error: Exception) -> str:
        return self.redact_secret(str(error) or error.__class__.__name__)

    def redact_secret(self, message: str) -> str:
        value = message[:800]
        if self.model_settings.api_key:
            value = value.replace(self.model_settings.api_key, "***")
        return value
