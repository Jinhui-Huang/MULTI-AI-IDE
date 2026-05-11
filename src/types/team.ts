export type TeamMode = 'sequential' | 'round_robin' | 'selector' | 'manual';

export interface TeamAgentConfig {
  agentId: string;
  name: string;
  role: string;
  order: number;
  enabled: boolean;
}

export interface TeamConfig {
  id: string;
  name: string;
  mode: TeamMode;
  maxTurns: number;
  retryLimit: number;
  termination: string;
  executionPolicy: string;
  modelOverride: string;
  default: boolean;
  enabled: boolean;
  agents: TeamAgentConfig[];
}
