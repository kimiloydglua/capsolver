// Wire types for the 4 endpoints in api-en.yaml, plus typed task/solution shapes.
// Every task/solution keeps an index signature so new CapSolver fields still pass through.

type Extra = { [key: string]: unknown };

export interface BaseResponse {
  errorId: 0 | 1;
  errorCode?: string;
  errorDescription?: string;
}

export type TaskStatus = "idle" | "processing" | "ready" | "failed";

export interface CreateTaskResponse<S = Solution> extends BaseResponse {
  taskId?: string;
  /** Present for synchronous tasks (recognition/classification). */
  status?: TaskStatus | null;
  solution?: S;
}

export interface GetTaskResultResponse<S = Solution> extends BaseResponse {
  status?: TaskStatus;
  solution?: S;
}

export interface BalancePackage extends Extra {
  packageId: string;
  type: number;
  numberOfCalls: number;
  status: number;
  token: string;
  activeTime: number;
  expireTime: number;
}

export interface GetBalanceResponse extends BaseResponse {
  /** Balance in USD. */
  balance: number;
  packages: BalancePackage[];
}

export interface FeedbackTaskRequest {
  solved: boolean;
  task: { type: string; websiteURL: string; websiteKey?: string } & Extra;
  result?: { errorId?: 0 | 1; taskId?: string } & Extra;
}

export interface FeedbackTaskResponse extends BaseResponse {
  message?: string;
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

/** Proxy string: "ip:port:user:pass", "http://user:pass@ip:port", "socks5://ip:port"... */
export type Proxy = string;

export interface ReCaptchaV2Task extends Extra {
  type:
    | "ReCaptchaV2Task"
    | "ReCaptchaV2TaskProxyLess"
    | "ReCaptchaV2EnterpriseTask"
    | "ReCaptchaV2EnterpriseTaskProxyLess";
  websiteURL: string;
  websiteKey: string;
  proxy?: Proxy;
  pageAction?: string;
  enterprisePayload?: { s?: string } & Extra;
  isInvisible?: boolean;
  isSession?: boolean;
  apiDomain?: string;
}

export interface ReCaptchaV3Task extends Extra {
  type:
    | "ReCaptchaV3Task"
    | "ReCaptchaV3TaskProxyLess"
    | "ReCaptchaV3EnterpriseTask"
    | "ReCaptchaV3EnterpriseTaskProxyLess";
  websiteURL: string;
  websiteKey: string;
  pageAction: string;
  proxy?: Proxy;
  enterprisePayload?: { s?: string } & Extra;
  isSession?: boolean;
  apiDomain?: string;
}

export interface TurnstileTask extends Extra {
  type: "AntiTurnstileTaskProxyLess";
  websiteURL: string;
  websiteKey: string;
  metadata?: { action?: string; cdata?: string };
}

export interface CloudflareChallengeTask extends Extra {
  type: "AntiCloudflareTask";
  websiteURL: string;
  proxy: Proxy;
  userAgent?: string;
  html?: string;
}

export interface AwsWafTask extends Extra {
  type: "AntiAwsWafTask" | "AntiAwsWafTaskProxyLess";
  websiteURL: string;
  proxy?: Proxy;
  awsKey?: string;
  awsIv?: string;
  awsContext?: string;
  awsChallengeJS?: string;
  awsApiJs?: string;
  awsProblemUrl?: string;
  awsApiKey?: string;
  awsExistingToken?: string;
}

export interface GeeTestTask extends Extra {
  type: "GeeTestTask" | "GeeTestTaskProxyLess";
  websiteURL: string;
  /** v3 */
  gt?: string;
  challenge?: string;
  /** v4 */
  captchaId?: string;
  geetestApiServerSubdomain?: string;
  proxy?: Proxy;
}

export interface DataDomeSliderTask extends Extra {
  type: "DatadomeSliderTask";
  websiteURL: string;
  captchaUrl: string;
  proxy: Proxy;
  userAgent: string;
}

export interface MtCaptchaTask extends Extra {
  type: "MtCaptchaTask" | "MtCaptchaTaskProxyLess";
  websiteURL: string;
  websiteKey: string;
  proxy?: Proxy;
}

/** Synchronous: solution comes back directly from createTask. */
export interface ImageToTextTask extends Extra {
  type: "ImageToTextTask";
  /** Base64 image, no data: prefix. */
  body: string;
  websiteURL?: string;
  module?: string;
  score?: number;
}

export interface ReCaptchaV2Classification extends Extra {
  type: "ReCaptchaV2Classification";
  image: string;
  question: string;
  websiteURL?: string;
  websiteKey?: string;
}

export interface AwsWafClassification extends Extra {
  type: "AwsWafClassification";
  images: string[];
  question: string;
  websiteURL?: string;
}

export interface VisionEngineTask extends Extra {
  type: "VisionEngine";
  module: string;
  image: string;
  imageBackground?: string;
  question?: string;
  websiteURL?: string;
}

/** Escape hatch for any task type not modelled above. */
export interface CustomTask extends Extra {
  type: string;
}

export type Task =
  | ReCaptchaV2Task
  | ReCaptchaV3Task
  | TurnstileTask
  | CloudflareChallengeTask
  | AwsWafTask
  | GeeTestTask
  | DataDomeSliderTask
  | MtCaptchaTask
  | ImageToTextTask
  | ReCaptchaV2Classification
  | AwsWafClassification
  | VisionEngineTask;

// ---------------------------------------------------------------------------
// Solutions
// ---------------------------------------------------------------------------

export interface ReCaptchaSolution extends Extra {
  gRecaptchaResponse: string;
  userAgent?: string;
  secChUa?: string;
  createTime?: number;
}

export interface TokenSolution extends Extra {
  token: string;
  userAgent?: string;
}

export interface CloudflareChallengeSolution extends Extra {
  cookies: Record<string, string>;
  token: string;
  userAgent: string;
}

export interface CookieSolution extends Extra {
  cookie: string;
  userAgent?: string;
}

export interface GeeTestSolution extends Extra {
  // v3
  challenge?: string;
  validate?: string;
  // v4
  captcha_id?: string;
  lot_number?: string;
  pass_token?: string;
  gen_time?: string;
  captcha_output?: string;
}

export interface TextSolution extends Extra {
  text: string;
}

export interface ClassificationSolution extends Extra {
  objects?: number[];
  hasObject?: boolean;
  box?: number[];
  distance?: number;
  type?: string;
}

export type Solution = Extra;

/** Maps a task type to the solution shape you get back. */
export type SolutionFor<T extends { type: string }> =
  T extends ReCaptchaV2Task | ReCaptchaV3Task ? ReCaptchaSolution
  : T extends TurnstileTask | MtCaptchaTask ? TokenSolution
  : T extends CloudflareChallengeTask ? CloudflareChallengeSolution
  : T extends AwsWafTask | DataDomeSliderTask ? CookieSolution
  : T extends GeeTestTask ? GeeTestSolution
  : T extends ImageToTextTask ? TextSolution
  : T extends ReCaptchaV2Classification | AwsWafClassification | VisionEngineTask ? ClassificationSolution
  : Solution;

export interface SolveResult<S> {
  taskId: string;
  solution: S;
  /** Wall time from createTask to ready, ms. */
  elapsedMs: number;
}
