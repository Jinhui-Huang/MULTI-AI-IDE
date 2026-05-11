import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { AgentConfig, AgentContextFlags, AgentToolFlags } from '../types/agent';
import { TeamAgentConfig, TeamConfig, TeamMode } from '../types/team';
import { GlobalSafetyConfig, ToolPermission, ToolRegistryItem, ToolsConfig } from '../types/tool';
import { WorkflowConfig, WorkflowNode, WorkflowNodeType } from '../types/workflow';

const SETTINGS_KEY = 'autogenAgent.settings';
const AGENTS_KEY = 'autogenAgent.agents';
const TEAMS_KEY = 'autogenAgent.teams';
const WORKFLOWS_KEY = 'autogenAgent.workflows';
const TOOLS_KEY = 'autogenAgent.tools';
const SESSION_TOKEN_KEY = 'sessionToken';
const UI_SETTINGS_KEY = 'uiSettings';
const SECRET_FIELD_NAMES = new Set(['settings.apiKey', 'apiKey']);
const NUMBER_FIELD_NAMES = new Set([
  'settings.port',
  'settings.maxFilesRead',
  'settings.maxContextTokens'
]);

export class ConfigStore {
  constructor(private readonly context: vscode.ExtensionContext) {}

  getDefaultSettings(): Record<string, unknown> {
    return {
      'settings.provider': 'openai_compatible',
      'settings.baseUrl': 'https://generativelanguage.googleapis.com/v1beta/openai/',
      'settings.model': 'gemini-3-flash-preview',
      'settings.fallbackModel': 'gemini-3-flash-preview',
      'settings.useSecretStorage': true,
      'settings.serviceUrl': 'http://127.0.0.1:8765',
      'settings.host': '127.0.0.1',
      'settings.port': 8765,
      'settings.pythonPath': 'python',
      'settings.autogenPackage': 'autogen-agentchat',
      'settings.logLevel': 'info',
      'settings.workspaceStoragePath': '',
      'settings.maxFilesRead': 30,
      'settings.maxContextTokens': 64000,
      'settings.requirePlanApproval': true,
      'settings.requirePatchApproval': true,
      'settings.requireCommandApproval': true,
      'settings.createCheckpointBeforePatch': true,
      'settings.redactSecretsInLogs': true
    };
  }

  async loadSettings(): Promise<Record<string, unknown>> {
    const stored = this.context.globalState.get<Record<string, unknown>>(SETTINGS_KEY);
    return this.sanitizeSettings({
      ...this.getDefaultSettings(),
      ...(stored && typeof stored === 'object' ? stored : {})
    });
  }

  async saveSettings(settings: Record<string, unknown>): Promise<void> {
    const merged = this.sanitizeSettings({
      ...this.getDefaultSettings(),
      ...settings
    });
    await this.context.globalState.update(SETTINGS_KEY, merged);
  }

  getDefaultAgents(): AgentConfig[] {
    return [
      this.createDefaultAgent({
        id: 'planner_agent',
        name: 'PlannerAgent',
        role: 'planner',
        description: '将用户需求拆解为可执行计划。',
        maxTurns: 3,
        maxToolCalls: 5,
        responseFormat: 'json',
        systemPrompt: '你是 PlannerAgent，负责把用户请求拆解为清晰、可执行、可确认的计划。不要修改文件，只输出计划和风险。',
        tools: this.createToolFlags({ list_files: true }),
        context: this.createContextFlags({
          currentFile: true,
          selection: true,
          projectSummary: true
        })
      }),
      this.createDefaultAgent({
        id: 'codebase_agent',
        name: 'CodebaseAgent',
        role: 'codebase',
        description: '读取项目上下文并总结相关文件。',
        temperature: 0.1,
        maxTurns: 6,
        maxToolCalls: 20,
        timeoutSeconds: 180,
        responseFormat: 'json',
        systemPrompt: '你是 CodebaseAgent，负责分析代码库结构、定位相关文件并总结上下文。不要直接修改文件。',
        tools: this.createToolFlags({
          list_files: true,
          read_file: true,
          search_code: true,
          git_diff: true
        }),
        context: this.createContextFlags({
          currentFile: true,
          selection: true,
          gitDiff: true,
          projectSummary: true
        })
      }),
      this.createDefaultAgent({
        id: 'developer_agent',
        name: 'DeveloperAgent',
        role: 'developer',
        description: '根据已确认计划和项目上下文生成 unified diff patch。',
        maxTurns: 8,
        maxToolCalls: 30,
        timeoutSeconds: 240,
        responseFormat: 'json_schema',
        systemPrompt: '你是 DeveloperAgent，负责根据项目上下文生成 unified diff patch。不要直接修改文件，所有修改必须通过 propose_patch。',
        outputJsonSchema: JSON.stringify({
          summary: 'string',
          changedFiles: [],
          patch: 'string',
          risk: 'low|medium|high',
          needsApproval: true
        }, null, 2),
        tools: this.createToolFlags({
          list_files: true,
          read_file: true,
          search_code: true,
          propose_patch: true,
          git_diff: true
        }),
        context: this.createContextFlags({
          currentFile: true,
          selection: true,
          gitDiff: true,
          projectSummary: true
        })
      }),
      this.createDefaultAgent({
        id: 'reviewer_agent',
        name: 'ReviewerAgent',
        role: 'reviewer',
        description: '审查生成的 patch、风险和测试建议。',
        temperature: 0.1,
        maxTurns: 5,
        maxToolCalls: 15,
        timeoutSeconds: 180,
        responseFormat: 'json',
        systemPrompt: '你是 ReviewerAgent，负责审查 patch 的正确性、风险和遗漏。不要应用 patch。',
        tools: this.createToolFlags({
          list_files: true,
          read_file: true,
          search_code: true,
          git_diff: true
        }),
        context: this.createContextFlags({
          currentFile: true,
          selection: true,
          gitDiff: true,
          projectSummary: true
        })
      }),
      this.createDefaultAgent({
        id: 'tester_agent',
        name: 'TesterAgent',
        role: 'tester',
        description: '规划验证命令和测试后续动作。',
        temperature: 0.1,
        maxTurns: 5,
        maxToolCalls: 10,
        timeoutSeconds: 300,
        responseFormat: 'json',
        systemPrompt: '你是 TesterAgent，负责提出测试计划和验证命令。命令只作为建议，必须等待用户确认。',
        tools: this.createToolFlags({
          run_command: true,
          git_diff: true
        }),
        context: this.createContextFlags({
          gitDiff: true,
          terminalError: true,
          projectSummary: true
        })
      }),
      this.createDefaultAgent({
        id: 'summary_agent',
        name: 'SummaryAgent',
        role: 'summary',
        description: '总结最终结果、风险和后续建议。',
        maxTurns: 2,
        maxToolCalls: 0,
        timeoutSeconds: 60,
        responseFormat: 'markdown',
        systemPrompt: '你是 SummaryAgent，负责用简洁结构总结任务结果、修改点、风险和后续建议。',
        tools: this.createToolFlags(),
        context: this.createContextFlags({
          gitDiff: true,
          terminalError: true,
          projectSummary: true
        })
      })
    ];
  }

