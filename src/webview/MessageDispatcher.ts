import * as vscode from 'vscode';
import { ConfigStore } from '../storage/ConfigStore';
import { RuntimeManager, RuntimeManagerError, RuntimeStatus } from '../runtime/RuntimeManager';
import { SecretStore } from '../storage/SecretStore';
import { AgentConfig, AgentContextFlags, AgentToolFlags } from '../types/agent';
import { TeamConfig } from '../types/team';
import { GlobalSafetyConfig, ToolPermission, ToolsConfig } from '../types/tool';
import { WorkflowConfig, WorkflowNode } from '../types/workflow';
import { PatchTools } from '../tools/PatchTools';
import { TerminalTools } from '../tools/TerminalTools';
import { ToolError } from '../tools/ToolTypes';
import { GitTools } from '../tools/GitTools';

export interface TaskCreatePayload {
  userRequest?: string;
}

export interface WebviewMessage<T = unknown> {
  type: string;
  requestId?: string;
  payload?: T;
  timestamp?: number;
}

export interface WebviewResponse {
  ok: boolean;
  type: string;
  requestId?: string;
  payload?: unknown;
  error?: {
    code: string;
    message: string;
  };
}

interface ActionPayload {
  fields?: Record<string, unknown>;
  patchId?: string;
  commandId?: string;
  reason?: string;
}

export class MessageDispatcher {
  private readonly placeholderActions = new Set([
    'task.pause',
    'task.resume',
    'task.cancel',
    'task.rerunCurrentAgent',
    'task.switchAgent',
    'task.openHistory',
    'task.openContext',
    'task.copyLog',
    'task.userMessage',
    'plan.approve',
    'plan.revise',
    'plan.saveAsTemplate',
    'patch.applyPartial',
    'patch.explain',
    'agent.import',
    'agent.test',
    'team.addAgent',
    'team.removeAgent',
    'team.moveAgentUp',
    'team.moveAgentDown',
    'team.useTemplate',
    'tool.permission.batchEdit',
    'tool.create',
    'tool.test',
    'workflow.testRun',
    'workflow.exportJson',
    'workflow.importJson',
    'workflow.node.select',
    'workflow.node.edit',
    'workflow.node.addAfter',
    'workflow.node.moveUp',
    'workflow.node.moveDown',
    'workflow.node.delete',
    'workflow.node.addAgent',
    'workflow.node.addHumanApproval',
    'workflow.node.addCondition',
    'settings.testModel',
    'settings.import',
    'settings.export',
    'settings.restoreDefault',
    'settings.safety.save',
    'settings.runtime.save',
    'runtime.openLogs',
    'runtime.openConfigDir',
    'taskHistory.clear'
  ]);

  constructor(
    private readonly output: vscode.OutputChannel,
    private readonly configStore: ConfigStore,
    private readonly secretStore: SecretStore,
    private readonly runtimeManager: RuntimeManager,
    private readonly patchTools: PatchTools,
    private readonly terminalTools: TerminalTools,
    private readonly gitTools: GitTools,
    private readonly postToWebview?: (message: WebviewResponse) => void | PromiseLike<unknown>
  ) {}

