class AgentFactory:
    """Creates runtime-specific Agent instances from neutral AgentConfig."""
    def __init__(self, model_client_factory, tool_factory):
        self.model_client_factory = model_client_factory
        self.tool_factory = tool_factory
    async def create(self, agent_config):
        # TODO: instantiate autogen_agentchat.agents.AssistantAgent here.
        return {'id': agent_config.get('id'), 'runtime': 'placeholder'}