  async loadAgents(): Promise<AgentConfig[]> {
    const stored = this.context.globalState.get<AgentConfig[]>(AGENTS_KEY);
    if (!Array.isArray(stored) || stored.length === 0) {
      return this.getDefaultAgents();
    }
    return stored.map((agent) => this.normalizeAgent(agent));
  }

  async saveAgents(agents: AgentConfig[]): Promise<void> {
    const normalized = agents.map((agent) => this.normalizeAgent(agent));
    await this.context.globalState.update(AGENTS_KEY, normalized);
  }

  async saveAgent(agent: AgentConfig): Promise<AgentConfig[]> {
    const agents = await this.loadAgents();
    const normalized = this.normalizeAgent(agent);
    const index = agents.findIndex((item) => item.id === normalized.id);
    if (index >= 0) {
      agents[index] = normalized;
    } else {
      agents.push(normalized);
    }
    await this.saveAgents(agents);
    return agents;
  }

  async createAgent(partial: Partial<AgentConfig> = {}): Promise<AgentConfig[]> {
    const agents = await this.loadAgents();
    const baseName = partial.name?.trim() || 'CustomAgent';
    const agent = this.normalizeAgent({
      ...this.createDefaultAgent({
        id: this.createUniqueId(this.toSnakeId(baseName), agents),
        name: baseName,
        role: partial.role || 'custom',
        description: partial.description || '自定义 Agent 配置占位。',
        systemPrompt: partial.systemPrompt || '你是 CustomAgent，按当前任务目标协助完成工作。',
        tools: this.createToolFlags(),
        context: this.createContextFlags({ currentFile: true, selection: true })
      }),
      ...partial
    });
    agent.id = this.createUniqueId(this.toSnakeId(agent.id || agent.name), agents);
    agents.push(agent);
    await this.saveAgents(agents);
    return agents;
  }

  async deleteAgent(agentId: string): Promise<AgentConfig[]> {
    const agents = await this.loadAgents();
    if (agents.length <= 1) {
      throw new Error('CANNOT_DELETE_LAST_AGENT');
    }
    const nextAgents = agents.filter((agent) => agent.id !== agentId);
    if (nextAgents.length === agents.length) {
      throw new Error('AGENT_NOT_FOUND');
    }
    await this.saveAgents(nextAgents);
    return nextAgents;
  }

  async copyAgent(agentId: string): Promise<AgentConfig[]> {
    const agents = await this.loadAgents();
    const source = agents.find((agent) => agent.id === agentId);
    if (!source) {
      throw new Error('AGENT_NOT_FOUND');
    }
    const copyId = this.createUniqueId(`${source.id}_copy`, agents);
    const copyName = this.createUniqueName(`${source.name} Copy`, agents);
    agents.push(this.normalizeAgent({
      ...source,
      id: copyId,
      name: copyName
    }));
    await this.saveAgents(agents);
    return agents;
  }

  async setAgentEnabled(agentId: string, enabled: boolean): Promise<AgentConfig[]> {
    const agents = await this.loadAgents();
    const agent = agents.find((item) => item.id === agentId);
    if (!agent) {
      throw new Error('AGENT_NOT_FOUND');
    }
    agent.enabled = enabled;
    await this.saveAgents(agents);
    return agents;
  }

  async resetAgents(): Promise<AgentConfig[]> {
    const agents = this.getDefaultAgents();
    await this.saveAgents(agents);
    return agents;
  }

  getDefaultTeams(): TeamConfig[] {
    return [
      this.createDefaultTeam({
        id: 'java_spring_team',
        name: 'Java Spring Boot Team',
        default: true
      }),
      this.createDefaultTeam({
        id: 'frontend_react_team',
        name: 'Frontend React Team'
      }),
      this.createDefaultTeam({
        id: 'explain_code_team',
        name: 'Explain Code Team',
        maxTurns: 10,
        retryLimit: 1,
        agents: [
          this.createTeamAgent('codebase_agent', 'CodebaseAgent', 'codebase', 1),
          this.createTeamAgent('summary_agent', 'SummaryAgent', 'summary', 2)
        ]
      }),
      this.createDefaultTeam({
        id: 'bug_fix_team',
        name: 'Bug Fix Team',
        maxTurns: 24,
        retryLimit: 3
      })
    ];
  }

  async loadTeams(): Promise<TeamConfig[]> {
    const stored = this.context.globalState.get<TeamConfig[]>(TEAMS_KEY);
    if (!Array.isArray(stored) || stored.length === 0) {
      return this.getDefaultTeams();
    }
    return this.ensureSingleDefault(stored.map((team) => this.normalizeTeam(team)));
  }

  async saveTeams(teams: TeamConfig[]): Promise<void> {
    await this.context.globalState.update(
      TEAMS_KEY,
      this.ensureSingleDefault(teams.map((team) => this.normalizeTeam(team)))
    );
  }

