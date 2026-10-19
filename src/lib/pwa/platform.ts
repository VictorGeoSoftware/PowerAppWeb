type NavLike = Pick<Navigator, "userAgent" | "maxTouchPoints"> & { platform?: string; standalone?: boolean };
type MatchMedia = (query: string) => { matches: boolean };

/** iPhone/iPod/iPad, including iPadOS reporting as a Mac with touch. Any iOS browser counts. */
export function isIos(nav: NavLike): boolean {
  if (/iPad|iPhone|iPod/.test(nav.userAgent)) return true;
  return /Macintosh/.test(nav.userAgent) && (nav.maxTouchPoints ?? 0) > 1;
}

/** Launched from the home screen (iOS `navigator.standalone` or display-mode). */
export function isStandalone(nav: NavLike, matchMedia?: MatchMedia): boolean {
  if (nav.standalone === true) return true;
  return matchMedia?.("(display-mode: standalone)").matches ?? false;
}
