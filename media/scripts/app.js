(function () {
  let vscode;
  let sequence = 1;
  let agents = [];
  let selectedAgentId = '';
  let teams = [];
  let selectedTeamId = '';
  let workflows = [];
  let selectedWorkflowId = '';
  let toolsConfig;

  function getElement(id) {
    return document.getElementById(id);
  }

  function translate(key) {
    return window.AutoGenI18n ? window.AutoGenI18n.t(key) : key;
  }

  function setWebviewStatus(message, className) {
    const status = getElement('webview-status');
    if (!status) {
      return;
    }

    status.className = className ? 'webview-status ' + className : 'webview-status';
    status.textContent = message;
  }

  function getLogElement() {
    const activePanelLog = document.querySelector('.panel.active [data-event-log]');
    return activePanelLog || getElement('event-log') || getElement('log');
  }

  function appendLog(message, className) {
    const log = getLogElement();
    if (!log) {
      return;
    }

    const line = document.createElement('div');
    line.className = className ? 'log-line ' + className : 'log-line';
    line.textContent = message;
    log.prepend(line);
  }

  function reportError(error) {
    const message = error instanceof Error ? error.message : String(error);
    setWebviewStatus('Webview bridge error: ' + message, 'error');
    appendLog('Webview bridge error: ' + message, 'error');
  }

  function acquireVsCodeApiSafely() {
    try {
      if (typeof acquireVsCodeApi === 'function') {
        return acquireVsCodeApi();
      }
    } catch (error) {
      reportError(error);
    }
    return undefined;
  }

  function collectFields() {
    const fields = {};
    document.querySelectorAll('[data-field]').forEach(function (field) {
      const name = field.dataset.field;
      if (!name) {
        return;
      }

      if (field.type === 'checkbox') {
        fields[name] = field.checked;
        return;
      }

      if ('value' in field) {
        fields[name] = field.value;
      }
    });
    return fields;
  }

  function setStatus(message, className) {
    const status = getElement('status');
    if (!status) {
      return;
    }

    status.className = className ? 'inline-status ' + className : 'inline-status';
    status.textContent = message;
  }

  function setApiKeyStatus(apiKeySaved) {
    const status = getElement('api-key-status');
    if (!status) {
      return;
    }

    status.textContent = apiKeySaved ? 'API Key saved in SecretStorage' : '';
  }

  function switchTab(tabName) {
    document.querySelectorAll('[data-tab]').forEach(function (tab) {
      tab.classList.toggle('active', tab.dataset.tab === tabName);
    });

    document.querySelectorAll('[data-panel]').forEach(function (panel) {
      panel.classList.toggle('active', panel.dataset.panel === tabName);
    });
  }

  function createActionMessage(action) {
    return {
      type: action,
      payload: {
        fields: collectFields()
      },
      requestId: 'action_' + Date.now() + '_' + sequence++,
      timestamp: Date.now()
    };
  }

  function redactForLog(value) {
    if (Array.isArray(value)) {
      return value.map(redactForLog);
    }

    if (!value || typeof value !== 'object') {
      return value;
    }

    const clone = {};
    Object.keys(value).forEach(function (key) {
      if (key === 'settings.apiKey' || key === 'apiKey') {
        clone[key] = '***';
        return;
      }

      clone[key] = redactForLog(value[key]);
    });
    return clone;
  }

  function sendAction(action) {
    const message = createActionMessage(action);
    appendLog('\u2192 sent: ' + action, 'ok');
    appendLog(JSON.stringify(redactForLog(message.payload.fields), null, 2), '');
    setStatus('Sent ' + action + ', waiting for Extension response', '');

    if (!vscode) {
      appendLog('VS Code API unavailable; message not posted', 'error');
      return;
    }

    vscode.postMessage(message);
  }

  function applyFields(fields) {
    if (!fields || typeof fields !== 'object') {
      return;
    }

    Object.keys(fields).forEach(function (name) {
      if (name === 'settings.apiKey' || name === 'apiKey') {
        return;
      }

      const field = document.querySelector('[data-field="' + name + '"]');
      if (!field) {
        return;
      }

      const value = fields[name];
      if (field.type === 'checkbox') {
        field.checked = Boolean(value);
        return;
      }

      if ('value' in field) {
        field.value = value === undefined || value === null ? '' : String(value);
      }
    });
  }

  function flattenAgent(agent) {
    if (!agent || typeof agent !== 'object') {
      return {};
    }

    return {
      'agent.id': agent.id || '',
      'agent.name': agent.name || '',
      'agent.role': agent.role || 'custom',
      'agent.description': agent.description || '',
      'agent.model': agent.model || 'gemini-3-flash-preview',
      'agent.temperature': agent.temperature ?? 0.2,
      'agent.maxTurns': agent.maxTurns ?? 8,
      'agent.maxToolCalls': agent.maxToolCalls ?? 20,
      'agent.timeoutSeconds': agent.timeoutSeconds ?? 120,
      'agent.responseFormat': agent.responseFormat || 'json',
      'agent.stopCondition': agent.stopCondition || 'TERMINATE',
      'agent.systemPrompt': agent.systemPrompt || '',
      'agent.outputJsonSchema': agent.outputJsonSchema || '',
      'agent.tools.list_files': Boolean(agent.tools && agent.tools.list_files),
      'agent.tools.read_file': Boolean(agent.tools && agent.tools.read_file),
      'agent.tools.search_code': Boolean(agent.tools && agent.tools.search_code),
      'agent.tools.propose_patch': Boolean(agent.tools && agent.tools.propose_patch),
      'agent.tools.run_command': Boolean(agent.tools && agent.tools.run_command),
      'agent.tools.git_diff': Boolean(agent.tools && agent.tools.git_diff),
      'agent.context.currentFile': Boolean(agent.context && agent.context.currentFile),
      'agent.context.selection': Boolean(agent.context && agent.context.selection),
      'agent.context.gitDiff': Boolean(agent.context && agent.context.gitDiff),
      'agent.context.terminalError': Boolean(agent.context && agent.context.terminalError),
      'agent.context.projectSummary': Boolean(agent.context && agent.context.projectSummary),
      'agent.context.ragResults': Boolean(agent.context && agent.context.ragResults)
    };
  }

  function renderAgentList(nextAgents) {
    const list = getElement('agent-list');
    if (!list) {
      return;
    }

    list.innerHTML = '';
    nextAgents.forEach(function (agent) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'entity-card entity-button' + (agent.enabled === false ? ' muted-card' : '');
      card.dataset.agentId = agent.id;
      if (agent.id === selectedAgentId) {
        card.classList.add('active');
      }

      const name = document.createElement('strong');
      name.textContent = agent.name || agent.id;
      const description = document.createElement('p');
      description.textContent = agent.description || '';
      const model = document.createElement('span');
      model.className = 'pill';
      model.textContent = agent.model || 'gemini-3-flash-preview';
      const status = document.createElement('span');
      status.className = agent.enabled === false ? 'pill' : 'pill green';
      status.textContent = agent.enabled === false ? translate('common.disabled') : translate('common.enabled');

      card.append(name, description, model, status);
      list.appendChild(card);
    });
  }

  function selectAgent(agentId) {
    const agent = agents.find(function (item) {
      return item.id === agentId;
    });
    if (!agent) {
      return;
    }

    selectedAgentId = agent.id;
    applyFields(flattenAgent(agent));
    renderAgentList(agents);
    appendLog('selected agent: ' + agent.name, 'ok');
  }

  function handleAgentsResult(payload) {
    const nextAgents = Array.isArray(payload.agents) ? payload.agents : [];
    agents = nextAgents;

    if (payload.agent && payload.agent.id) {
      selectedAgentId = payload.agent.id;
    } else if (!selectedAgentId || !agents.some(function (agent) { return agent.id === selectedAgentId; })) {
      const developer = agents.find(function (agent) { return agent.id === 'developer_agent'; });
      selectedAgentId = developer ? developer.id : (agents[0] && agents[0].id) || '';
    }

    renderAgentList(agents);
    if (selectedAgentId) {
      selectAgent(selectedAgentId);
    }
  }

  function flattenTeam(team) {
    if (!team || typeof team !== 'object') {
      return {};
    }

    return {
      'team.id': team.id || '',
      'team.name': team.name || '',
      'team.mode': team.mode || 'sequential',
      'team.maxTurns': team.maxTurns ?? 20,
      'team.retryLimit': team.retryLimit ?? 2,
      'team.termination': team.termination || 'workflow_end',
      'team.executionPolicy': team.executionPolicy || 'sequential',
      'team.modelOverride': team.modelOverride || 'none'
    };
  }

  function renderTeamList(nextTeams) {
    const list = getElement('team-list');
    if (!list) {
      return;
    }

    list.innerHTML = '';
    nextTeams.forEach(function (team) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'entity-card entity-button' + (team.enabled === false ? ' muted-card' : '');
      card.dataset.teamId = team.id;
      if (team.id === selectedTeamId) {
        card.classList.add('active');
      }

      const name = document.createElement('strong');
      name.textContent = team.name || team.id;
      const description = document.createElement('p');
      description.textContent = (team.mode || 'sequential')
        + ' | maxTurns: ' + (team.maxTurns ?? 20)
        + ' | agents: ' + (Array.isArray(team.agents) ? team.agents.length : 0);
      const defaultPill = document.createElement('span');
      defaultPill.className = team.default ? 'pill green' : 'pill';
      defaultPill.textContent = team.default ? 'default' : 'custom';
      const policy = document.createElement('span');
      policy.className = 'pill';
      policy.textContent = team.executionPolicy || 'sequential';

      card.append(name, description, defaultPill, policy);
      list.appendChild(card);
    });
  }

  function renderTeamAgents(team) {
    const list = document.querySelector('[data-panel="team"] .ordered-list');
    if (!list || !team || !Array.isArray(team.agents)) {
      return;
    }

    list.innerHTML = '';
    team.agents.forEach(function (agent, index) {
      const row = document.createElement('div');
      row.className = 'ordered-row';
      const order = document.createElement('span');
      order.textContent = String(agent.order || index + 1);
      const name = document.createElement('strong');
      name.textContent = agent.name || agent.agentId;
      const role = document.createElement('p');
      role.textContent = agent.role || 'custom';
      const status = document.createElement('em');
      status.textContent = agent.enabled === false ? translate('common.disabled') : translate('common.enabled');
      row.append(order, name, role, status);
      list.appendChild(row);
    });
  }

  function selectTeam(teamId) {
    const team = teams.find(function (item) {
      return item.id === teamId;
    });
    if (!team) {
      return;
    }

    selectedTeamId = team.id;
    applyFields(flattenTeam(team));
    renderTeamList(teams);
    renderTeamAgents(team);
    appendLog('selected team: ' + team.name, 'ok');
  }

  function handleTeamsResult(payload) {
    teams = Array.isArray(payload.teams) ? payload.teams : [];

    if (payload.team && payload.team.id) {
      selectedTeamId = payload.team.id;
    } else if (!selectedTeamId || !teams.some(function (team) { return team.id === selectedTeamId; })) {
      const defaultTeam = teams.find(function (team) { return team.default === true; });
      selectedTeamId = defaultTeam ? defaultTeam.id : (teams[0] && teams[0].id) || '';
    }

    renderTeamList(teams);
    if (selectedTeamId) {
      selectTeam(selectedTeamId);
    }
  }

  function flattenWorkflow(workflow) {
    if (!workflow || typeof workflow !== 'object') {
      return {};
    }

    return {
      'workflow.id': workflow.id || '',
      'workflow.name': workflow.name || '',
      'workflow.description': workflow.description || '',
      'workflow.type': workflow.type || 'custom',
      'workflow.failureStrategy': workflow.failureStrategy || 'stop',
      'workflow.retryLimit': workflow.retryLimit ?? 2,
      'workflow.nodeTimeoutSeconds': workflow.nodeTimeoutSeconds ?? 180,
      'workflow.confirmPolicy': workflow.confirmPolicy || 'confirm_plan_and_patch',
      'workflow.jsonVersion': workflow.jsonVersion ?? 1,
      'workflow.jsonPreview': workflow.jsonPreview || createWorkflowJsonPreview(workflow)
    };
  }

  function createWorkflowJsonPreview(workflow) {
    return JSON.stringify({
      id: workflow.id,
      name: workflow.name,
      version: workflow.jsonVersion || 1,
      nodes: Array.isArray(workflow.nodes) ? workflow.nodes : []
    }, null, 2);
  }

  function renderWorkflowList(nextWorkflows) {
    const list = getElement('workflow-list');
    if (!list) {
      return;
    }

    list.innerHTML = '';
    nextWorkflows.forEach(function (workflow) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'entity-card entity-button' + (workflow.enabled === false ? ' muted-card' : '');
      card.dataset.workflowId = workflow.id;
      if (workflow.id === selectedWorkflowId) {
        card.classList.add('active');
      }

      const name = document.createElement('strong');
      name.textContent = workflow.name || workflow.id;
      const description = document.createElement('p');
      description.textContent = (workflow.type || 'custom')
        + ' | ' + (workflow.confirmPolicy || 'confirm_plan_and_patch')
        + ' | nodes: ' + (Array.isArray(workflow.nodes) ? workflow.nodes.length : 0);
      const defaultPill = document.createElement('span');
      defaultPill.className = workflow.default ? 'pill green' : 'pill';
      defaultPill.textContent = workflow.default ? 'default' : 'custom';
      const strategy = document.createElement('span');
      strategy.className = 'pill';
      strategy.textContent = workflow.failureStrategy || 'stop';

      card.append(name, description, defaultPill, strategy);
      list.appendChild(card);
    });
  }

  function renderWorkflowNodes(workflow) {
    const list = getElement('workflow-node-list');
    if (!list || !workflow || !Array.isArray(workflow.nodes)) {
      return;
    }

    list.innerHTML = '';
    workflow.nodes.forEach(function (node, index) {
      const row = document.createElement('div');
      row.className = 'ordered-row';
      const order = document.createElement('span');
      order.textContent = String(index + 1);
      const name = document.createElement('strong');
      name.textContent = node.name || node.id;
      const status = document.createElement('em');
      status.textContent = node.enabled === false ? translate('common.disabled') : translate('common.enabled');
      const flow = document.createElement('p');
      flow.textContent = (node.type || 'agent')
        + ' | input: ' + (Array.isArray(node.inputFields) ? node.inputFields.join(' / ') : '')
        + ' | output: ' + (Array.isArray(node.outputFields) ? node.outputFields.join(' / ') : '');
      const button = document.createElement('button');
      button.className = 'btn';
      button.type = 'button';
      button.dataset.action = 'workflow.node.select';
      button.textContent = 'Select';
      button.addEventListener('click', function () {
        sendAction('workflow.node.select');
      });
      row.append(order, name, status, flow, button);
      list.appendChild(row);
    });
  }

  function selectWorkflow(workflowId) {
    const workflow = workflows.find(function (item) {
      return item.id === workflowId;
    });
    if (!workflow) {
      return;
    }

    selectedWorkflowId = workflow.id;
    applyFields(flattenWorkflow(workflow));
    renderWorkflowList(workflows);
    renderWorkflowNodes(workflow);
    appendLog('selected workflow: ' + workflow.name, 'ok');
  }

  function handleWorkflowsResult(payload) {
    workflows = Array.isArray(payload.workflows) ? payload.workflows : [];
    if (payload.warning) {
      appendLog('warning: ' + payload.warning, 'error');
    }

    if (payload.workflow && payload.workflow.id) {
      selectedWorkflowId = payload.workflow.id;
    } else if (!selectedWorkflowId || !workflows.some(function (workflow) { return workflow.id === selectedWorkflowId; })) {
      const defaultWorkflow = workflows.find(function (workflow) { return workflow.default === true; });
      selectedWorkflowId = defaultWorkflow ? defaultWorkflow.id : (workflows[0] && workflows[0].id) || '';
    }

    renderWorkflowList(workflows);
    if (selectedWorkflowId) {
      selectWorkflow(selectedWorkflowId);
    }
  }

  function applyToolsConfig(config) {
    if (!config || typeof config !== 'object') {
      return;
    }

    toolsConfig = config;
    const fields = {};

    if (config.permissions && typeof config.permissions === 'object') {
      Object.keys(config.permissions).forEach(function (agent) {
        const tools = config.permissions[agent] || {};
        Object.keys(tools).forEach(function (toolName) {
          fields['toolPermission.' + agent + '.' + toolName] = tools[toolName];
        });
      });
    }

    fields['tool.commandAllowlist'] = Array.isArray(config.commandAllowlist)
      ? config.commandAllowlist.join('\n')
      : '';
    fields['tool.commandBlocklist'] = Array.isArray(config.commandBlocklist)
      ? config.commandBlocklist.join('\n')
      : '';
    fields['tool.sensitiveFileBlocklist'] = Array.isArray(config.sensitiveFileBlocklist)
      ? config.sensitiveFileBlocklist.join('\n')
      : '';

    const safety = config.globalSafety || {};
    fields['safety.denyOutsideWorkspace'] = safety.denyOutsideWorkspace === true;
    fields['safety.forcePatchOnly'] = safety.forcePatchOnly === true;
    fields['safety.confirmApplyPatch'] = safety.confirmApplyPatch === true;
    fields['safety.confirmRunCommand'] = safety.confirmRunCommand === true;
    fields['safety.denyDangerousTools'] = safety.denyDangerousTools === true;
    fields['safety.enableToolAuditLog'] = safety.enableToolAuditLog === true;

    const registry = Array.isArray(config.registry) ? config.registry : [];
    const selectedTool = registry.find(function (tool) {
      return tool.name === 'read_file';
    }) || registry[0];
    if (selectedTool) {
      fields['tool.name'] = selectedTool.name || '';
      fields['tool.description'] = selectedTool.description || '';
      fields['tool.schema'] = selectedTool.schema || '';
      fields['tool.returnPreview'] = selectedTool.returnPreview || '';
    }

    applyFields(fields);
  }

  function handleToolsResult(payload) {
    if (payload && payload.toolsConfig) {
      applyToolsConfig(payload.toolsConfig);
    }
  }

  function bindTabs() {
    document.querySelectorAll('[data-tab]').forEach(function (tab) {
      tab.addEventListener('click', function () {
        try {
          const tabName = tab.dataset.tab;
          if (!tabName) {
            return;
          }

          switchTab(tabName);
        } catch (error) {
          reportError(error);
        }
      });
    });
    switchTab('run');
  }

  function bindActions() {
    document.querySelectorAll('[data-action]').forEach(function (button) {
      button.addEventListener('click', function () {
        try {
          const action = button.dataset.action;
          if (!action) {
            return;
          }

          sendAction(action);
        } catch (error) {
          reportError(error);
        }
      });
    });
  }

  function bindAgentList() {
    const list = getElement('agent-list');
    if (!list) {
      return;
    }

    list.addEventListener('click', function (event) {
      try {
        const card = event.target.closest('[data-agent-id]');
        if (!card) {
          return;
        }
        selectAgent(card.dataset.agentId);
      } catch (error) {
        reportError(error);
      }
    });
  }

  function bindTeamList() {
    const list = getElement('team-list');
    if (!list) {
      return;
    }

    list.addEventListener('click', function (event) {
      try {
        const card = event.target.closest('[data-team-id]');
        if (!card) {
          return;
        }
        selectTeam(card.dataset.teamId);
      } catch (error) {
        reportError(error);
      }
    });
  }

  function bindWorkflowList() {
    const list = getElement('workflow-list');
    if (!list) {
      return;
    }

    list.addEventListener('click', function (event) {
      try {
        const card = event.target.closest('[data-workflow-id]');
        if (!card) {
          return;
        }
        selectWorkflow(card.dataset.workflowId);
      } catch (error) {
        reportError(error);
      }
    });
  }

  function bindLanguageToggle() {
    document.querySelectorAll('[data-i18n-toggle]').forEach(function (button) {
      button.addEventListener('click', function () {
        try {
          if (window.AutoGenI18n) {
            window.AutoGenI18n.toggleLanguage();
            renderAgentList(agents);
            renderTeamList(teams);
            renderWorkflowList(workflows);
            if (selectedTeamId) {
              renderTeamAgents(teams.find(function (team) { return team.id === selectedTeamId; }));
            }
            if (selectedWorkflowId) {
              renderWorkflowNodes(workflows.find(function (workflow) { return workflow.id === selectedWorkflowId; }));
            }
          }
        } catch (error) {
          reportError(error);
        }
      });
    });
  }

  function handleExtensionMessage(event) {
    try {
      const message = event.data || {};
      const responseType = message.type || 'unknown';
      const isOk = message.ok === true;
      setWebviewStatus(translate('status.extensionMessageReceived'), isOk ? 'ok' : 'error');
      appendLog('\u2190 response: ' + responseType, isOk ? 'ok' : 'error');
      appendLog(JSON.stringify(redactForLog(message), null, 2), isOk ? '' : 'error');

      if (isOk) {
        if (responseType === 'settings.load.result') {
          const payload = message.payload || {};
          applyFields(payload.settings);
          setApiKeyStatus(payload.apiKeySaved === true);
        }

        if (responseType === 'settings.save.result') {
          const payload = message.payload || {};
          setApiKeyStatus(payload.apiKeySaved === true);
        }

        if (responseType === 'agents.load.result'
          || responseType === 'agent.save.result'
          || responseType === 'agent.create.result'
          || responseType === 'agent.copy.result'
          || responseType === 'agent.disable.result'
          || responseType === 'agent.delete.result'
          || responseType === 'agent.reset.result') {
          handleAgentsResult(message.payload || {});
        }

        if (responseType === 'teams.load.result'
          || responseType === 'team.save.result'
          || responseType === 'team.create.result'
          || responseType === 'team.copy.result'
          || responseType === 'team.delete.result'
          || responseType === 'team.setDefault.result'
          || responseType === 'team.restoreDefault.result') {
          handleTeamsResult(message.payload || {});
        }

        if (responseType === 'workflows.load.result'
          || responseType === 'workflow.save.result'
          || responseType === 'workflow.saveAsTemplate.result'
          || responseType === 'workflow.setDefault.result') {
          handleWorkflowsResult(message.payload || {});
        }

        if (responseType === 'tools.load.result'
          || responseType === 'tool.permission.save.result'
          || responseType === 'tool.schema.save.result'
          || responseType === 'tool.allowlist.save.result'
          || responseType === 'tool.blocklist.save.result'
          || responseType === 'tool.sensitiveFiles.save.result'
          || responseType === 'tool.globalSafety.save.result') {
          handleToolsResult(message.payload || {});
        }

        const text = message.payload && message.payload.message
          ? message.payload.message
          : 'Received placeholder response';
        setStatus(text, 'ok');
        return;
      }

      if (message.error && message.error.message) {
        setStatus(message.error.message, 'error');
      }
    } catch (error) {
      reportError(error);
    }
  }

  function initialize() {
    try {
      vscode = acquireVsCodeApiSafely();
      if (window.AutoGenI18n) {
        window.AutoGenI18n.initialize(vscode, reportError);
      }

      bindTabs();
      bindActions();
      bindAgentList();
      bindTeamList();
      bindWorkflowList();
      bindLanguageToggle();
      window.switchTab = switchTab;
      window.collectFields = collectFields;
      window.applyFields = applyFields;
      setWebviewStatus(translate('status.bridgeInitialized'), 'ok');
      appendLog('Webview bridge initialized', 'ok');

      if (!vscode) {
        appendLog('VS Code API unavailable', 'error');
        return;
      }

      sendAction('settings.load');
      sendAction('agents.load');
      sendAction('teams.load');
      sendAction('workflows.load');
      sendAction('tools.load');
    } catch (error) {
      reportError(error);
    }
  }

  window.AutoGenWebviewApp = {
    initialize,
    handleExtensionMessage
  };
})();