  async saveTeam(team: TeamConfig): Promise<TeamConfig[]> {
    const teams = await this.loadTeams();
    const normalized = this.normalizeTeam(team);
    const index = teams.findIndex((item) => item.id === normalized.id);
    if (index >= 0) {
      teams[index] = normalized;
    } else {
      teams.push(normalized);
    }
    await this.saveTeams(teams);
    return this.loadTeams();
  }

  async createTeam(partial: Partial<TeamConfig> = {}): Promise<TeamConfig[]> {
    const teams = await this.loadTeams();
    const baseName = partial.name?.trim() || 'Custom Team';
    const team = this.normalizeTeam({
      ...this.createDefaultTeam({
        id: this.createUniqueId(this.toSnakeId(baseName), teams),
        name: baseName,
        default: false
      }),
      ...partial,
      default: false
    });
    team.id = this.createUniqueId(this.toSnakeId(team.id || team.name), teams);
    teams.push(team);
    await this.saveTeams(teams);
    return this.loadTeams();
  }

  async copyTeam(teamId: string): Promise<TeamConfig[]> {
    const teams = await this.loadTeams();
    const source = teams.find((team) => team.id === teamId);
    if (!source) {
      throw new Error('TEAM_NOT_FOUND');
    }
    teams.push(this.normalizeTeam({
      ...source,
      id: this.createUniqueId(`${source.id}_copy`, teams),
      name: this.createUniqueName(`${source.name} Copy`, teams),
      default: false
    }));
    await this.saveTeams(teams);
    return this.loadTeams();
  }

  async deleteTeam(teamId: string): Promise<TeamConfig[]> {
    const teams = await this.loadTeams();
    if (teams.length <= 1) {
      throw new Error('CANNOT_DELETE_LAST_TEAM');
    }
    const nextTeams = teams.filter((team) => team.id !== teamId);
    if (nextTeams.length === teams.length) {
      throw new Error('TEAM_NOT_FOUND');
    }
    if (!nextTeams.some((team) => team.default)) {
      nextTeams[0].default = true;
    }
    await this.saveTeams(nextTeams);
    return this.loadTeams();
  }

  async setDefaultTeam(teamId: string): Promise<TeamConfig[]> {
    const teams = await this.loadTeams();
    if (!teams.some((team) => team.id === teamId)) {
      throw new Error('TEAM_NOT_FOUND');
    }
    teams.forEach((team) => {
      team.default = team.id === teamId;
    });
    await this.saveTeams(teams);
    return this.loadTeams();
  }

  async resetTeams(): Promise<TeamConfig[]> {
    const teams = this.getDefaultTeams();
    await this.saveTeams(teams);
    return teams;
  }

  getDefaultWorkflows(): WorkflowConfig[] {
    return [
      this.createDefaultWorkflow({
        id: 'code_edit',
        name: 'Code Edit Workflow',
        description: '用于代码修改任务',
        type: 'code_edit',
        failureStrategy: 'fallback_to_developer',
        retryLimit: 2,
        nodeTimeoutSeconds: 180,
        confirmPolicy: 'confirm_plan_and_patch',
        default: true,
        nodes: this.createCodeEditNodes()
      }),
      this.createDefaultWorkflow({
        id: 'bug_fix',
        name: 'Bug Fix Workflow',
        description: '用于缺陷定位和修复任务',
        type: 'bug_fix',
        failureStrategy: 'fallback_to_developer',
        retryLimit: 3,
        nodeTimeoutSeconds: 180,
        confirmPolicy: 'confirm_plan_and_patch',
        nodes: this.createCodeEditNodes()
      }),
      this.createDefaultWorkflow({
        id: 'test_generation',
        name: 'Test Generation Workflow',
        description: '用于生成或补齐测试代码',
        type: 'test_generation',
        failureStrategy: 'retry_current_node',
        retryLimit: 2,
        nodeTimeoutSeconds: 180,
        confirmPolicy: 'always_confirm_patch',
        nodes: this.createTestGenerationNodes()
      }),
      this.createDefaultWorkflow({
        id: 'explain_code',
        name: 'Explain Code Workflow',
        description: '用于只读代码解释任务',
        type: 'explain_code',
        failureStrategy: 'stop',
        retryLimit: 1,
        nodeTimeoutSeconds: 120,
        confirmPolicy: 'no_confirm',
        nodes: [
          this.createWorkflowNode('codebase', 'CodebaseAgent', 'agent', 'codebase_agent', ['userRequest', 'context'], ['codebaseSummary']),
          this.createWorkflowNode('summary', 'SummaryAgent', 'agent', 'summary_agent', ['codebaseSummary'], ['summary'])
        ]
      })
    ];
  }

  async loadWorkflows(): Promise<WorkflowConfig[]> {
    const stored = this.context.globalState.get<WorkflowConfig[]>(WORKFLOWS_KEY);
    if (!Array.isArray(stored) || stored.length === 0) {
      return this.getDefaultWorkflows();
    }
    return this.ensureSingleDefault(stored.map((workflow) => this.normalizeWorkflow(workflow)));
  }

  async saveWorkflows(workflows: WorkflowConfig[]): Promise<void> {
    await this.context.globalState.update(
      WORKFLOWS_KEY,
      this.ensureSingleDefault(workflows.map((workflow) => this.normalizeWorkflow(workflow)))
    );
  }

  async saveWorkflow(workflow: WorkflowConfig): Promise<WorkflowConfig[]> {
    const workflows = await this.loadWorkflows();
    const normalized = this.normalizeWorkflow(workflow);
    const index = workflows.findIndex((item) => item.id === normalized.id);
    if (index >= 0) {
      workflows[index] = normalized;
    } else {
      workflows.push(normalized);
    }
    await this.saveWorkflows(workflows);
    return this.loadWorkflows();
  }

  async createWorkflow(partial: Partial<WorkflowConfig> = {}): Promise<WorkflowConfig[]> {
    const workflows = await this.loadWorkflows();
    const baseName = partial.name?.trim() || 'Custom Workflow';
    const workflow = this.normalizeWorkflow({
      ...this.createDefaultWorkflow({
        id: this.createUniqueId(this.toSnakeId(baseName), workflows),
        name: baseName,
        type: partial.type || 'custom',
        default: false
      }),
      ...partial,
      default: false
    });
    workflow.id = this.createUniqueId(this.toSnakeId(workflow.id || workflow.name), workflows);
    workflows.push(workflow);
    await this.saveWorkflows(workflows);
    return this.loadWorkflows();
  }

