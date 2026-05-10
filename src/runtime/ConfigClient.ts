import { ExtensionApiClient } from './ExtensionApiClient';
export class ConfigClient {
  constructor(private readonly api: ExtensionApiClient) {}
  getFullConfig(): Promise<unknown> { return this.api.get('/api/config/full'); }
  saveAgent(agentId: string, config: unknown): Promise<unknown> { return this.api.put(`/api/agents/${agentId}`, config); }
  saveTeam(teamId: string, config: unknown): Promise<unknown> { return this.api.put(`/api/teams/${teamId}`, config); }
  saveWorkflow(workflowId: string, config: unknown): Promise<unknown> { return this.api.put(`/api/workflows/${workflowId}`, config); }
}
