class AutoGenAdapter:
    """Keep AutoGen-specific imports here. Replace mock with AssistantAgent + tools + run_stream."""
    def __init__(self, settings, ws_manager): self.settings=settings; self.ws=ws_manager
    async def run_agent(self, task_id: str, agent_name: str, user_request: str, ctx: dict) -> dict:
        # TODO:
        # from autogen_agentchat.agents import AssistantAgent
        # from autogen_ext.models.openai import OpenAIChatCompletionClient
        if self.settings.api_key: return {'content': f'{agent_name}: received `{user_request}`. Real AutoGen integration placeholder.'}
        return {'content': f'{agent_name}: mock response for `{user_request}`. Set API key to enable real AutoGen.'}
