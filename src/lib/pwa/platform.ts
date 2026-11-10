type NavLike = Pick<Navigator, "userAgent" | "maxTouchPoints"> & { platform?: string; standalone?: boolean };
type MatchMedia = (query: string) => { matches: boolean };

/** iPhone/iPod/iPad, including iPadOS reporting as a Mac with touch. Any iOS browser counts. */
export function isIos(nav: NavLike): boolean {
  if (/iPad|iPhone|iPod/.test(nav.userAgent)) return true;
  return /Macintosh/.test(nav.userAgent) && (nav.maxTouchPoints ?? 0) > 1;
}

/** Platform policy, not screen size or touch alone: Windows touch laptops are still desktop. */
export function isMobileDevice(nav: Pick<Navigator, "userAgent" | "maxTouchPoints">): boolean {
  return isIos(nav) || /Android/i.test(nav.userAgent);
}

/** Launched from the home screen (iOS `navigator.standalone` or display-mode). */
export function isStandalone(nav: NavLike, matchMedia?: MatchMedia): boolean {
  if (nav.standalone === true) return true;
  return matchMedia?.("(display-mode: standalone)").matches ?? false;
}
