export type ToolPermission = 'deny' | 'allow' | 'confirm' | 'readonly' | 'whitelist';
export interface ToolDefinition {
  name: string;
  description: string;
  category: 'file' | 'search' | 'patch' | 'terminal' | 'git' | 'runtime' | 'custom';
  schema: Record<string, unknown>;
  dangerous?: boolean;
  enabled: boolean;
}
export interface ToolPermissionMatrix { [agentId: string]: { [toolName: string]: ToolPermission }; }
export interface GlobalSafetyConfig {
  denyOutsideWorkspace: boolean;
  denyDirectWrite: boolean;
  forcePatchApproval: boolean;
  forceCommandApproval: boolean;
  globallyDisableDangerousTools: boolean;
  logToolResults: boolean;
  commandAllowlist: string[];
  commandBlocklist: string[];
  sensitiveFileBlocklist: string[];
}
export interface ToolResult<T = unknown> { ok: boolean; data?: T; error?: string; summary?: string; }
