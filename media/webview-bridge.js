(function () {
  const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;
  let seq = 1;
  const state = { currentTaskId: null, currentPatchId: null };
  function send(type, payload) { const msg = { type, requestId: 'wv_' + (seq++), payload: payload || collectPayload(), timestamp: Date.now() }; vscode ? vscode.postMessage(msg) : console.log('[mock postMessage]', msg); }
  function collectPayload() { const ta = Array.from(document.querySelectorAll('textarea')); const inputs = Array.from(document.querySelectorAll('input')); const selects = Array.from(document.querySelectorAll('select')); return { taskId: state.currentTaskId, patchId: state.currentPatchId, userRequest: ta[0] ? ta[0].value : '', inputs: Object.fromEntries(inputs.map((i, n) => [i.name || i.id || 'input'+n, i.value])), selects: Object.fromEntries(selects.map((s, n) => [s.name || s.id || 'select'+n, s.value])) }; }
  function bind(text, type) { Array.from(document.querySelectorAll('button')).filter(b => (b.textContent || '').trim() === text).forEach(b => b.addEventListener('click', () => send(type))); }
  function append(evt) { const host = document.querySelector('[data-agent-log]') || document.querySelector('main') || document.body; const d = document.createElement('div'); d.style.cssText = 'margin:8px 0;padding:10px;border:1px solid rgba(255,255,255,.12);border-radius:12px;background:rgba(255,255,255,.04);font-size:12px;white-space:pre-wrap;'; d.textContent = '[' + (evt.type || 'event') + '] ' + JSON.stringify(evt.payload || evt, null, 2); host.prepend(d); }
  window.addEventListener('message', e => { const m = e.data || {}; if (m.type === 'task.created') state.currentTaskId = m.payload && m.payload.taskId; if (m.type === 'patch.proposed') state.currentPatchId = m.payload && m.payload.patchId; append(m); });
  document.addEventListener('DOMContentLoaded', () => {
    [['发送给 AutoGen Team','task.create'],['继续','task.resume'],['暂停','task.pause'],['终止','task.cancel'],['重跑当前 Agent','task.rerunCurrentAgent'],['切换 Agent','task.switchAgent'],['接受计划','plan.approve'],['调整计划','plan.revise'],['查看 Diff','patch.openDiff'],['应用 Patch','patch.apply'],['拒绝并说明','patch.reject'],['部分应用','patch.applyPartial'],['让 AI 解释','patch.explain'],['保存 Agent','agent.save'],['测试 Agent','agent.test'],['保存 Team','team.save'],['保存权限','tool.permissions.save'],['保存 Workflow','workflow.save'],['保存设置','settings.save'],['启动','runtime.start'],['停止','runtime.stop'],['重启','runtime.restart'],['健康检查','runtime.health'],['测试连接','settings.model.test']].forEach(x => bind(x[0], x[1]));
  });
})();