  async copyWorkflow(workflowId: string, suffix: 'copy' | 'template' = 'copy'): Promise<WorkflowConfig[]> {
    const workflows = await this.loadWorkflows();
    const source = workflows.find((workflow) => workflow.id === workflowId);
    if (!source) {
      throw new Error('WORKFLOW_NOT_FOUND');
    }
    const label = suffix === 'template' ? 'Template' : 'Copy';
    workflows.push(this.normalizeWorkflow({
      ...source,
      id: this.createUniqueId(`${source.id}_${suffix}`, workflows),
      name: this.createUniqueName(`${source.name} ${label}`, workflows),
      default: false
    }));
    await this.saveWorkflows(workflows);
    return this.loadWorkflows();
  }

  async deleteWorkflow(workflowId: string): Promise<WorkflowConfig[]> {
    const workflows = await this.loadWorkflows();
    if (workflows.length <= 1) {
      throw new Error('CANNOT_DELETE_LAST_WORKFLOW');
    }
    const nextWorkflows = workflows.filter((workflow) => workflow.id !== workflowId);
    if (nextWorkflows.length === workflows.length) {
      throw new Error('WORKFLOW_NOT_FOUND');
    }
    if (!nextWorkflows.some((workflow) => workflow.default)) {
      nextWorkflows[0].default = true;
    }
    await this.saveWorkflows(nextWorkflows);
    return this.loadWorkflows();
  }

  async setDefaultWorkflow(workflowId: string): Promise<WorkflowConfig[]> {
    const workflows = await this.loadWorkflows();
    if (!workflows.some((workflow) => workflow.id === workflowId)) {
      throw new Error('WORKFLOW_NOT_FOUND');
    }
    workflows.forEach((workflow) => {
      workflow.default = workflow.id === workflowId;
    });
    await this.saveWorkflows(workflows);
    return this.loadWorkflows();
  }

  async resetWorkflows(): Promise<WorkflowConfig[]> {
    const workflows = this.getDefaultWorkflows();
    await this.saveWorkflows(workflows);
    return workflows;
  }

  getDefaultToolsConfig(): ToolsConfig {
    return {
      permissions: {
        Planner: {
          list_files: 'readonly',
          read_file: 'deny',
          search_code: 'deny',
          propose_patch: 'deny',
          apply_patch: 'deny',
          run_command: 'deny',
          git_diff: 'deny',
          git_status: 'deny'
        },
        Codebase: {
          list_files: 'allow',
          read_file: 'allow',
          search_code: 'allow',
          propose_patch: 'deny',
          apply_patch: 'deny',
          run_command: 'deny',
          git_diff: 'allow',
          git_status: 'allow'
        },
        Developer: {
          list_files: 'allow',
          read_file: 'allow',
          search_code: 'allow',
          propose_patch: 'allow',
          apply_patch: 'confirm',
          run_command: 'deny',
          git_diff: 'allow',
          git_status: 'allow'
        },
        Reviewer: {
          list_files: 'allow',
          read_file: 'allow',
          search_code: 'allow',
          propose_patch: 'deny',
          apply_patch: 'deny',
          run_command: 'deny',
          git_diff: 'allow',
          git_status: 'allow'
        },
        Tester: {
          list_files: 'readonly',
          read_file: 'readonly',
          search_code: 'readonly',
          propose_patch: 'deny',
          apply_patch: 'deny',
          run_command: 'confirm',
          git_diff: 'allow',
          git_status: 'allow'
        }
      },
      registry: this.getDefaultToolRegistry(),
      commandAllowlist: [
        'mvn test',
        'mvn -q test',
        'gradle test',
        'npm test',
        'npm run build',
        'pnpm test',
        'pnpm build',
        'python -m pytest'
      ],
      commandBlocklist: [
        'rm',
        'del',
        'format',
        'curl',
        'wget',
        'ssh',
        'scp',
        'git push',
        'npm publish',
        'powershell',
        'sudo',
        'chmod',
        'chown'
      ],
      sensitiveFileBlocklist: [
        '.env',
        '*.pem',
        'id_rsa',
        'id_ed25519',
        'credentials.json',
        'application-prod.yml',
        '*.p12',
        '*.key'
      ],
      globalSafety: {
        denyOutsideWorkspace: true,
        forcePatchOnly: true,
        confirmApplyPatch: true,
        confirmRunCommand: true,
        denyDangerousTools: true,
        enableToolAuditLog: true
      }
    };
  }

  async loadToolsConfig(): Promise<ToolsConfig> {
    const stored = this.context.globalState.get<Partial<ToolsConfig>>(TOOLS_KEY);
    return this.normalizeToolsConfig(stored);
  }

  async saveToolsConfig(config: ToolsConfig): Promise<void> {
    await this.context.globalState.update(TOOLS_KEY, this.normalizeToolsConfig(config));
  }

  async saveToolPermissions(permissions: ToolsConfig['permissions']): Promise<ToolsConfig> {
    const config = await this.loadToolsConfig();
    config.permissions = this.normalizeToolPermissions(permissions);
    await this.saveToolsConfig(config);
    return this.loadToolsConfig();
  }

  async saveCommandAllowlist(commands: string[] | string): Promise<ToolsConfig> {
    const config = await this.loadToolsConfig();
    config.commandAllowlist = this.normalizeLineList(commands);
    await this.saveToolsConfig(config);
    return this.loadToolsConfig();
  }

  async saveCommandBlocklist(commands: string[] | string): Promise<ToolsConfig> {
    const config = await this.loadToolsConfig();
    config.commandBlocklist = this.normalizeLineList(commands);
    await this.saveToolsConfig(config);
    return this.loadToolsConfig();
  }

