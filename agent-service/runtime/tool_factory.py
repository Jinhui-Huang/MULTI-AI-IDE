class ToolFactory:
    """Injects permission-checked tools into agents."""
    def __init__(self, gateway):
        self.gateway = gateway
    def create_tools_for_agent(self, agent_id, tool_names):
        async def call_tool(tool_name: str, args: dict):
            return await self.gateway.call(agent_id, tool_name, args)
        return [call_tool for _ in tool_names]
