from .base import AgentRuntimeAdapter
class MockAdapter(AgentRuntimeAdapter):
    async def run_agent(self, agent_config, context):
        return {'agentId': agent_config.get('id'), 'content': 'mock agent result', 'context': context}
    async def run_team(self, team_config, context):
        yield {'type': 'agent.message', 'payload': {'content': 'mock team event'}}
