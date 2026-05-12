export interface ToolCallRequest {
  tool: string;
  args?: Record<string, unknown>;
}

export interface ToolCallResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

export class ToolError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'ToolError';
  }
}

export function createToolErrorResponse(error: unknown): ToolCallResponse {
  if (error instanceof ToolError) {
    return {
      ok: false,
      error: {
        code: error.code,
        message: error.message
      }
    };
  }

  return {
    ok: false,
    error: {
      code: 'TOOL_CALL_FAILED',
      message: error instanceof Error ? error.message : String(error)
    }
  };
}
