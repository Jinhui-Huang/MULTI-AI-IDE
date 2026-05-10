class PermissionGuard:
    def __init__(self, matrix=None, safety=None):
        self.matrix = matrix or {}
        self.safety = safety or {}
    def check(self, agent_id: str, tool_name: str, args: dict) -> str:
        permission = self.matrix.get(agent_id, {}).get(tool_name, 'deny')
        if permission == 'deny':
            raise PermissionError(f'{agent_id} cannot call {tool_name}')
        return permission
