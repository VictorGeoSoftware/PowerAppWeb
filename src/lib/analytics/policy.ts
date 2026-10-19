export type AnalyticsEnv = {
  enabled?: string;
  measurementId?: string;
  debug?: string;
};

/** Build-time flags; each process.env access must be literal so Next.js can inline it. */
export function readAnalyticsEnv(): AnalyticsEnv {
  return {
    enabled: process.env.NEXT_PUBLIC_ANALYTICS_ENABLED,
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
    debug: process.env.NEXT_PUBLIC_ANALYTICS_DEBUG,
  };
}

/** BmApp `AnalyticsCollectionPolicy`: only the production deployment opts in, exactly with "true". */
export function isAnalyticsAllowed(env: AnalyticsEnv): boolean {
  return env.enabled === "true" && Boolean(env.measurementId?.trim());
}

export const isAnalyticsDebug = (env: AnalyticsEnv) => env.debug === "true";
