export type ToolPermission = 'deny' | 'allow' | 'confirm' | 'readonly' | 'whitelist';
export type ToolRisk = 'low' | 'medium' | 'high';

export interface ToolRegistryItem {
  name: string;
  description: string;
  enabled: boolean;
  risk: ToolRisk;
  schema: string;
  returnPreview: string;
}

export interface GlobalSafetyConfig {
  denyOutsideWorkspace: boolean;
  forcePatchOnly: boolean;
  confirmApplyPatch: boolean;
  confirmRunCommand: boolean;
  denyDangerousTools: boolean;
  enableToolAuditLog: boolean;
}

export interface ToolsConfig {
  permissions: Record<string, Record<string, ToolPermission>>;
  registry: ToolRegistryItem[];
  commandAllowlist: string[];
  commandBlocklist: string[];
  sensitiveFileBlocklist: string[];
  globalSafety: GlobalSafetyConfig;
}

export interface ToolResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  summary?: string;
}
