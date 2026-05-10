from pathlib import Path
import json, py_compile, sys
ROOT = Path(__file__).resolve().parents[1]
required = [
 'package.json','tsconfig.json','src/extension.ts','media/webview.html','media/webview-bridge.js',
 'src/types/messages.ts','src/types/task.ts','src/types/agent.ts','src/types/team.ts','src/types/workflow.ts','src/types/tool.ts','src/types/settings.ts',
 'src/utils/logger.ts','src/utils/pathGuard.ts','src/runtime/WebSocketClient.ts','src/runtime/TaskClient.ts','src/runtime/ConfigClient.ts',
 'src/tools/FileTools.ts','src/tools/SearchTools.ts','src/tools/DiffTools.ts','src/tools/PatchTools.ts','src/tools/TerminalTools.ts','src/tools/GitTools.ts','src/tools/ApprovalManager.ts','src/tools/WorkspaceGuard.ts',
 'agent-service/main.py','agent-service/api/tasks.py','agent-service/api/agents.py','agent-service/schemas/task.py','agent-service/runtime/agent_factory.py','agent-service/runtime/model_client_factory.py','agent-service/runtime/tool_factory.py','agent-service/runtime/approval_manager.py','agent-service/runtime/output_parser.py','agent-service/tools/tool_gateway.py','agent-service/tools/permission_guard.py','agent-service/storage/config_store.py','agent-service/storage/task_store.py','agent-service/storage/event_store.py',
 'config/tools/permissions.json','config/settings/runtime_settings.example.json','SKELETON_MANIFEST.md'
]
missing = [p for p in required if not (ROOT/p).exists()]
if missing:
    print('Missing files:')
    print('\n'.join(missing))
    sys.exit(1)
for path in ROOT.rglob('*.json'):
    json.loads(path.read_text(encoding='utf-8'))
for path in (ROOT/'agent-service').rglob('*.py'):
    py_compile.compile(str(path), doraise=True)
print(f'OK: required={len(required)}, json=valid, python=compiled')
