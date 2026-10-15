/** Raised when the API answers with errorId !== 0 (or a non-2xx HTTP status). */
export class CapSolverError extends Error {
  constructor(
    public readonly errorCode: string,
    public readonly errorDescription: string,
    public readonly endpoint: string,
    public readonly taskId?: string,
  ) {
    super(`[${endpoint}] ${errorCode}: ${errorDescription}${taskId ? ` (task ${taskId})` : ""}`);
    this.name = "CapSolverError";
  }

  /** Errors where retrying the same request is pointless. */
  get isFatal(): boolean {
    return FATAL_CODES.has(this.errorCode);
  }
}

export class CapSolverTimeoutError extends Error {
  constructor(public readonly taskId: string, timeoutMs: number) {
    super(`Task ${taskId} not ready after ${timeoutMs}ms`);
    this.name = "CapSolverTimeoutError";
  }
}

const FATAL_CODES = new Set([
  "ERROR_KEY_DENIED_ACCESS",
  "ERROR_KEY_DOES_NOT_EXIST",
  "ERROR_INVALID_TASK_DATA",
  "ERROR_TASK_NOT_SUPPORTED",
  "ERROR_ZERO_BALANCE",
  "ERROR_KEY_TEMP_BLOCKED",
  "ERROR_IP_BANNED",
  "ERROR_TASKID_INVALID",
]);
