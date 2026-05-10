import importlib.util
from pathlib import Path

def test_agent_service_main_exists():
    assert Path('agent-service/main.py').exists()

def test_runtime_modules_exist():
    for rel in ['agent-service/runtime/workflow_runner.py','agent-service/runtime/task_manager.py','agent-service/adapters/base.py']:
        assert Path(rel).exists()
