/**
 * BmApp `BmAppRouteAnalytics.kt` names, written out rather than derived from paths:
 * they must survive refactors, since renaming one silently breaks historical reports.
 */
export type ScreenName =
  | "auth_login"
  | "fetch_consumption"
  | "cups_scanner"
  | "current_conditions"
  | "proposals"
  | "configuration";

export const SCREEN_BY_PATH: Readonly<Record<string, ScreenName>> = {
  "/fetch-consumption": "fetch_consumption",
  "/current-conditions": "current_conditions",
  "/proposals": "proposals",
  "/configuration": "configuration",
};

export const screenForPath = (pathname: string): ScreenName | null => SCREEN_BY_PATH[pathname] ?? null;
