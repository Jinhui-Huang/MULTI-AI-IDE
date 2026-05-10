import { StreamEvent } from '../types/messages';
export interface WebviewState {
  currentTab: 'run' | 'agents' | 'team' | 'tools' | 'workflow' | 'settings';
  currentTaskId?: string;
  events: StreamEvent[];
  selectedAgentId?: string;
  selectedTeamId?: string;
  selectedWorkflowId?: string;
}
export const initialWebviewState = (): WebviewState => ({ currentTab: 'run', events: [] });
