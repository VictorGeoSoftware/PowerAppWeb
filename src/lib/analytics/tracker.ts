import { getFirebaseApp } from "@/lib/firebase/client";
import type { ScreenName } from "./screens";
import { isAnalyticsAllowed, isAnalyticsDebug, readAnalyticsEnv } from "./policy";

/**
 * Privacy contract (BmApp `AnalyticsEvent`): events and params describe what the
 * Broker did, never who or for whom. No user id, email, CUPS, customer names,
 * amounts, free text or query strings. Params are primitives only.
 */
export type AnalyticsParams = Record<string, string | number | boolean>;

export type AnalyticsTracker = {
  trackScreen: (name: ScreenName) => void;
  track: (name: string, params?: AnalyticsParams) => void;
};

export const noOpTracker: AnalyticsTracker = { trackScreen: () => {}, track: () => {} };

const MAX_NAME_LENGTH = 40;
const MAX_PARAM_COUNT = 25;
const MAX_VALUE_LENGTH = 100;

/** BmApp `sanitizeName`: [A-Za-z0-9_], starts with a letter, length-capped. */
export function sanitizeName(name: string, maxLength = MAX_NAME_LENGTH): string {
  const cleaned = name.replace(/[^\p{L}\p{N}_]/gu, "_");
  return (/^\p{L}/u.test(cleaned) ? cleaned : `e_${cleaned}`).slice(0, maxLength);
}

/** Unsupported types are dropped, never stringified (that is how PII leaks). */
export function sanitizeParams(params: Record<string, unknown>): AnalyticsParams {
  const out: AnalyticsParams = {};
  for (const [key, value] of Object.entries(params).slice(0, MAX_PARAM_COUNT)) {
    const name = sanitizeName(key);
    if (typeof value === "string") out[name] = value.slice(0, MAX_VALUE_LENGTH);
    else if (typeof value === "number" && Number.isFinite(value)) out[name] = value;
    else if (typeof value === "boolean") out[name] = value ? 1 : 0;
  }
  return out;
}

/** The subset of `firebase/analytics` used here, so tests can inject a fake. */
export type AnalyticsSdk = {
  isSupported: () => Promise<boolean>;
  initializeAnalytics: (app: never, options: { config: Record<string, unknown> }) => unknown;
  logEvent: (analytics: never, name: string, params?: Record<string, unknown>) => void;
};

type Options = {
  loadSdk: () => Promise<AnalyticsSdk>;
  getApp: () => unknown;
  debug: boolean;
};

/** Firebase-backed tracker: initializes lazily once, queueing calls made before init. */
export function createFirebaseTracker({ loadSdk, getApp, debug }: Options): AnalyticsTracker {
  type Call = [string, AnalyticsParams];
  let queue: Call[] | null = [];
  let send: ((call: Call) => void) | null = null;

  const ready = (async () => {
    const sdk = await loadSdk();
    if (!(await sdk.isSupported())) return null;
    const analytics = sdk.initializeAnalytics(getApp() as never, { config: { send_page_view: false } });
    return (call: Call) => sdk.logEvent(analytics as never, call[0], call[1]);
  })().catch(() => null);

  void ready.then((sender) => {
    const pending = queue ?? [];
    queue = null;
    if (!sender) return;
    send = sender;
    pending.forEach(sender);
  });

  const enqueue = (name: string, params: AnalyticsParams) => {
    const call: Call = [name, debug ? { ...params, debug_mode: true } : params];
    if (send) send(call);
    else queue?.push(call);
  };

  return {
    trackScreen: (name) => {
      const screen = sanitizeName(name, MAX_VALUE_LENGTH);
      enqueue("screen_view", { firebase_screen: screen, firebase_screen_class: screen });
    },
    track: (name, params = {}) => enqueue(sanitizeName(name), sanitizeParams(params)),
  };
}

let instance: AnalyticsTracker | null = null;

/** No-op unless collection is allowed (BmApp `NoOpAnalyticsTracker`); `firebase/analytics` is never loaded then. */
export function getAnalyticsTracker(): AnalyticsTracker {
  if (instance) return instance;
  const env = readAnalyticsEnv();
  if (typeof window === "undefined" || !isAnalyticsAllowed(env)) return noOpTracker;
  instance = createFirebaseTracker({
    loadSdk: () => import("firebase/analytics") as unknown as Promise<AnalyticsSdk>,
    getApp: getFirebaseApp,
    debug: isAnalyticsDebug(env),
  });
  return instance;
}