  async dispatch(message: unknown): Promise<WebviewResponse> {
    if (!this.isWebviewMessage(message)) {
      return {
        ok: false,
        type: 'response.error',
        error: {
          code: 'INVALID_MESSAGE',
          message: 'Webview message must include a string type'
        }
      };
    }

    this.output.appendLine(`[webview] ${message.type}`);
    if (message.type === 'settings.load') {
      return this.handleSettingsLoad(message);
    }

    if (message.type === 'task.create') {
      return this.handleTaskCreate(message as WebviewMessage<ActionPayload>);
    }

    if (message.type === 'settings.save') {
      return this.handleSettingsSave(message as WebviewMessage<ActionPayload>);
    }

    if (message.type === 'agents.load') {
      return this.handleAgentsLoad(message);
    }

    if (message.type === 'agent.save') {
      return this.handleAgentSave(message as WebviewMessage<ActionPayload>);
    }

    if (message.type === 'agent.create') {
      return this.handleAgentCreate(message as WebviewMessage<ActionPayload>);
    }

    if (message.type === 'agent.copy') {
      return this.handleAgentCopy(message as WebviewMessage<ActionPayload>);
    }

    if (message.type === 'agent.disable') {
      return this.handleAgentDisable(message as WebviewMessage<ActionPayload>);
    }

    if (message.type === 'agent.delete') {
      return this.handleAgentDelete(message as WebviewMessage<ActionPayload>);
    }

    if (message.type === 'agent.reset') {
      return this.handleAgentReset(message);
    }

    if (message.type === 'teams.load') {
      return this.handleTeamsLoad(message);
    }

    if (message.type === 'team.save') {
      return this.handleTeamSave(message as WebviewMessage<ActionPayload>);
    }

    if (message.type === 'team.create') {
      return this.handleTeamCreate(message);
    }

    if (message.type === 'team.copy') {
      return this.handleTeamCopy(message as WebviewMessage<ActionPayload>);
    }

    if (message.type === 'team.delete') {
      return this.handleTeamDelete(message as WebviewMessage<ActionPayload>);
    }

    if (message.type === 'team.setDefault') {
      return this.handleTeamSetDefault(message as WebviewMessage<ActionPayload>);
    }

    if (message.type === 'team.restoreDefault') {
      return this.handleTeamRestoreDefault(message);
    }

    if (message.type === 'workflows.load') {
      return this.handleWorkflowsLoad(message);
    }

    if (message.type === 'workflow.save') {
      return this.handleWorkflowSave(message as WebviewMessage<ActionPayload>);
    }

    if (message.type === 'workflow.saveAsTemplate') {
      return this.handleWorkflowSaveAsTemplate(message as WebviewMessage<ActionPayload>);
    }

    if (message.type === 'workflow.setDefault') {
      return this.handleWorkflowSetDefault(message as WebviewMessage<ActionPayload>);
    }

    if (message.type === 'tools.load') {
      return this.handleToolsLoad(message);
    }

    if (message.type === 'tool.permission.save') {
      return this.handleToolPermissionSave(message as WebviewMessage<ActionPayload>);
    }

    if (message.type === 'tool.schema.save') {
      return this.handleToolSchemaSave(message as WebviewMessage<ActionPayload>);
    }

    if (message.type === 'tool.allowlist.save') {
      return this.handleToolAllowlistSave(message as WebviewMessage<ActionPayload>);
    }

    if (message.type === 'tool.blocklist.save') {
      return this.handleToolBlocklistSave(message as WebviewMessage<ActionPayload>);
    }

    if (message.type === 'tool.sensitiveFiles.save') {
      return this.handleToolSensitiveFilesSave(message as WebviewMessage<ActionPayload>);
    }

    if (message.type === 'tool.globalSafety.save') {
      return this.handleToolGlobalSafetySave(message as WebviewMessage<ActionPayload>);
    }

    if (message.type === 'runtime.start') {
      return this.handleRuntimeAction(message, () => this.runtimeManager.start(), 'Runtime started', 'RUNTIME_START_FAILED');
    }

    if (message.type === 'runtime.stop') {
      return this.handleRuntimeAction(message, () => this.runtimeManager.stop(), 'Runtime stopped', 'RUNTIME_STOP_FAILED');
    }

    if (message.type === 'runtime.restart') {
      return this.handleRuntimeAction(message, () => this.runtimeManager.restart(), 'Runtime restarted', 'RUNTIME_RESTART_FAILED');
    }

    if (message.type === 'runtime.health') {
      return this.handleRuntimeAction(message, () => this.runtimeManager.health(), 'Runtime health checked', 'RUNTIME_HEALTH_FAILED');
    }

    if (message.type === 'patch.debug.proposePlaceholder') {
      return this.handlePatchDebugProposePlaceholder(message as WebviewMessage<ActionPayload>);
    }

    if (message.type === 'patch.openDiff') {
      return this.handlePatchOpenDiff(message as WebviewMessage<ActionPayload>);
    }

    if (message.type === 'patch.apply') {
      return this.handlePatchApply(message as WebviewMessage<ActionPayload>);
    }

    if (message.type === 'patch.reject') {
      return this.handlePatchReject(message as WebviewMessage<ActionPayload>);
    }

    if (message.type === 'command.debug.requestMvnTest') {
      return this.handleCommandDebugRequestMvnTest(message as WebviewMessage<ActionPayload>);
    }

    if (message.type === 'command.approveOnce') {
      return this.handleCommandApproveOnce(message as WebviewMessage<ActionPayload>);
    }

    if (message.type === 'command.addAllowlist') {
      return this.handleCommandAddAllowlist(message as WebviewMessage<ActionPayload>);
    }

    if (message.type === 'command.reject') {
      return this.handleCommandReject(message as WebviewMessage<ActionPayload>);
    }

    if (message.type === 'git.debug.status') {
      return this.handleGitDebugStatus(message);
    }

    if (message.type === 'git.debug.diff') {
      return this.handleGitDebugDiff(message as WebviewMessage<ActionPayload>);
    }

    if (this.placeholderActions.has(message.type)) {
      return this.createPlaceholderResponse(message);
    }

    return {
      ok: false,
      type: 'error',
      requestId: message.requestId,
      error: {
        code: 'UNKNOWN_ACTION',
        message: `Unknown action: ${message.type}`
      }
    };
  }

  createTaskPlaceholder(message: WebviewMessage<TaskCreatePayload>): WebviewResponse {
    return this.createPlaceholderResponse(message);
  }