  async saveSensitiveFileBlocklist(patterns: string[] | string): Promise<ToolsConfig> {
    const config = await this.loadToolsConfig();
    config.sensitiveFileBlocklist = this.normalizeLineList(patterns);
    await this.saveToolsConfig(config);
    return this.loadToolsConfig();
  }

  async saveGlobalSafety(globalSafety: GlobalSafetyConfig): Promise<ToolsConfig> {
    const config = await this.loadToolsConfig();
    config.globalSafety = this.normalizeGlobalSafety(globalSafety);
    await this.saveToolsConfig(config);
    return this.loadToolsConfig();
  }

  async saveToolSchema(
    toolName: string,
    schema: string,
    returnPreview = '',
    description = ''
  ): Promise<ToolsConfig> {
    const config = await this.loadToolsConfig();
    const name = toolName.trim() || 'custom_tool';
    const index = config.registry.findIndex((tool) => tool.name === name);
    const existing = index >= 0 ? config.registry[index] : undefined;
    const nextTool = this.normalizeToolRegistryItem({
      name,
      description: description || existing?.description || '',
      enabled: existing?.enabled ?? true,
      risk: existing?.risk ?? 'medium',
      schema,
      returnPreview
    });
    if (index >= 0) {
      config.registry[index] = nextTool;
    } else {
      config.registry.push(nextTool);
    }
    await this.saveToolsConfig(config);
    return this.loadToolsConfig();
  }

  async getSessionToken(): Promise<string> {
    let token = this.context.globalState.get<string>(SESSION_TOKEN_KEY);
    if (!token) {
      token = crypto.randomBytes(24).toString('hex');
      await this.context.globalState.update(SESSION_TOKEN_KEY, token);
    }
    return token;
  }

  async saveUiSettings(settings: unknown): Promise<void> {
    await this.context.globalState.update(UI_SETTINGS_KEY, settings);
  }

  getUiSettings(): unknown {
    return this.context.globalState.get(UI_SETTINGS_KEY) ?? {};
  }

