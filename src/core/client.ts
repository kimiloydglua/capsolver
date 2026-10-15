import { config, requireApiKey } from "../config.js";
import { CapSolverError, CapSolverTimeoutError } from "./errors.js";
import type {
  BaseResponse,
  CreateTaskResponse,
  CustomTask,
  FeedbackTaskRequest,
  FeedbackTaskResponse,
  GetBalanceResponse,
  GetTaskResultResponse,
  SolutionFor,
  SolveResult,
  Task,
} from "./types.js";

export interface CapSolverClientOptions {
  apiKey?: string;
  appId?: string;
  apiUrl?: string;
  fallbackApiUrl?: string | null;
  pollIntervalMs?: number;
  timeoutMs?: number;
  /** Per-HTTP-request timeout. */
  requestTimeoutMs?: number;
  logger?: (msg: string) => void;
}

export interface SolveOptions {
  callbackUrl?: string;
  pollIntervalMs?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Extra attempts when CapSolver reports the solve itself failed (default 2). */
  retries?: number;
}

// Worth a fresh task: the worker failed, not our input.
const RETRYABLE_SOLVE_CODES = new Set(["ERROR_CAPTCHA_SOLVE_FAILED", "ERROR_CAPTCHA_UNSOLVABLE", "ERROR_SERVICE_UNAVALIABLE", "ERROR_SERVICE_UNAVAILABLE"]);

// The API keeps a task 5 min and allows at most 120 getTaskResult calls per task.
const MAX_POLLS = 120;

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(signal.reason ?? new Error("aborted"));
    }, { once: true });
  });

export class CapSolverClient {
  private readonly apiKey: string;
  private readonly appId?: string;
  private readonly hosts: string[];
  private readonly pollIntervalMs: number;
  private readonly timeoutMs: number;
  private readonly requestTimeoutMs: number;
  private readonly log: (msg: string) => void;

  constructor(opts: CapSolverClientOptions = {}) {
    this.apiKey = opts.apiKey ?? requireApiKey();
    this.appId = opts.appId ?? config.appId;
    const primary = (opts.apiUrl ?? config.apiUrl).replace(/\/+$/, "");
    const fallback = opts.fallbackApiUrl === undefined ? config.fallbackApiUrl : opts.fallbackApiUrl;
    this.hosts = fallback && fallback !== primary ? [primary, fallback.replace(/\/+$/, "")] : [primary];
    this.pollIntervalMs = opts.pollIntervalMs ?? config.pollIntervalMs;
    this.timeoutMs = opts.timeoutMs ?? config.timeoutMs;
    this.requestTimeoutMs = opts.requestTimeoutMs ?? 30_000;
    this.log = opts.logger ?? (() => {});
  }

  // -------------------------------------------------------------------------
  // Raw endpoints (1:1 with api-en.yaml)
  // -------------------------------------------------------------------------

  async createTask<T extends Task | CustomTask>(
    task: T,
    opts: { callbackUrl?: string } = {},
  ): Promise<CreateTaskResponse<SolutionFor<T>>> {
    return this.post("/createTask", {
      clientKey: this.apiKey,
      ...(this.appId ? { appId: this.appId } : {}),
      task,
      ...(opts.callbackUrl ? { callbackUrl: opts.callbackUrl } : {}),
    });
  }

  async getTaskResult<S = Record<string, unknown>>(taskId: string): Promise<GetTaskResultResponse<S>> {
    return this.post("/getTaskResult", { clientKey: this.apiKey, taskId }, taskId);
  }

  async getBalance(): Promise<GetBalanceResponse> {
    return this.post("/getBalance", { clientKey: this.apiKey });
  }

  async feedbackTask(req: FeedbackTaskRequest): Promise<FeedbackTaskResponse> {
    return this.post("/feedbackTask", { clientKey: this.apiKey, ...req });
  }

  // -------------------------------------------------------------------------
  // High level
  // -------------------------------------------------------------------------

