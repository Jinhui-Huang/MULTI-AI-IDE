class ToolGateway:
    def __init__(self, permission_guard, vscode_client=None):
        self.permission_guard = permission_guard
        self.vscode_client = vscode_client
    async def call(self, agent_id: str, tool_name: str, args: dict):
        permission = self.permission_guard.check(agent_id, tool_name, args)
        if permission == 'confirm':
            return {'ok': False, 'approvalRequired': True, 'toolName': tool_name, 'args': args}
        if self.vscode_client:
            return await self.vscode_client.call_tool(tool_name, args)
        return {'ok': True, 'summary': f'placeholder tool result for {tool_name}', 'args': args}
