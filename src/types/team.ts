export type TeamMode = 'sequential' | 'round_robin' | 'selector' | 'manual';
export interface TeamConfig {
  id: string;
  name: string;
  description?: string;
  mode: TeamMode;
  defaultTeam?: boolean;
  maxTurns: number;
  retryLimit: number;
  termination: string;
  executionPolicy?: 'serial' | 'parallel';
  modelOverridePolicy?: 'agent_default' | 'team_override' | 'runtime_default';
  agents: string[];
}
