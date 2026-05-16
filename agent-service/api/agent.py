from fastapi import APIRouter

from adapters.autogen_adapter import AutoGenAdapter
from schemas.agent import AgentRunOnceRequest, AgentRunSequenceRequest, AgentRunWithToolsRequest


router = APIRouter(prefix="/api/agent", tags=["agent"])


@router.post("/run-once")
async def run_once(request: AgentRunOnceRequest) -> dict:
    result = await AutoGenAdapter().run_once(
        user_request=request.userRequest,
        system_prompt=request.systemPrompt,
    )
    if result.get("ok") is True:
        return {
            "ok": True,
            "result": result,
        }

    return {
        "ok": False,
        "error": result.get("error", {
            "code": "AUTOGEN_RUN_FAILED",
            "message": "AutoGen run failed.",
        }),
    }


@router.post("/run-with-tools")
async def run_with_tools(request: AgentRunWithToolsRequest) -> dict:
    result = await AutoGenAdapter().run_with_tools(
        user_request=request.userRequest,
        system_prompt=request.systemPrompt,
    )
    if result.get("ok") is True:
        return {
            "ok": True,
            "result": result,
        }

    return {
        "ok": False,
        "error": result.get("error", {
            "code": "AUTOGEN_TOOL_RUN_FAILED",
            "message": "AutoGen tool run failed.",
        }),
    }


@router.post("/run-sequence")
async def run_sequence(request: AgentRunSequenceRequest) -> dict:
    result = await AutoGenAdapter().run_sequence(user_request=request.userRequest)
    if result.get("ok") is True:
        return {
            "ok": True,
            "result": result,
        }

    return {
        "ok": False,
        "error": result.get("error", {
            "code": "AUTOGEN_SEQUENCE_FAILED",
            "message": "AutoGen sequence failed.",
        }),
        "result": {
            "mode": result.get("mode", "sequence"),
            "model": result.get("model"),
            "results": result.get("results", []),
        },
    }
