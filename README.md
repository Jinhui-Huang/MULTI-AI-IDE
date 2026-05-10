# AutoGen Code Agent VS Code Skeleton

开发用基础骨架，已按详细设计文档搭好四层结构：

1. VS Code Webview UI：`media/webview.html` + `media/webview-bridge.js`
2. VS Code Extension Host：`src/`
3. Python AutoGen Service：`agent-service/`
4. VS Code Tool Server：`src/tools/`

## 快速启动

```bash
npm install
npm run compile
```

VS Code 中按 F5 启动 Extension Development Host。

Python 服务开发模式：

```bash
cd agent-service
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
python main.py
```

## 当前状态

已完成骨架：

- WebviewViewProvider
- MessageDispatcher
- RuntimeManager
- ExtensionApiClient
- ConfigStore / SecretStore
- ToolServer / ToolRouter
- FastAPI Service
- TaskManager / WorkflowRunner / WsManager
- AutoGenAdapter 可替换边界
- 默认 Agent / Team / Workflow JSON

待开发：

- 真实 AutoGen `AssistantAgent` + tools + `run_stream()`
- 完整 WorkflowRunner 节点执行与失败回退
- 完整 Patch / Diff / Checkpoint / Rollback
- 权限矩阵、配置持久化、内置 Python Runtime 打包

## 文档

详细设计文档已放入 `docs/`。优先阅读：

1. `00_项目总览与MVP范围_详细设计.md`
2. `13_MVP开发顺序与验收清单_详细设计.md`
3. `14_给Codex执行开发的任务拆分清单_详细设计.md`
4. `01_VSCode插件前端Webview详细设计.md`
5. `02_Webview与Extension通信协议详细设计.md`
6. `03_Extension与AutoGenService通信接口详细设计.md`

自检结果见 `SELF_CHECK.md`。


## Enhanced skeleton

This version includes the full folder coverage from the detailed design documents. Most modules are safe placeholders/TODO implementations for Codex-driven incremental development. Run `python scripts/check_skeleton.py` to validate structure, JSON files and Python syntax.