  /** Create a task and wait for its solution (handles sync and async tasks). Retries failed solves. */
  async solve<T extends Task | CustomTask>(task: T, opts: SolveOptions = {}): Promise<SolveResult<SolutionFor<T>>> {
    const retries = opts.retries ?? 2;
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.solveOnce(task, opts);
      } catch (err) {
        const retryable = err instanceof CapSolverError && RETRYABLE_SOLVE_CODES.has(err.errorCode);
        if (!retryable || attempt >= retries) throw err;
        this.log(`${task.type} failed (${err.errorCode}), retry ${attempt + 1}/${retries}`);
      }
    }
  }

  private async solveOnce<T extends Task | CustomTask>(task: T, opts: SolveOptions): Promise<SolveResult<SolutionFor<T>>> {
    const started = Date.now();
    const created = await this.createTask(task, { callbackUrl: opts.callbackUrl });
    const taskId = created.taskId ?? "";

    if (created.status === "ready" && created.solution) {
      return { taskId, solution: created.solution, elapsedMs: Date.now() - started };
    }
    if (!taskId) {
      throw new CapSolverError("ERROR_NO_TASK_ID", "createTask returned neither a taskId nor a solution", "/createTask");
    }
    this.log(`task ${taskId} (${task.type}) created`);

    const interval = opts.pollIntervalMs ?? this.pollIntervalMs;
    const timeout = opts.timeoutMs ?? this.timeoutMs;
    const deadline = started + timeout;

    // First result rarely arrives before ~1s; wait one interval before the first poll.
    for (let polls = 0; polls < MAX_POLLS; polls++) {
      if (Date.now() + interval > deadline) break;
      await sleep(interval, opts.signal);
      const res = await this.getTaskResult<SolutionFor<T>>(taskId);
      if (res.status === "ready" && res.solution) {
        this.log(`task ${taskId} ready in ${Date.now() - started}ms`);
        return { taskId, solution: res.solution, elapsedMs: Date.now() - started };
      }
      if (res.status === "failed") {
        throw new CapSolverError(res.errorCode ?? "ERROR_TASK_FAILED", res.errorDescription ?? "Task failed", "/getTaskResult", taskId);
      }
    }
    throw new CapSolverTimeoutError(taskId, timeout);
  }

  /** Report whether a token worked; improves CapSolver token quality. */
  async reportResult(task: Task | CustomTask, taskId: string, solved: boolean): Promise<void> {
    const websiteURL = typeof task.websiteURL === "string" ? task.websiteURL : "";
    if (!websiteURL) return; // feedbackTask requires websiteURL
    await this.feedbackTask({
      solved,
      task: { ...task, type: task.type, websiteURL },
      result: { errorId: 0, taskId },
    });
  }

  // -------------------------------------------------------------------------
  // Transport
  // -------------------------------------------------------------------------

  private async post<R extends BaseResponse>(endpoint: string, body: unknown, taskId?: string): Promise<R> {
    let lastErr: unknown;
    for (const host of this.hosts) {
      let res: Response;
      try {
        res = await fetch(host + endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(this.requestTimeoutMs),
        });
      } catch (err) {
        // Network failure: try the next server.
        lastErr = err;
        this.log(`${host}${endpoint} unreachable (${(err as Error).message}), trying fallback`);
        continue;
      }

      if (res.status >= 500) {
        lastErr = new CapSolverError(`HTTP_${res.status}`, await res.text().catch(() => ""), endpoint, taskId);
        this.log(`${host}${endpoint} -> HTTP ${res.status}, trying fallback`);
        continue;
      }

      let data: R;
      try {
        data = (await res.json()) as R;
      } catch {
        throw new CapSolverError(`HTTP_${res.status}`, "Non-JSON response", endpoint, taskId);
      }
      if (data.errorId !== 0) {
        throw new CapSolverError(
          data.errorCode || `HTTP_${res.status}`,
          data.errorDescription || "Unknown error",
          endpoint,
          taskId,
        );
      }
      return data;
    }
    throw lastErr instanceof Error ? lastErr : new Error(`All CapSolver hosts failed for ${endpoint}`);
  }
}

let shared: CapSolverClient | undefined;

/** Lazily-created client configured from .env. */
export function getClient(): CapSolverClient {
  shared ??= new CapSolverClient({ logger: (m) => console.error(`[capsolver] ${m}`) });
  return shared;
}
