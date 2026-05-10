from abc import ABC, abstractmethod
class AgentRuntimeAdapter(ABC):
    @abstractmethod
    async def run_agent(self, agent_config, context): ...
    @abstractmethod
    async def run_team(self, team_config, context): ...
    async def cancel(self, task_id: str): return None