  private async handleTaskCreate(message: WebviewMessage<ActionPayload>): Promise<WebviewResponse> {
    const fields = message.payload?.fields ?? {};
    const userRequest = this.getStringField(fields, 'task.userRequest').trim();
    if (!userRequest) {
      return {
        ok: false,
        type: 'task.create.result',
        requestId: message.requestId,
        error: {
          code: 'EMPTY_USER_REQUEST',
          message: 'Task request is empty.'
        }
      };
    }

    const payload = {
      userRequest,
      fields,
      workspaceRoot: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '',
      source: 'vscode-webview'
    };

    try {
      const serviceResponse = await this.runtimeManager.createTask(payload);
      const task = this.extractTask(serviceResponse);
      const taskId = task?.id ?? this.extractTaskId(serviceResponse);
      if (taskId) {
        await this.connectTaskEventStream(taskId);
      }
      return {
        ok: true,
        type: 'task.create.result',
        requestId: message.requestId,
        payload: {
          message: 'Task created',
          taskId,
          task,
          serviceResponse
        }
      };
    } catch (error) {
      if (error instanceof RuntimeManagerError && error.code === 'RUNTIME_NOT_RUNNING') {
        return {
          ok: false,
          type: 'task.create.result',
          requestId: message.requestId,
          error: {
            code: 'RUNTIME_NOT_RUNNING',
            message: 'Runtime is not running. Please start Runtime first.'
          }
        };
      }

      return {
        ok: false,
        type: 'task.create.result',
        requestId: message.requestId,
        error: {
          code: 'TASK_CREATE_FAILED',
          message: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }

  private createPlaceholderResponse(message: WebviewMessage): WebviewResponse {
    return {
      ok: true,
      type: `${message.type}.result`,
      requestId: message.requestId,
      payload: {
        message: `Placeholder handled: ${message.type}`,
        receivedPayload: message.payload ?? {}
      }
    };
  }

  private async connectTaskEventStream(taskId: string): Promise<void> {
    try {
      await this.runtimeManager.connectTaskEvents(
        taskId,
        (event) => {
          void this.postTaskEvent(event);
        },
        (error) => {
          void this.postTaskEventError(error);
        }
      );
    } catch (error) {
      await this.postTaskEventError(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private async postTaskEvent(event: unknown): Promise<void> {
    if (!this.postToWebview) {
      return;
    }
    await this.postToWebview({
      ok: true,
      type: 'task.event',
      payload: { event }
    });
  }

  private async postTaskEventError(error: Error): Promise<void> {
    if (!this.postToWebview) {
      return;
    }
    await this.postToWebview({
      ok: false,
      type: 'task.event.error',
      error: {
        code: 'TASK_EVENT_STREAM_ERROR',
        message: error.message
      }
    });
  }

  private async handleSettingsLoad(message: WebviewMessage): Promise<WebviewResponse> {
    const settings = await this.configStore.loadSettings();
    const apiKeySaved = await this.secretStore.hasApiKey();
    return {
      ok: true,
      type: 'settings.load.result',
      requestId: message.requestId,
      payload: {
        message: 'Settings loaded',
        settings,
        apiKeySaved
      }
    };
  }

  private async handleSettingsSave(message: WebviewMessage<ActionPayload>): Promise<WebviewResponse> {
    const fields = message.payload?.fields ?? {};
    const settingsFields = this.pickSettingsFields(fields);
    const apiKey = this.getStringField(fields, 'settings.apiKey');
    await this.configStore.saveSettings(settingsFields);

    if (settingsFields['settings.useSecretStorage'] === true && apiKey.trim()) {
      await this.secretStore.saveApiKey(apiKey);
    }

    const apiKeySaved = await this.secretStore.hasApiKey();
    return {
      ok: true,
      type: 'settings.save.result',
      requestId: message.requestId,
      payload: {
        message: 'Settings saved',
        apiKeySaved
      }
    };
  }

  private async handleAgentsLoad(message: WebviewMessage): Promise<WebviewResponse> {
    const agents = await this.configStore.loadAgents();
    return {
      ok: true,
      type: 'agents.load.result',
      requestId: message.requestId,
      payload: {
        message: 'Agents loaded',
        agents
      }
    };
  }

  private async handleAgentSave(message: WebviewMessage<ActionPayload>): Promise<WebviewResponse> {
    const fields = message.payload?.fields ?? {};
    const agent = this.buildAgentFromFields(fields);
    const existingAgent = this.findAgent(await this.configStore.loadAgents(), agent.id);
    if (existingAgent) {
      agent.enabled = existingAgent.enabled;
    }
    const agents = await this.configStore.saveAgent(agent);
    const savedAgent = this.findAgent(agents, agent.id);
    return this.createAgentSuccessResponse(message, 'Agent saved', agents, savedAgent);
  }

  private async handleAgentCreate(message: WebviewMessage<ActionPayload>): Promise<WebviewResponse> {
    const agents = await this.configStore.createAgent();
    const agent = agents[agents.length - 1];
    return this.createAgentSuccessResponse(message, 'Agent created', agents, agent);
  }

  private async handleAgentCopy(message: WebviewMessage<ActionPayload>): Promise<WebviewResponse> {
    const fields = message.payload?.fields ?? {};
    const agentId = this.getAgentId(fields);
    if (!agentId) {
      return this.createErrorResponse(message, 'AGENT_ID_REQUIRED', 'Agent id is required');
    }

    try {
      const agents = await this.configStore.copyAgent(agentId);
      const agent = agents[agents.length - 1];
      return this.createAgentSuccessResponse(message, 'Agent copied', agents, agent);
    } catch (error) {
      return this.createAgentErrorResponse(message, error);
    }
  }

  private async handleAgentDisable(message: WebviewMessage<ActionPayload>): Promise<WebviewResponse> {
    const fields = message.payload?.fields ?? {};
    const agentId = this.getAgentId(fields);
    if (!agentId) {
      return this.createErrorResponse(message, 'AGENT_ID_REQUIRED', 'Agent id is required');
    }

    try {
      const agents = await this.configStore.setAgentEnabled(agentId, false);
      const agent = this.findAgent(agents, agentId);
      return this.createAgentSuccessResponse(message, 'Agent disabled', agents, agent);
    } catch (error) {
      return this.createAgentErrorResponse(message, error);
    }
  }

  private async handleAgentDelete(message: WebviewMessage<ActionPayload>): Promise<WebviewResponse> {
    const fields = message.payload?.fields ?? {};
    const agentId = this.getAgentId(fields);
    if (!agentId) {
      return this.createErrorResponse(message, 'AGENT_ID_REQUIRED', 'Agent id is required');
    }

    try {
      const agents = await this.configStore.deleteAgent(agentId);
      const agent = agents.find((item) => item.id === 'developer_agent') ?? agents[0];
      return this.createAgentSuccessResponse(message, 'Agent deleted', agents, agent);
    } catch (error) {
      return this.createAgentErrorResponse(message, error);
    }
  }

  private async handleAgentReset(message: WebviewMessage): Promise<WebviewResponse> {
    const agents = await this.configStore.resetAgents();
    const agent = this.findAgent(agents, 'developer_agent') ?? agents[0];
    return this.createAgentSuccessResponse(message, 'Agents reset', agents, agent);
  }

  private async handleTeamsLoad(message: WebviewMessage): Promise<WebviewResponse> {
    const teams = await this.configStore.loadTeams();
    return {
      ok: true,
      type: 'teams.load.result',
      requestId: message.requestId,
      payload: {
        message: 'Teams loaded',
        teams
      }
    };
  }

  private async handleTeamSave(message: WebviewMessage<ActionPayload>): Promise<WebviewResponse> {
    const fields = message.payload?.fields ?? {};
    const existingTeams = await this.configStore.loadTeams();
    const teamId = this.getStringField(fields, 'team.id');
    const existingTeam = teamId ? existingTeams.find((team) => team.id === teamId) : undefined;
    const team = this.buildTeamFromFields(fields, existingTeam);
    const teams = await this.configStore.saveTeam(team);
    return this.createTeamSuccessResponse(message, 'Team saved', teams, this.findTeam(teams, team.id));
  }

  private async handleTeamCreate(message: WebviewMessage): Promise<WebviewResponse> {
    const teams = await this.configStore.createTeam();
    return this.createTeamSuccessResponse(message, 'Team created', teams, teams[teams.length - 1]);
  }

  private async handleTeamCopy(message: WebviewMessage<ActionPayload>): Promise<WebviewResponse> {
    const teamId = this.getTeamId(message.payload?.fields ?? {}) || 'java_spring_team';
    try {
      const teams = await this.configStore.copyTeam(teamId);
      return this.createTeamSuccessResponse(message, 'Team copied', teams, teams[teams.length - 1]);
    } catch (error) {
      return this.createTeamErrorResponse(message, error);
    }
  }

  private async handleTeamDelete(message: WebviewMessage<ActionPayload>): Promise<WebviewResponse> {
    const teamId = this.getTeamId(message.payload?.fields ?? {});
    if (!teamId) {
      return this.createErrorResponse(message, 'TEAM_ID_REQUIRED', 'Team id is required');
    }
    try {
      const teams = await this.configStore.deleteTeam(teamId);
      const team = teams.find((item) => item.default) ?? teams[0];
      return this.createTeamSuccessResponse(message, 'Team deleted', teams, team);
    } catch (error) {
      return this.createTeamErrorResponse(message, error);
    }
  }

  private async handleTeamSetDefault(message: WebviewMessage<ActionPayload>): Promise<WebviewResponse> {
    const teamId = this.getTeamId(message.payload?.fields ?? {});
    if (!teamId) {
      return this.createErrorResponse(message, 'TEAM_ID_REQUIRED', 'Team id is required');
    }
    try {
      const teams = await this.configStore.setDefaultTeam(teamId);
      return this.createTeamSuccessResponse(message, 'Default team set', teams, this.findTeam(teams, teamId));
    } catch (error) {
      return this.createTeamErrorResponse(message, error);
    }
  }

  private async handleTeamRestoreDefault(message: WebviewMessage): Promise<WebviewResponse> {
    const teams = await this.configStore.resetTeams();
    const team = teams.find((item) => item.default) ?? teams[0];
    return this.createTeamSuccessResponse(message, 'Teams restored', teams, team);
  }

  private async handleWorkflowsLoad(message: WebviewMessage): Promise<WebviewResponse> {
    const workflows = await this.configStore.loadWorkflows();
    return {
      ok: true,
      type: 'workflows.load.result',
      requestId: message.requestId,
      payload: {
        message: 'Workflows loaded',
        workflows
      }
    };
  }

  private async handleWorkflowSave(message: WebviewMessage<ActionPayload>): Promise<WebviewResponse> {
    const fields = message.payload?.fields ?? {};
    const existingWorkflows = await this.configStore.loadWorkflows();
    const workflowId = this.getStringField(fields, 'workflow.id');
    const existingWorkflow = workflowId ? existingWorkflows.find((workflow) => workflow.id === workflowId) : undefined;
    const { workflow, warning } = this.buildWorkflowFromFields(fields, existingWorkflow);
    const workflows = await this.configStore.saveWorkflow(workflow);
    return this.createWorkflowSuccessResponse(
      message,
      'Workflow saved',
      workflows,
      this.findWorkflow(workflows, workflow.id),
      warning
    );
  }

  private async handleWorkflowSaveAsTemplate(message: WebviewMessage<ActionPayload>): Promise<WebviewResponse> {
    const workflowId = this.getWorkflowId(message.payload?.fields ?? {}) || 'code_edit';
    try {
      const workflows = await this.configStore.copyWorkflow(workflowId, 'template');
      return this.createWorkflowSuccessResponse(message, 'Workflow template saved', workflows, workflows[workflows.length - 1]);
    } catch (error) {
      return this.createWorkflowErrorResponse(message, error);
    }
  }

  private async handleWorkflowSetDefault(message: WebviewMessage<ActionPayload>): Promise<WebviewResponse> {
    const workflowId = this.getWorkflowId(message.payload?.fields ?? {});
    if (!workflowId) {
      return this.createErrorResponse(message, 'WORKFLOW_ID_REQUIRED', 'Workflow id is required');
    }
    try {
      const workflows = await this.configStore.setDefaultWorkflow(workflowId);
      return this.createWorkflowSuccessResponse(message, 'Default workflow set', workflows, this.findWorkflow(workflows, workflowId));
    } catch (error) {
      return this.createWorkflowErrorResponse(message, error);
    }
  }

  private async handleToolsLoad(message: WebviewMessage): Promise<WebviewResponse> {
    const toolsConfig = await this.configStore.loadToolsConfig();
    return this.createToolsSuccessResponse(message, 'Tools loaded', toolsConfig);
  }

  private async handleToolPermissionSave(message: WebviewMessage<ActionPayload>): Promise<WebviewResponse> {
    const permissions = this.getToolPermissions(message.payload?.fields ?? {});
    const toolsConfig = await this.configStore.saveToolPermissions(permissions);
    return this.createToolsSuccessResponse(message, 'Tool permissions saved', toolsConfig);
  }

  private async handleToolSchemaSave(message: WebviewMessage<ActionPayload>): Promise<WebviewResponse> {
    const fields = message.payload?.fields ?? {};
    const toolsConfig = await this.configStore.saveToolSchema(
      this.getStringField(fields, 'tool.name'),
      this.getStringField(fields, 'tool.schema'),
      this.getStringField(fields, 'tool.returnPreview'),
      this.getStringField(fields, 'tool.description')
    );
    return this.createToolsSuccessResponse(message, 'Tool schema saved', toolsConfig);
  }

  private async handleToolAllowlistSave(message: WebviewMessage<ActionPayload>): Promise<WebviewResponse> {
    const toolsConfig = await this.configStore.saveCommandAllowlist(
      this.getStringField(message.payload?.fields ?? {}, 'tool.commandAllowlist')
    );
    return this.createToolsSuccessResponse(message, 'Command allowlist saved', toolsConfig);
  }

  private async handleToolBlocklistSave(message: WebviewMessage<ActionPayload>): Promise<WebviewResponse> {
    const toolsConfig = await this.configStore.saveCommandBlocklist(
      this.getStringField(message.payload?.fields ?? {}, 'tool.commandBlocklist')
    );
    return this.createToolsSuccessResponse(message, 'Command blocklist saved', toolsConfig);
  }

  private async handleToolSensitiveFilesSave(message: WebviewMessage<ActionPayload>): Promise<WebviewResponse> {
    const toolsConfig = await this.configStore.saveSensitiveFileBlocklist(
      this.getStringField(message.payload?.fields ?? {}, 'tool.sensitiveFileBlocklist')
    );
    return this.createToolsSuccessResponse(message, 'Sensitive file blocklist saved', toolsConfig);
  }

  private async handleToolGlobalSafetySave(message: WebviewMessage<ActionPayload>): Promise<WebviewResponse> {
    const toolsConfig = await this.configStore.saveGlobalSafety(
      this.getGlobalSafety(message.payload?.fields ?? {})
    );
    return this.createToolsSuccessResponse(message, 'Global safety saved', toolsConfig);
  }

  private async handleRuntimeAction(
    message: WebviewMessage,
    action: () => Promise<RuntimeStatus>,
    successMessage: string,
    errorCode: string
  ): Promise<WebviewResponse> {
    try {
      const status = await action();
      if (!status.running && (message.type === 'runtime.start' || message.type === 'runtime.restart' || message.type === 'runtime.health')) {
        return {
          ok: false,
          type: `${message.type}.result`,
          requestId: message.requestId,
          payload: { status },
          error: {
            code: errorCode,
            message: status.message
          }
        };
      }

      return {
        ok: true,
        type: `${message.type}.result`,
        requestId: message.requestId,
        payload: {
          message: successMessage,
          status
        }
      };
    } catch (error) {
      return {
        ok: false,
        type: `${message.type}.result`,
        requestId: message.requestId,
        error: {
          code: errorCode,
          message: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }

  private async handlePatchDebugProposePlaceholder(message: WebviewMessage<ActionPayload>): Promise<WebviewResponse> {
    return this.handlePatchAction(message, async () => this.patchTools.proposePatch({
      summary: 'AutoGen placeholder patch',
      files: [{
        path: '.autogen-placeholder/placeholder.txt',
        changeType: 'add',
        oldContent: '',
        newContent: 'AutoGen placeholder patch\n'
      }]
    }));
  }

  private async handlePatchOpenDiff(message: WebviewMessage<ActionPayload>): Promise<WebviewResponse> {
    return this.handlePatchAction(message, async () => this.patchTools.openPatchDiff(this.getPatchId(message)));
  }

  private async handlePatchApply(message: WebviewMessage<ActionPayload>): Promise<WebviewResponse> {
    return this.handlePatchAction(message, async () => this.patchTools.applyPatch(this.getPatchId(message)));
  }

  private async handlePatchReject(message: WebviewMessage<ActionPayload>): Promise<WebviewResponse> {
    const reason = message.payload?.reason || this.getStringField(message.payload?.fields ?? {}, 'task.followupMessage');
    return this.handlePatchAction(message, async () => this.patchTools.rejectPatch(this.getPatchId(message), reason));
  }

  private async handlePatchAction(
    message: WebviewMessage<ActionPayload>,
    action: () => Promise<unknown>
  ): Promise<WebviewResponse> {
    try {
      return {
        ok: true,
        type: `${message.type}.result`,
        requestId: message.requestId,
        payload: await action()
      };
    } catch (error) {
      return {
        ok: false,
        type: `${message.type}.result`,
        requestId: message.requestId,
        error: this.toPatchError(error)
      };
    }
  }

  private getPatchId(message: WebviewMessage<ActionPayload>): string | undefined {
    return message.payload?.patchId || this.getStringField(message.payload?.fields ?? {}, 'patch.id') || undefined;
  }

  private toPatchError(error: unknown): { code: string; message: string } {
    if (error instanceof ToolError) {
      return {
        code: error.code,
        message: error.message
      };
    }

    if (error instanceof Error && error.message.startsWith('DIFF_OPEN_FAILED:')) {
      return {
        code: 'DIFF_OPEN_FAILED',
        message: error.message.replace(/^DIFF_OPEN_FAILED:\s*/, '')
      };
    }

    return {
      code: 'PATCH_APPLY_FAILED',
      message: error instanceof Error ? error.message : String(error)
    };
  }

  private async handleCommandDebugRequestMvnTest(message: WebviewMessage<ActionPayload>): Promise<WebviewResponse> {
    return this.handleCommandAction(message, async () => ({
      message: 'Command approval required',
      command: await this.terminalTools.requestRunCommand('mvn test', 'Debug test command'),
      approvalRequired: true
    }));
  }

  private async handleCommandApproveOnce(message: WebviewMessage<ActionPayload>): Promise<WebviewResponse> {
    return this.handleCommandAction(message, async () => ({
      message: 'Command executed',
      result: await this.terminalTools.approveAndRun(this.getCommandId(message))
    }));
  }

  private async handleCommandAddAllowlist(message: WebviewMessage<ActionPayload>): Promise<WebviewResponse> {
    return this.handleCommandAction(message, async () => await this.terminalTools.addCommandToAllowlist(this.getCommandId(message)));
  }

  private async handleCommandReject(message: WebviewMessage<ActionPayload>): Promise<WebviewResponse> {
    const reason = message.payload?.reason || this.getStringField(message.payload?.fields ?? {}, 'task.followupMessage');
    return this.handleCommandAction(message, async () => ({
      message: 'Command rejected',
      command: await this.terminalTools.rejectCommand(this.getCommandId(message), reason)
    }));
  }

  private async handleCommandAction(
    message: WebviewMessage<ActionPayload>,
    action: () => Promise<unknown>
  ): Promise<WebviewResponse> {
    try {
      return {
        ok: true,
        type: `${message.type}.result`,
        requestId: message.requestId,
        payload: await action()
      };
    } catch (error) {
      return {
        ok: false,
        type: `${message.type}.result`,
        requestId: message.requestId,
        error: this.toCommandError(error)
      };
    }
  }

  private getCommandId(message: WebviewMessage<ActionPayload>): string | undefined {
    return message.payload?.commandId || this.getStringField(message.payload?.fields ?? {}, 'command.id') || undefined;
  }

  private toCommandError(error: unknown): { code: string; message: string } {
    if (error instanceof ToolError) {
      return {
        code: error.code,
        message: error.message
      };
    }

    const code = error instanceof Error ? error.message : String(error);
    if (code === 'COMMAND_NOT_FOUND') {
      return {
        code,
        message: 'Command not found'
      };
    }

    return {
      code: 'COMMAND_EXEC_FAILED',
      message: error instanceof Error ? error.message : String(error)
    };
  }

  private async handleGitDebugStatus(message: WebviewMessage): Promise<WebviewResponse> {
    return this.handleGitAction(message, async () => ({
      message: 'Git status loaded',
      result: await this.gitTools.gitStatus()
    }));
  }

  private async handleGitDebugDiff(message: WebviewMessage<ActionPayload>): Promise<WebviewResponse> {
    const fields = message.payload?.fields ?? {};
    return this.handleGitAction(message, async () => ({
      message: 'Git diff loaded',
      result: await this.gitTools.gitDiff({
        path: this.getStringField(fields, 'git.debug.path') || undefined,
        cached: fields['git.debug.cached'] === true,
        maxBytes: 200000
      })
    }));
  }

  private async handleGitAction(
    message: WebviewMessage,
    action: () => Promise<unknown>
  ): Promise<WebviewResponse> {
    try {
      return {
        ok: true,
        type: `${message.type}.result`,
        requestId: message.requestId,
        payload: await action()
      };
    } catch (error) {
      return {
        ok: false,
        type: `${message.type}.result`,
        requestId: message.requestId,
        error: this.toGitError(error)
      };
    }
  }

  private toGitError(error: unknown): { code: string; message: string } {
    if (error instanceof ToolError) {
      return {
        code: error.code,
        message: error.message
      };
    }
    return {
      code: 'GIT_COMMAND_FAILED',
      message: error instanceof Error ? error.message : String(error)
    };
  }

  private pickSettingsFields(fields: Record<string, unknown>): Record<string, unknown> {
    const settings: Record<string, unknown> = {};
    Object.entries(fields).forEach(([key, value]) => {
      if (!key.startsWith('settings.') || key === 'settings.apiKey' || value === undefined) {
        return;
      }
      settings[key] = value;
    });
    return settings;
  }

  private getStringField(fields: Record<string, unknown>, key: string): string {
    const value = fields[key];
    return typeof value === 'string' ? value : '';
  }

  private buildAgentFromFields(fields: Record<string, unknown>): AgentConfig {
    const name = this.getStringField(fields, 'agent.name').trim() || 'CustomAgent';
    const id = this.getAgentId(fields) || this.toSnakeId(name);
    return {
      id,
      name,
      role: this.getStringField(fields, 'agent.role') || 'custom',
      description: this.getStringField(fields, 'agent.description'),
      model: this.getStringField(fields, 'agent.model') || 'gemini-3-flash-preview',
      temperature: this.getNumberField(fields, 'agent.temperature', 0.2),
      maxTurns: this.getNumberField(fields, 'agent.maxTurns', 8),
      maxToolCalls: this.getNumberField(fields, 'agent.maxToolCalls', 20),
      timeoutSeconds: this.getNumberField(fields, 'agent.timeoutSeconds', 120),
      responseFormat: this.getResponseFormat(fields),
      stopCondition: this.getStringField(fields, 'agent.stopCondition') || 'TERMINATE',
      systemPrompt: this.getStringField(fields, 'agent.systemPrompt'),
      outputJsonSchema: this.getStringField(fields, 'agent.outputJsonSchema'),
      enabled: true,
      tools: this.getAgentTools(fields),
      context: this.getAgentContext(fields)
    };
  }

  private getAgentId(fields: Record<string, unknown>): string {
    const direct = this.getStringField(fields, 'agent.id').trim();
    return direct || '';
  }

  private getNumberField(fields: Record<string, unknown>, key: string, fallback: number): number {
    const value = fields[key];
    return this.toNumber(value, fallback);
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

  private getResponseFormat(fields: Record<string, unknown>): AgentConfig['responseFormat'] {
    const value = this.getStringField(fields, 'agent.responseFormat');
    return value === 'text' || value === 'json' || value === 'json_schema' || value === 'markdown'
      ? value
      : 'json';
  }

  private getAgentTools(fields: Record<string, unknown>): AgentToolFlags {
    return {
      list_files: fields['agent.tools.list_files'] === true,
      read_file: fields['agent.tools.read_file'] === true,
      search_code: fields['agent.tools.search_code'] === true,
      propose_patch: fields['agent.tools.propose_patch'] === true,
      run_command: fields['agent.tools.run_command'] === true,
      git_diff: fields['agent.tools.git_diff'] === true
    };
  }

  private getAgentContext(fields: Record<string, unknown>): AgentContextFlags {
    return {
      currentFile: fields['agent.context.currentFile'] === true,
      selection: fields['agent.context.selection'] === true,
      gitDiff: fields['agent.context.gitDiff'] === true,
      terminalError: fields['agent.context.terminalError'] === true,
      projectSummary: fields['agent.context.projectSummary'] === true,
      ragResults: fields['agent.context.ragResults'] === true
    };
  }

  private buildTeamFromFields(fields: Record<string, unknown>, existingTeam?: TeamConfig): TeamConfig {
    const name = this.getStringField(fields, 'team.name').trim() || existingTeam?.name || 'Custom Team';
    const id = this.getTeamId(fields) || this.toSnakeId(name);
    return {
      id,
      name,
      mode: this.getTeamMode(fields),
      maxTurns: this.getNumberField(fields, 'team.maxTurns', existingTeam?.maxTurns ?? 20),
      retryLimit: this.getNumberField(fields, 'team.retryLimit', existingTeam?.retryLimit ?? 2),
      termination: this.getStringField(fields, 'team.termination') || existingTeam?.termination || 'workflow_end',
      executionPolicy: this.getStringField(fields, 'team.executionPolicy') || existingTeam?.executionPolicy || 'sequential',
      modelOverride: this.getStringField(fields, 'team.modelOverride') || existingTeam?.modelOverride || 'none',
      default: existingTeam?.default === true,
      enabled: existingTeam?.enabled !== false,
      agents: existingTeam?.agents ?? this.getDefaultTeamAgents()
    };
  }

  private buildWorkflowFromFields(
    fields: Record<string, unknown>,
    existingWorkflow?: WorkflowConfig
  ): { workflow: WorkflowConfig; warning?: string } {
    const name = this.getStringField(fields, 'workflow.name').trim() || existingWorkflow?.name || 'Custom Workflow';
    const id = this.getWorkflowId(fields) || this.toSnakeId(name);
    const parsed = this.parseWorkflowJsonPreview(this.getStringField(fields, 'workflow.jsonPreview'));
    const nodes = parsed.nodes ?? existingWorkflow?.nodes ?? this.getDefaultWorkflowNodes();
    return {
      workflow: {
        id,
        name,
        description: this.getStringField(fields, 'workflow.description') || existingWorkflow?.description || '',
        type: this.getStringField(fields, 'workflow.type') || existingWorkflow?.type || 'custom',
        failureStrategy: this.getStringField(fields, 'workflow.failureStrategy') || existingWorkflow?.failureStrategy || 'stop',
        retryLimit: this.getNumberField(fields, 'workflow.retryLimit', existingWorkflow?.retryLimit ?? 2),
        nodeTimeoutSeconds: this.getNumberField(fields, 'workflow.nodeTimeoutSeconds', existingWorkflow?.nodeTimeoutSeconds ?? 180),
        confirmPolicy: this.getStringField(fields, 'workflow.confirmPolicy') || existingWorkflow?.confirmPolicy || 'confirm_plan_and_patch',
        jsonVersion: this.getNumberField(fields, 'workflow.jsonVersion', existingWorkflow?.jsonVersion ?? 1),
        default: existingWorkflow?.default === true,
        enabled: existingWorkflow?.enabled !== false,
        nodes,
        jsonPreview: this.getStringField(fields, 'workflow.jsonPreview')
      },
      warning: parsed.warning
    };
  }

  private getTeamMode(fields: Record<string, unknown>): TeamConfig['mode'] {
    const value = this.getStringField(fields, 'team.mode');
    return value === 'sequential' || value === 'round_robin' || value === 'selector' || value === 'manual'
      ? value
      : 'sequential';
  }

  private getTeamId(fields: Record<string, unknown>): string {
    return this.getStringField(fields, 'team.id').trim();
  }

  private getWorkflowId(fields: Record<string, unknown>): string {
    return this.getStringField(fields, 'workflow.id').trim();
  }

  private getDefaultTeamAgents(): TeamConfig['agents'] {
    return [
      { agentId: 'planner_agent', name: 'PlannerAgent', role: 'planner', order: 1, enabled: true },
      { agentId: 'codebase_agent', name: 'CodebaseAgent', role: 'codebase', order: 2, enabled: true },
      { agentId: 'developer_agent', name: 'DeveloperAgent', role: 'developer', order: 3, enabled: true },
      { agentId: 'reviewer_agent', name: 'ReviewerAgent', role: 'reviewer', order: 4, enabled: true },
      { agentId: 'tester_agent', name: 'TesterAgent', role: 'tester', order: 5, enabled: true },
      { agentId: 'summary_agent', name: 'SummaryAgent', role: 'summary', order: 6, enabled: true }
    ];
  }

  private getDefaultWorkflowNodes(): WorkflowNode[] {
    return [
      { id: 'planner', name: 'PlannerAgent', type: 'agent', agentId: 'planner_agent', inputFields: ['userRequest', 'context'], outputFields: ['plan'], onFailure: 'retry', maxRetries: 1, timeoutSeconds: 120, enabled: true },
      { id: 'developer', name: 'DeveloperAgent', type: 'agent', agentId: 'developer_agent', inputFields: ['plan'], outputFields: ['patch'], onFailure: 'retry', maxRetries: 1, timeoutSeconds: 120, enabled: true },
      { id: 'summary', name: 'SummaryAgent', type: 'agent', agentId: 'summary_agent', inputFields: ['patch'], outputFields: ['summary'], onFailure: 'retry', maxRetries: 1, timeoutSeconds: 120, enabled: true }
    ];
  }

  private parseWorkflowJsonPreview(value: string): { nodes?: WorkflowNode[]; warning?: string } {
    if (!value.trim()) {
      return {};
    }

    try {
      const parsed = JSON.parse(value) as { nodes?: unknown };
      if (!Array.isArray(parsed.nodes)) {
        return {};
      }
      return {
        nodes: parsed.nodes.map((node, index) => this.normalizeWorkflowNode(node, index))
      };
    } catch {
      return { warning: 'Invalid workflow.jsonPreview ignored' };
    }
  }

  private normalizeWorkflowNode(node: unknown, index: number): WorkflowNode {
    const value = node && typeof node === 'object' ? node as Record<string, unknown> : {};
    const id = typeof value.id === 'string' && value.id.trim() ? this.toSnakeId(value.id) : `node_${index + 1}`;
    const agentId = typeof value.agentId === 'string' && value.agentId.trim() ? this.normalizeAgentId(value.agentId) : undefined;
    return {
      id,
      name: typeof value.name === 'string' && value.name.trim() ? value.name : this.agentNameFromId(agentId) || id,
      type: this.normalizeWorkflowNodeType(value.type),
      agentId,
      inputFields: this.normalizeStringArray(value.inputFields),
      outputFields: this.normalizeStringArray(value.outputFields),
      onFailure: typeof value.onFailure === 'string' && value.onFailure.trim() ? value.onFailure : 'retry',
      maxRetries: this.toNumber(value.maxRetries, 1),
      timeoutSeconds: this.toNumber(value.timeoutSeconds, 120),
      enabled: value.enabled !== false
    };
  }

  private normalizeWorkflowNodeType(value: unknown): WorkflowNode['type'] {
    return value === 'agent' || value === 'human_approval' || value === 'condition' || value === 'tool' || value === 'summary'
      ? value
      : 'agent';
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

  private getToolPermissions(fields: Record<string, unknown>): ToolsConfig['permissions'] {
    const permissions: ToolsConfig['permissions'] = {};
    Object.entries(fields).forEach(([key, value]) => {
      if (!key.startsWith('toolPermission.')) {
        return;
      }
      const [, agent, tool] = key.split('.');
      if (!agent || !tool) {
        return;
      }
      permissions[agent] = permissions[agent] ?? {};
      permissions[agent][tool] = this.normalizeToolPermission(value);
    });
    return permissions;
  }

  private normalizeToolPermission(value: unknown): ToolPermission {
    return value === 'deny' || value === 'allow' || value === 'confirm' || value === 'readonly' || value === 'whitelist'
      ? value
      : 'deny';
  }

  private getGlobalSafety(fields: Record<string, unknown>): GlobalSafetyConfig {
    return {
      denyOutsideWorkspace: fields['safety.denyOutsideWorkspace'] === true,
      forcePatchOnly: fields['safety.forcePatchOnly'] === true,
      confirmApplyPatch: fields['safety.confirmApplyPatch'] === true,
      confirmRunCommand: fields['safety.confirmRunCommand'] === true,
      denyDangerousTools: fields['safety.denyDangerousTools'] === true,
      enableToolAuditLog: fields['safety.enableToolAuditLog'] === true
    };
  }

  private normalizeAgentId(value: string): string {
    const mapping: Record<string, string> = {
      PlannerAgent: 'planner_agent',
      CodebaseAgent: 'codebase_agent',
      DeveloperAgent: 'developer_agent',
      ReviewerAgent: 'reviewer_agent',
      TesterAgent: 'tester_agent',
      SummaryAgent: 'summary_agent'
    };
    return mapping[value] ?? value;
  }

  private agentNameFromId(agentId: string | undefined): string {
    if (!agentId) {
      return '';
    }
    const mapping: Record<string, string> = {
      planner_agent: 'PlannerAgent',
      codebase_agent: 'CodebaseAgent',
      developer_agent: 'DeveloperAgent',
      reviewer_agent: 'ReviewerAgent',
      tester_agent: 'TesterAgent',
      summary_agent: 'SummaryAgent'
    };
    return mapping[agentId] ?? agentId;
  }

  private createAgentSuccessResponse(
    message: WebviewMessage,
    responseMessage: string,
    agents: AgentConfig[],
    agent: AgentConfig | undefined
  ): WebviewResponse {
    return {
      ok: true,
      type: `${message.type}.result`,
      requestId: message.requestId,
      payload: {
        message: responseMessage,
        agents,
        agent
      }
    };
  }

  private createAgentErrorResponse(message: WebviewMessage, error: unknown): WebviewResponse {
    const code = error instanceof Error ? error.message : String(error);
    if (code === 'CANNOT_DELETE_LAST_AGENT') {
      return this.createErrorResponse(message, code, 'Cannot delete the last agent');
    }
    if (code === 'AGENT_NOT_FOUND') {
      return this.createErrorResponse(message, code, 'Agent not found');
    }
    return this.createErrorResponse(message, 'AGENT_ERROR', code);
  }

  private createTeamSuccessResponse(
    message: WebviewMessage,
    responseMessage: string,
    teams: TeamConfig[],
    team: TeamConfig | undefined
  ): WebviewResponse {
    return {
      ok: true,
      type: `${message.type}.result`,
      requestId: message.requestId,
      payload: {
        message: responseMessage,
        teams,
        team
      }
    };
  }

  private createWorkflowSuccessResponse(
    message: WebviewMessage,
    responseMessage: string,
    workflows: WorkflowConfig[],
    workflow: WorkflowConfig | undefined,
    warning?: string
  ): WebviewResponse {
    return {
      ok: true,
      type: `${message.type}.result`,
      requestId: message.requestId,
      payload: {
        message: responseMessage,
        workflows,
        workflow,
        warning
      }
    };
  }

  private createToolsSuccessResponse(
    message: WebviewMessage,
    responseMessage: string,
    toolsConfig: ToolsConfig
  ): WebviewResponse {
    return {
      ok: true,
      type: `${message.type}.result`,
      requestId: message.requestId,
      payload: {
        message: responseMessage,
        toolsConfig
      }
    };
  }

  private createTeamErrorResponse(message: WebviewMessage, error: unknown): WebviewResponse {
    const code = error instanceof Error ? error.message : String(error);
    if (code === 'CANNOT_DELETE_LAST_TEAM') {
      return this.createErrorResponse(message, code, 'Cannot delete the last team');
    }
    if (code === 'TEAM_NOT_FOUND') {
      return this.createErrorResponse(message, code, 'Team not found');
    }
    return this.createErrorResponse(message, 'TEAM_ERROR', code);
  }

  private createWorkflowErrorResponse(message: WebviewMessage, error: unknown): WebviewResponse {
    const code = error instanceof Error ? error.message : String(error);
    if (code === 'CANNOT_DELETE_LAST_WORKFLOW') {
      return this.createErrorResponse(message, code, 'Cannot delete the last workflow');
    }
    if (code === 'WORKFLOW_NOT_FOUND') {
      return this.createErrorResponse(message, code, 'Workflow not found');
    }
    return this.createErrorResponse(message, 'WORKFLOW_ERROR', code);
  }

  private createErrorResponse(message: WebviewMessage, code: string, errorMessage: string): WebviewResponse {
    return {
      ok: false,
      type: 'error',
      requestId: message.requestId,
      error: {
        code,
        message: errorMessage
      }
    };
  }

  private extractTask(response: unknown): { id?: string; status?: string } | undefined {
    if (!response || typeof response !== 'object') {
      return undefined;
    }
    const task = (response as { task?: unknown }).task;
    return task && typeof task === 'object' ? task as { id?: string; status?: string } : undefined;
  }

  private extractTaskId(response: unknown): string | undefined {
    if (!response || typeof response !== 'object') {
      return undefined;
    }
    const taskId = (response as { taskId?: unknown }).taskId;
    return typeof taskId === 'string' ? taskId : undefined;
  }

  private findAgent(agents: AgentConfig[], id: string): AgentConfig | undefined {
    return agents.find((agent) => agent.id === id);
  }

  private findTeam(teams: TeamConfig[], id: string): TeamConfig | undefined {
    return teams.find((team) => team.id === id);
  }

  private findWorkflow(workflows: WorkflowConfig[], id: string): WorkflowConfig | undefined {
    return workflows.find((workflow) => workflow.id === id);
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

  private isWebviewMessage(message: unknown): message is WebviewMessage {
    return typeof message === 'object'
      && message !== null
      && 'type' in message
      && typeof (message as { type?: unknown }).type === 'string';
  }
}
