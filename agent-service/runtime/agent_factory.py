from typing import Callable, Awaitable, Any

from runtime.agent_prompts import (
    CODEBASE_PROMPT,
    DEVELOPER_PROMPT,
    PLANNER_PROMPT,
    REVIEWER_PROMPT,
    SUMMARY_PROMPT,
)
from runtime.autogen_tools import AutoGenToolGateway
from runtime.model_client_factory import ModelClientFactory
from runtime.model_settings import ModelSettings


class AgentFactory:
    """Creates single-role AutoGen AssistantAgent instances for ordered debug runs."""

    def __init__(
        self,
        model_client_factory: ModelClientFactory,
        tool_gateway: AutoGenToolGateway | None = None,
    ) -> None:
        self.model_client_factory = model_client_factory
        self.tool_gateway = tool_gateway or AutoGenToolGateway()

    def create_planner_agent(self, model_settings: ModelSettings, model_client: object):
        return self.create_assistant_agent(
            name="PlannerAgent",
            model_client=model_client,
            system_message=PLANNER_PROMPT,
            tools=[self.tool_gateway.list_files],
            max_tool_iterations=2,
        )

    def create_codebase_agent(self, model_settings: ModelSettings, model_client: object):
        return self.create_assistant_agent(
            name="CodebaseAgent",
            model_client=model_client,
            system_message=CODEBASE_PROMPT,
            tools=[
                self.tool_gateway.list_files,
                self.tool_gateway.read_file,
                self.tool_gateway.search_code,
                self.tool_gateway.git_status,
                self.tool_gateway.git_diff,
            ],
            max_tool_iterations=6,
        )

    def create_developer_agent(self, model_settings: ModelSettings, model_client: object):
        return self.create_assistant_agent(
            name="DeveloperAgent",
            model_client=model_client,
            system_message=DEVELOPER_PROMPT,
            tools=[
                self.tool_gateway.list_files,
                self.tool_gateway.read_file,
                self.tool_gateway.search_code,
            ],
            max_tool_iterations=4,
        )

    def create_reviewer_agent(self, model_settings: ModelSettings, model_client: object):
        return self.create_assistant_agent(
            name="ReviewerAgent",
            model_client=model_client,
            system_message=REVIEWER_PROMPT,
            tools=[
                self.tool_gateway.read_file,
                self.tool_gateway.search_code,
                self.tool_gateway.git_diff,
            ],
            max_tool_iterations=4,
        )

    def create_summary_agent(self, model_settings: ModelSettings, model_client: object):
        return self.create_assistant_agent(
            name="SummaryAgent",
            model_client=model_client,
            system_message=SUMMARY_PROMPT,
            tools=[],
            max_tool_iterations=1,
        )

    def create_agent(self, role: str, model_settings: ModelSettings, model_client: object):
        factories = {
            "planner": self.create_planner_agent,
            "codebase": self.create_codebase_agent,
            "developer": self.create_developer_agent,
            "reviewer": self.create_reviewer_agent,
            "summary": self.create_summary_agent,
        }
        factory = factories.get(role)
        if not factory:
            raise ValueError(f"Unknown agent role: {role}")
        return factory(model_settings, model_client)

    def create_assistant_agent(
        self,
        name: str,
        model_client: object,
        system_message: str,
        tools: list[Callable[..., Any] | Callable[..., Awaitable[Any]]],
        max_tool_iterations: int,
    ):
        from autogen_agentchat.agents import AssistantAgent

        return AssistantAgent(
            name=name,
            model_client=model_client,
            tools=tools,
            system_message=system_message,
            reflect_on_tool_use=bool(tools),
            max_tool_iterations=max_tool_iterations,
        )
