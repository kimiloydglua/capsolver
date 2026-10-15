// Convenience solvers: one function per captcha family.
// Each picks the ProxyLess variant automatically when no proxy is given.
import { getClient, type CapSolverClient, type SolveOptions } from "../core/client.js";
import type {
  AwsWafClassification,
  AwsWafTask,
  CloudflareChallengeTask,
  DataDomeSliderTask,
  GeeTestTask,
  ImageToTextTask,
  MtCaptchaTask,
  ReCaptchaV2Classification,
  ReCaptchaV2Task,
  ReCaptchaV3Task,
  TurnstileTask,
  VisionEngineTask,
} from "../core/types.js";

type Common = { client?: CapSolverClient } & SolveOptions;
// Key remapping (not Omit) so known keys survive the index signature on task types.
type Without<T> = { [K in keyof T as K extends "type" ? never : K]: T[K] };

/** Separate client + solve options from the task fields so none of them leak into the task body. */
function split<P extends Common>(p: P) {
  const { client, callbackUrl, pollIntervalMs, timeoutMs, signal, retries, ...task } = p;
  return {
    client: client ?? getClient(),
    opts: { callbackUrl, pollIntervalMs, timeoutMs, signal, retries } satisfies SolveOptions,
    task: task as unknown as { [K in keyof P as K extends keyof Common ? never : K]: P[K] },
  };
}
const stripImg = (b64: string) => b64.replace(/^data:image\/\w+;base64,/, "");

export function recaptchaV2(
  p: Without<ReCaptchaV2Task> & { enterprise?: boolean } & Common,
) {
  const { client, opts, task: { enterprise, ...task } } = split(p);
  const base = enterprise ? "ReCaptchaV2EnterpriseTask" : "ReCaptchaV2Task";
  const type = (task.proxy ? base : `${base}ProxyLess`) as ReCaptchaV2Task["type"];
  return client.solve({ type, ...task }, opts);
}

export function recaptchaV3(
  p: Without<ReCaptchaV3Task> & { enterprise?: boolean } & Common,
) {
  const { client, opts, task: { enterprise, ...task } } = split(p);
  const base = enterprise ? "ReCaptchaV3EnterpriseTask" : "ReCaptchaV3Task";
  const type = (task.proxy ? base : `${base}ProxyLess`) as ReCaptchaV3Task["type"];
  return client.solve({ type, ...task }, opts);
}

export function turnstile(p: Without<TurnstileTask> & Common) {
  const { client, opts, task } = split(p);
  return client.solve({ type: "AntiTurnstileTaskProxyLess", ...task }, opts);
}

/** Cloudflare 5s / managed challenge page. Proxy is mandatory; reuse the same proxy + UA afterwards. */
export function cloudflareChallenge(p: Without<CloudflareChallengeTask> & Common) {
  const { client, opts, task } = split(p);
  return client.solve({ type: "AntiCloudflareTask", ...task }, opts);
}

export function awsWaf(p: Without<AwsWafTask> & Common) {
  const { client, opts, task } = split(p);
  const type = task.proxy ? "AntiAwsWafTask" : "AntiAwsWafTaskProxyLess";
  return client.solve({ type, ...task }, opts);
}

export function geetest(p: Without<GeeTestTask> & Common) {
  const { client, opts, task } = split(p);
  const type = task.proxy ? "GeeTestTask" : "GeeTestTaskProxyLess";
  return client.solve({ type, ...task }, opts);
}

export function datadomeSlider(p: Without<DataDomeSliderTask> & Common) {
  const { client, opts, task } = split(p);
  return client.solve({ type: "DatadomeSliderTask", ...task }, opts);
}

export function mtcaptcha(p: Without<MtCaptchaTask> & Common) {
  const { client, opts, task } = split(p);
  const type = task.proxy ? "MtCaptchaTask" : "MtCaptchaTaskProxyLess";
  return client.solve({ type, ...task }, opts);
}

export function imageToText(p: Without<ImageToTextTask> & Common) {
  const { client, opts, task } = split(p);
  return client.solve(
    { type: "ImageToTextTask", ...task, body: stripImg(task.body) },
    opts,
  );
}

export function recaptchaV2Classify(p: Without<ReCaptchaV2Classification> & Common) {
  const { client, opts, task } = split(p);
  return client.solve(
    { type: "ReCaptchaV2Classification", ...task, image: stripImg(task.image) },
    opts,
  );
}

export function awsWafClassify(p: Without<AwsWafClassification> & Common) {
  const { client, opts, task } = split(p);
  return client.solve(
    { type: "AwsWafClassification", ...task, images: task.images.map(stripImg) },
    opts,
  );
}

export function visionEngine(p: Without<VisionEngineTask> & Common) {
  const { client, opts, task } = split(p);
  return client.solve(
    {
      type: "VisionEngine",
      ...task,
      image: stripImg(task.image),
      ...(task.imageBackground ? { imageBackground: stripImg(task.imageBackground) } : {}),
    },
    opts,
  );
}
