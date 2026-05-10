(function () {
  const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : undefined;
  let sequence = 1;

  function getElement(id) {
    return document.getElementById(id);
  }

  function getTaskInputValue() {
    const input = getElement('taskInput');
    return input && 'value' in input ? input.value : '';
  }

  function appendLog(message, className) {
    const log = getElement('log');
    if (!log) {
      return;
    }

    const line = document.createElement('div');
    line.className = className ? 'log-line ' + className : 'log-line';
    line.textContent = message;
    log.prepend(line);
  }

  function setStatus(message, className) {
    const status = getElement('status');
    if (!status) {
      return;
    }

    status.className = className ? 'inline-status ' + className : 'inline-status';
    status.textContent = message;
  }

  function switchTab(tabName) {
    document.querySelectorAll('[data-tab]').forEach(function (tab) {
      tab.classList.toggle('active', tab.dataset.tab === tabName);
    });

    document.querySelectorAll('[data-panel]').forEach(function (panel) {
      panel.classList.toggle('active', panel.dataset.panel === tabName);
    });
  }

  function createTaskMessage() {
    return {
      type: 'task.create',
      payload: {
        userRequest: getTaskInputValue()
      },
      requestId: 'task_' + Date.now() + '_' + sequence++,
      timestamp: Date.now()
    };
  }

  function sendTask() {
    const message = createTaskMessage();
    if (vscode) {
      vscode.postMessage(message);
    }

    appendLog('sent: ' + JSON.stringify(message), 'ok');
    setStatus('Sent task.create, waiting for Extension response', '');
  }

  function bindTabs() {
    document.querySelectorAll('[data-tab]').forEach(function (tab) {
      tab.addEventListener('click', function () {
        switchTab(tab.dataset.tab);
      });
    });
    switchTab('run');
  }

  function bindActions() {
    document.querySelectorAll('[data-action="task.create"]').forEach(function (button) {
      button.addEventListener('click', sendTask);
    });
  }

  window.switchTab = switchTab;

  window.addEventListener('message', function (event) {
    const message = event.data || {};
    const isOk = message.ok === true;
    appendLog('received: ' + JSON.stringify(message, null, 2), isOk ? 'ok' : 'error');

    if (message.type === 'task.create.result' && isOk) {
      const text = message.payload && message.payload.message
        ? message.payload.message
        : 'Received placeholder response';
      setStatus(text, 'ok');
      return;
    }

    if (message.error && message.error.message) {
      setStatus(message.error.message, 'error');
    }
  });

  document.addEventListener('DOMContentLoaded', function () {
    bindTabs();
    bindActions();
  });
})();
