(function () {
  let vscode;
  let sequence = 1;

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
      if (key === 'settings.apiKey') {
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

  function bindLanguageToggle() {
    document.querySelectorAll('[data-i18n-toggle]').forEach(function (button) {
      button.addEventListener('click', function () {
        try {
          if (window.AutoGenI18n) {
            window.AutoGenI18n.toggleLanguage();
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
      bindLanguageToggle();
      window.switchTab = switchTab;
      window.collectFields = collectFields;
      setWebviewStatus(translate('status.bridgeInitialized'), 'ok');
      appendLog('Webview bridge initialized', 'ok');

      if (!vscode) {
        appendLog('VS Code API unavailable', 'error');
      }
    } catch (error) {
      reportError(error);
    }
  }

  window.AutoGenWebviewApp = {
    initialize,
    handleExtensionMessage
  };
})();