  private sanitizeSettings(settings: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};
    Object.entries(settings).forEach(([key, value]) => {
      if (SECRET_FIELD_NAMES.has(key) || value === undefined) {
        return;
      }
      sanitized[key] = this.normalizeValue(key, value);
    });
    return sanitized;
  }

  private normalizeValue(key: string, value: unknown): unknown {
    if (!NUMBER_FIELD_NAMES.has(key)) {
      return value;
    }

    if (typeof value === 'number') {
      return value;
    }

    if (typeof value === 'string' && value.trim()) {
      const numberValue = Number(value);
      return Number.isFinite(numberValue) ? numberValue : value;
    }

    return value;
  }

  private createDefaultAgent(overrides: Partial<AgentConfig>): AgentConfig {
    return {
      id: overrides.id ?? 'custom_agent',
      name: overrides.name ?? 'CustomAgent',
      role: overrides.role ?? 'custom',
      description: overrides.description ?? '',
      model: overrides.model ?? 'gemini-3-flash-preview',
      temperature: overrides.temperature ?? 0.2,
      maxTurns: overrides.maxTurns ?? 8,
      maxToolCalls: overrides.maxToolCalls ?? 20,
      timeoutSeconds: overrides.timeoutSeconds ?? 120,
      responseFormat: overrides.responseFormat ?? 'json',
      stopCondition: overrides.stopCondition ?? 'TERMINATE',
      systemPrompt: overrides.systemPrompt ?? '',
      outputJsonSchema: overrides.outputJsonSchema ?? '',
      enabled: overrides.enabled ?? true,
      tools: this.createToolFlags(overrides.tools),
      context: this.createContextFlags(overrides.context)
    };
  }

  private normalizeAgent(agent: Partial<AgentConfig>): AgentConfig {
    const name = typeof agent.name === 'string' && agent.name.trim() ? agent.name.trim() : 'CustomAgent';
    return {
      id: typeof agent.id === 'string' && agent.id.trim() ? this.toSnakeId(agent.id) : this.toSnakeId(name),
      name,
      role: typeof agent.role === 'string' && agent.role.trim() ? agent.role : 'custom',
      description: typeof agent.description === 'string' ? agent.description : '',
      model: typeof agent.model === 'string' && agent.model.trim() ? agent.model : 'gemini-3-flash-preview',
      temperature: this.toNumber(agent.temperature, 0.2),
      maxTurns: this.toNumber(agent.maxTurns, 8),
      maxToolCalls: this.toNumber(agent.maxToolCalls, 20),
      timeoutSeconds: this.toNumber(agent.timeoutSeconds, 120),
      responseFormat: this.normalizeResponseFormat(agent.responseFormat),
      stopCondition: typeof agent.stopCondition === 'string' ? agent.stopCondition : 'TERMINATE',
      systemPrompt: typeof agent.systemPrompt === 'string' ? agent.systemPrompt : '',
      outputJsonSchema: typeof agent.outputJsonSchema === 'string' ? agent.outputJsonSchema : '',
      enabled: agent.enabled !== false,
      tools: this.createToolFlags(agent.tools),
      context: this.createContextFlags(agent.context)
    };
  }

  private normalizeResponseFormat(value: unknown): AgentConfig['responseFormat'] {
    return value === 'text' || value === 'json' || value === 'json_schema' || value === 'markdown'
      ? value
      : 'json';
  }

  private createToolFlags(overrides: Partial<AgentToolFlags> = {}): AgentToolFlags {
    return {
      list_files: overrides.list_files === true,
      read_file: overrides.read_file === true,
      search_code: overrides.search_code === true,
      propose_patch: overrides.propose_patch === true,
      run_command: overrides.run_command === true,
      git_diff: overrides.git_diff === true
    };
  }

  private createContextFlags(overrides: Partial<AgentContextFlags> = {}): AgentContextFlags {
    return {
      currentFile: overrides.currentFile === true,
      selection: overrides.selection === true,
      gitDiff: overrides.gitDiff === true,
      terminalError: overrides.terminalError === true,
      projectSummary: overrides.projectSummary === true,
      ragResults: overrides.ragResults === true
    };
  }

  private toNumber(value: unknown, fallback: number): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string' && value.trim()) {
      const numberValue = Number(value);
      return Number.isFinite(numberValue) ? numberValue : fallback;
    }
    return fallback;
  }

  private toSnakeId(value: string): string {
    const snake = value
      .trim()
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase();
    return snake || 'custom_agent';
  }

  private createUniqueId(baseId: string, items: Array<{ id: string }>): string {
    const existing = new Set(items.map((item) => item.id));
    if (!existing.has(baseId)) {
      return baseId;
    }
    let index = 2;
    let candidate = `${baseId}_${index}`;
    while (existing.has(candidate)) {
      index += 1;
      candidate = `${baseId}_${index}`;
    }
    return candidate;
  }

  private createUniqueName(baseName: string, items: Array<{ name: string }>): string {
    const existing = new Set(items.map((item) => item.name));
    if (!existing.has(baseName)) {
      return baseName;
    }
    let index = 2;
    let candidate = `${baseName} ${index}`;
    while (existing.has(candidate)) {
      index += 1;
      candidate = `${baseName} ${index}`;
    }
    return candidate;
  }

  private createDefaultTeam(overrides: Partial<TeamConfig>): TeamConfig {
    return {
      id: overrides.id ?? 'custom_team',
      name: overrides.name ?? 'Custom Team',
      mode: this.normalizeTeamMode(overrides.mode),
      maxTurns: overrides.maxTurns ?? 20,
      retryLimit: overrides.retryLimit ?? 2,
      termination: overrides.termination ?? 'workflow_end',
      executionPolicy: overrides.executionPolicy ?? 'sequential',
      modelOverride: overrides.modelOverride ?? 'none',
      default: overrides.default === true,
      enabled: overrides.enabled !== false,
      agents: this.normalizeTeamAgents(overrides.agents)
    };
  }

  private normalizeTeam(team: Partial<TeamConfig>): TeamConfig {
    const name = typeof team.name === 'string' && team.name.trim() ? team.name.trim() : 'Custom Team';
    return {
      id: typeof team.id === 'string' && team.id.trim() ? this.toSnakeId(team.id) : this.toSnakeId(name),
      name,
      mode: this.normalizeTeamMode(team.mode),
      maxTurns: this.toNumber(team.maxTurns, 20),
      retryLimit: this.toNumber(team.retryLimit, 2),
      termination: typeof team.termination === 'string' && team.termination.trim() ? team.termination : 'workflow_end',
      executionPolicy: typeof team.executionPolicy === 'string' && team.executionPolicy.trim() ? team.executionPolicy : 'sequential',
      modelOverride: typeof team.modelOverride === 'string' && team.modelOverride.trim() ? team.modelOverride : 'none',
      default: team.default === true,
      enabled: team.enabled !== false,
      agents: this.normalizeTeamAgents(team.agents)
    };
  }

  private normalizeTeamMode(value: unknown): TeamMode {
    return value === 'sequential' || value === 'round_robin' || value === 'selector' || value === 'manual'
      ? value
      : 'sequential';
  }

  private normalizeTeamAgents(agents: unknown): TeamAgentConfig[] {
    if (!Array.isArray(agents) || agents.length === 0) {
      return this.createDefaultTeamAgents();
    }

    if (agents.every((agent) => typeof agent === 'string')) {
      return (agents as string[]).map((agentId, index) => this.createTeamAgent(
        agentId,
        this.agentNameFromId(agentId),
        this.agentRoleFromId(agentId),
        index + 1
      ));
    }

    return agents.map((agent, index) => {
      const item = agent as Partial<TeamAgentConfig>;
      const agentId = typeof item.agentId === 'string' && item.agentId.trim() ? item.agentId : 'developer_agent';
      return this.createTeamAgent(
        agentId,
        typeof item.name === 'string' && item.name.trim() ? item.name : this.agentNameFromId(agentId),
        typeof item.role === 'string' && item.role.trim() ? item.role : this.agentRoleFromId(agentId),
        typeof item.order === 'number' && Number.isFinite(item.order) ? item.order : index + 1,
        item.enabled !== false
      );
    }).sort((a, b) => a.order - b.order);
  }

  private createDefaultTeamAgents(): TeamAgentConfig[] {
    return [
      this.createTeamAgent('planner_agent', 'PlannerAgent', 'planner', 1),
      this.createTeamAgent('codebase_agent', 'CodebaseAgent', 'codebase', 2),
      this.createTeamAgent('developer_agent', 'DeveloperAgent', 'developer', 3),
      this.createTeamAgent('reviewer_agent', 'ReviewerAgent', 'reviewer', 4),
      this.createTeamAgent('tester_agent', 'TesterAgent', 'tester', 5),
      this.createTeamAgent('summary_agent', 'SummaryAgent', 'summary', 6)
    ];
  }

  private createTeamAgent(
    agentId: string,
    name: string,
    role: string,
    order: number,
    enabled = true
  ): TeamAgentConfig {
    return { agentId, name, role, order, enabled };
  }

  private createDefaultWorkflow(overrides: Partial<WorkflowConfig>): WorkflowConfig {
    const workflow: WorkflowConfig = {
      id: overrides.id ?? 'custom_workflow',
      name: overrides.name ?? 'Custom Workflow',
      description: overrides.description ?? '',
      type: overrides.type ?? 'custom',
      failureStrategy: overrides.failureStrategy ?? 'stop',
      retryLimit: overrides.retryLimit ?? 2,
      nodeTimeoutSeconds: overrides.nodeTimeoutSeconds ?? 180,
      confirmPolicy: overrides.confirmPolicy ?? 'confirm_plan_and_patch',
      jsonVersion: overrides.jsonVersion ?? 1,
      default: overrides.default === true,
      enabled: overrides.enabled !== false,
      nodes: this.normalizeWorkflowNodes(overrides.nodes)
    };
    workflow.jsonPreview = this.createWorkflowJsonPreview(workflow);
    return workflow;
  }

  private normalizeWorkflow(workflow: Partial<WorkflowConfig>): WorkflowConfig {
    const name = typeof workflow.name === 'string' && workflow.name.trim() ? workflow.name.trim() : 'Custom Workflow';
    const normalized: WorkflowConfig = {
      id: typeof workflow.id === 'string' && workflow.id.trim() ? this.toSnakeId(workflow.id) : this.toSnakeId(name),
      name,
      description: typeof workflow.description === 'string' ? workflow.description : '',
      type: typeof workflow.type === 'string' && workflow.type.trim() ? workflow.type : 'custom',
      failureStrategy: typeof workflow.failureStrategy === 'string' && workflow.failureStrategy.trim() ? workflow.failureStrategy : 'stop',
      retryLimit: this.toNumber(workflow.retryLimit, 2),
      nodeTimeoutSeconds: this.toNumber(workflow.nodeTimeoutSeconds, 180),
      confirmPolicy: typeof workflow.confirmPolicy === 'string' && workflow.confirmPolicy.trim() ? workflow.confirmPolicy : 'confirm_plan_and_patch',
      jsonVersion: this.toNumber(workflow.jsonVersion, 1),
      default: workflow.default === true,
      enabled: workflow.enabled !== false,
      nodes: this.normalizeWorkflowNodes(workflow.nodes)
    };
    normalized.jsonPreview = typeof workflow.jsonPreview === 'string' && workflow.jsonPreview.trim()
      ? workflow.jsonPreview
      : this.createWorkflowJsonPreview(normalized);
    return normalized;
  }

  private normalizeWorkflowNodes(nodes: unknown): WorkflowNode[] {
    if (!Array.isArray(nodes) || nodes.length === 0) {
      return this.createCodeEditNodes();
    }

    return nodes.map((node) => {
      const item = node as Partial<WorkflowNode>;
      const id = typeof item.id === 'string' && item.id.trim() ? this.toSnakeId(item.id) : 'node';
      const type = this.normalizeWorkflowNodeType(item.type);
      const name = typeof item.name === 'string' && item.name.trim()
        ? item.name
        : (typeof item.agentId === 'string' ? this.agentNameFromId(item.agentId) : id);
      return {
        id,
        name,
        type,
        agentId: typeof item.agentId === 'string' && item.agentId.trim() ? item.agentId : undefined,
        inputFields: this.normalizeStringArray(item.inputFields),
        outputFields: this.normalizeStringArray(item.outputFields),
        onFailure: typeof item.onFailure === 'string' && item.onFailure.trim() ? item.onFailure : 'retry',
        maxRetries: this.toNumber(item.maxRetries, 1),
        timeoutSeconds: this.toNumber(item.timeoutSeconds, 120),
        enabled: item.enabled !== false
      };
    });
  }

  private normalizeWorkflowNodeType(value: unknown): WorkflowNodeType {
    return value === 'agent' || value === 'human_approval' || value === 'condition' || value === 'tool' || value === 'summary'
      ? value
      : 'agent';
  }

  private createCodeEditNodes(): WorkflowNode[] {
    return [
      this.createWorkflowNode('planner', 'PlannerAgent', 'agent', 'planner_agent', ['userRequest', 'context'], ['plan']),
      this.createWorkflowNode('plan_approval', 'Plan Approval', 'human_approval', undefined, ['plan'], ['approval']),
      this.createWorkflowNode('codebase', 'CodebaseAgent', 'agent', 'codebase_agent', ['context', 'plan'], ['codebaseSummary']),
      this.createWorkflowNode('developer', 'DeveloperAgent', 'agent', 'developer_agent', ['plan', 'codebaseSummary'], ['patch', 'changedFiles', 'risk']),
      this.createWorkflowNode('reviewer', 'ReviewerAgent', 'agent', 'reviewer_agent', ['patch'], ['reviewResult']),
      this.createWorkflowNode('patch_approval', 'Patch Approval', 'human_approval', undefined, ['patch', 'reviewResult'], ['approval']),
      this.createWorkflowNode('tester', 'TesterAgent', 'agent', 'tester_agent', ['patch', 'reviewResult'], ['testResult']),
      this.createWorkflowNode('summary', 'SummaryAgent', 'agent', 'summary_agent', ['testResult', 'reviewResult'], ['summary'])
    ];
  }

  private createTestGenerationNodes(): WorkflowNode[] {
    return [
      this.createWorkflowNode('codebase', 'CodebaseAgent', 'agent', 'codebase_agent', ['userRequest', 'context'], ['codebaseSummary']),
      this.createWorkflowNode('developer', 'DeveloperAgent', 'agent', 'developer_agent', ['codebaseSummary'], ['patch', 'changedFiles']),
      this.createWorkflowNode('reviewer', 'ReviewerAgent', 'agent', 'reviewer_agent', ['patch'], ['reviewResult']),
      this.createWorkflowNode('patch_approval', 'Patch Approval', 'human_approval', undefined, ['patch', 'reviewResult'], ['approval']),
      this.createWorkflowNode('tester', 'TesterAgent', 'agent', 'tester_agent', ['patch'], ['testResult']),
      this.createWorkflowNode('summary', 'SummaryAgent', 'agent', 'summary_agent', ['testResult', 'reviewResult'], ['summary'])
    ];
  }

  private createWorkflowNode(
    id: string,
    name: string,
    type: WorkflowNodeType,
    agentId: string | undefined,
    inputFields: string[],
    outputFields: string[]
  ): WorkflowNode {
    return {
      id,
      name,
      type,
      agentId,
      inputFields,
      outputFields,
      onFailure: 'retry',
      maxRetries: 1,
      timeoutSeconds: 120,
      enabled: true
    };
  }

  private createWorkflowJsonPreview(workflow: WorkflowConfig): string {
    return JSON.stringify({
      id: workflow.id,
      name: workflow.name,
      version: workflow.jsonVersion,
      nodes: workflow.nodes.map((node) => ({
        id: node.id,
        name: node.name,
        type: node.type,
        agentId: node.agentId,
        inputFields: node.inputFields,
        outputFields: node.outputFields,
        onFailure: node.onFailure,
        maxRetries: node.maxRetries,
        timeoutSeconds: node.timeoutSeconds
      }))
    }, null, 2);
  }

  private normalizeStringArray(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
    }
    if (typeof value === 'string') {
      return value.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean);
    }
    return [];
  }

  private agentNameFromId(agentId: string): string {
    const names: Record<string, string> = {
      planner_agent: 'PlannerAgent',
      codebase_agent: 'CodebaseAgent',
      developer_agent: 'DeveloperAgent',
      reviewer_agent: 'ReviewerAgent',
      tester_agent: 'TesterAgent',
      summary_agent: 'SummaryAgent'
    };
    return names[agentId] ?? agentId;
  }

  private agentRoleFromId(agentId: string): string {
    return agentId.replace(/_agent$/, '') || 'custom';
  }

  private ensureSingleDefault<T extends { default: boolean }>(items: T[]): T[] {
    if (items.length === 0) {
      return items;
    }

    let found = false;
    items.forEach((item) => {
      if (item.default && !found) {
        found = true;
        return;
      }
      item.default = false;
    });
    if (!found) {
      items[0].default = true;
    }
    return items;
  }

  private getDefaultToolRegistry(): ToolRegistryItem[] {
    return [
      this.createToolRegistryItem('list_files', 'List workspace files.', 'low'),
      this.createToolRegistryItem('read_file', '读取 workspace 内指定文件内容', 'medium', JSON.stringify({
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'workspace 内相对路径'
          }
        },
        required: ['path']
      }, null, 2), JSON.stringify({
        ok: true,
        content: 'placeholder file content',
        metadata: {
          path: 'pom.xml',
          size: 1024
        }
      }, null, 2)),
      this.createToolRegistryItem('search_code', 'Search source code with workspace guard.', 'low'),
      this.createToolRegistryItem('propose_patch', 'Draft patch without touching files.', 'medium'),
      this.createToolRegistryItem('apply_patch', 'Apply approved patch proposal.', 'high', '', '', false),
      this.createToolRegistryItem('run_command', 'Run approved shell command.', 'high', '', '', false),
      this.createToolRegistryItem('git_diff', 'Inspect git diff output.', 'medium'),
      this.createToolRegistryItem('git_status', 'Inspect git status output.', 'low')
    ];
  }

  private createToolRegistryItem(
    name: string,
    description: string,
    risk: ToolRegistryItem['risk'],
    schema = '',
    returnPreview = '',
    enabled = true
  ): ToolRegistryItem {
    return {
      name,
      description,
      enabled,
      risk,
      schema,
      returnPreview
    };
  }

  private normalizeToolsConfig(config?: Partial<ToolsConfig>): ToolsConfig {
    const defaults = this.getDefaultToolsConfig();
    return {
      permissions: this.normalizeToolPermissions(config?.permissions),
      registry: this.normalizeToolRegistry(config?.registry, defaults.registry),
      commandAllowlist: this.normalizeLineList(config?.commandAllowlist ?? defaults.commandAllowlist),
      commandBlocklist: this.normalizeLineList(config?.commandBlocklist ?? defaults.commandBlocklist),
      sensitiveFileBlocklist: this.normalizeLineList(config?.sensitiveFileBlocklist ?? defaults.sensitiveFileBlocklist),
      globalSafety: this.normalizeGlobalSafety(config?.globalSafety)
    };
  }

  private normalizeToolPermissions(permissions?: ToolsConfig['permissions']): ToolsConfig['permissions'] {
    const defaults = this.getDefaultToolsConfig().permissions;
    const normalized: ToolsConfig['permissions'] = {};
    Object.entries(defaults).forEach(([agent, tools]) => {
      normalized[agent] = {};
      Object.entries(tools).forEach(([tool, fallback]) => {
        normalized[agent][tool] = this.normalizeToolPermission(permissions?.[agent]?.[tool], fallback);
      });
    });
    return normalized;
  }

  private normalizeToolPermission(value: unknown, fallback: ToolPermission = 'deny'): ToolPermission {
    return value === 'deny' || value === 'allow' || value === 'confirm' || value === 'readonly' || value === 'whitelist'
      ? value
      : fallback;
  }

  private normalizeToolRegistry(
    registry: unknown,
    defaults: ToolRegistryItem[]
  ): ToolRegistryItem[] {
    if (!Array.isArray(registry)) {
      return defaults.map((tool) => this.normalizeToolRegistryItem(tool));
    }

    const byName = new Map<string, ToolRegistryItem>();
    defaults.forEach((tool) => {
      byName.set(tool.name, this.normalizeToolRegistryItem(tool));
    });
    registry.forEach((tool) => {
      const normalized = this.normalizeToolRegistryItem(tool);
      byName.set(normalized.name, normalized);
    });
    return Array.from(byName.values());
  }

  private normalizeToolRegistryItem(tool: unknown): ToolRegistryItem {
    const value = tool && typeof tool === 'object' ? tool as Partial<ToolRegistryItem> : {};
    const name = typeof value.name === 'string' && value.name.trim() ? value.name.trim() : 'custom_tool';
    const risk = value.risk === 'low' || value.risk === 'medium' || value.risk === 'high' ? value.risk : 'medium';
    return {
      name,
      description: typeof value.description === 'string' ? value.description : '',
      enabled: value.enabled !== false,
      risk,
      schema: typeof value.schema === 'string' ? value.schema : '',
      returnPreview: typeof value.returnPreview === 'string' ? value.returnPreview : ''
    };
  }

  private normalizeGlobalSafety(globalSafety?: Partial<GlobalSafetyConfig>): GlobalSafetyConfig {
    return {
      denyOutsideWorkspace: globalSafety?.denyOutsideWorkspace !== false,
      forcePatchOnly: globalSafety?.forcePatchOnly !== false,
      confirmApplyPatch: globalSafety?.confirmApplyPatch !== false,
      confirmRunCommand: globalSafety?.confirmRunCommand !== false,
      denyDangerousTools: globalSafety?.denyDangerousTools !== false,
      enableToolAuditLog: globalSafety?.enableToolAuditLog !== false
    };
  }

  private normalizeLineList(value: string[] | string): string[] {
    if (Array.isArray(value)) {
      return value.map((item) => item.trim()).filter(Boolean);
    }
    return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  }
}
