(function () {
  const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : undefined;
  let sequence = 1;

  function getElement(id) {
    return document.getElementById(id);
  }

  function appendLog(message, className) {
    const log = getElement('log');
    if (!log) {
      return;
    }
    const line = document.createElement('div');
    if (className) {
      line.className = className;
    }
    line.textContent = message;
    log.prepend(line);
  }

  function setStatus(message, className) {
    const status = getElement('status');
    if (!status) {
      return;
    }
    status.className = className || '';
    status.textContent = message;
  }

  function createTaskMessage() {
    const input = getElement('taskInput');
    return {
      type: 'task.create',
      payload: {
        userRequest: input && 'value' in input ? input.value : ''
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
    setStatus('已发送 task.create，等待 Extension 响应', '');
  }

  window.addEventListener('message', function (event) {
    const message = event.data || {};
    const isOk = message.ok === true;
    appendLog('received: ' + JSON.stringify(message, null, 2), isOk ? 'ok' : 'error');
    if (message.type === 'task.create.result' && isOk) {
      setStatus(message.payload && message.payload.message ? message.payload.message : '收到占位响应', 'ok');
      return;
    }
    if (message.error && message.error.message) {
      setStatus(message.error.message, 'error');
    }
  });

  document.addEventListener('DOMContentLoaded', function () {
    const button = getElement('sendTaskButton');
    if (button) {
      button.addEventListener('click', sendTask);
    }
  });
})();
