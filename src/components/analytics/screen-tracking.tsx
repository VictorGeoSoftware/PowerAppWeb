"use client";

import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { type ScreenName, screenForPath } from "@/lib/analytics/screens";
import { type AnalyticsTracker, getAnalyticsTracker } from "@/lib/analytics/tracker";

/** Sends one `screen_view` per change of `name`; `null` means no screen is visible. */
export function useTrackScreen(name: ScreenName | null, tracker: AnalyticsTracker = getAnalyticsTracker()) {
  // Survives StrictMode's double effect and re-renders, so each entry is sent once.
  const last = useRef<ScreenName | null>(null);
  useEffect(() => {
    if (name === last.current) return;
    last.current = name;
    if (name) tracker.trackScreen(name);
  }, [name, tracker]);
}

export function TrackScreen({ name }: { name: ScreenName }) {
  useTrackScreen(name);
  return null;
}

const OverrideContext = createContext<((name: ScreenName | null) => void) | null>(null);

/** Overlay screens (BmApp routes on top of the current one), e.g. the CUPS scanner. */
export function useScreenOverride(name: ScreenName | null) {
  const setOverride = useContext(OverrideContext);
  useEffect(() => {
    if (!setOverride || !name) return;
    setOverride(name);
    return () => setOverride(null);
  }, [setOverride, name]);
}

/** Reports the routed screen; render it only where the screen content is actually shown. */
export function RouteScreenTracking({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [override, setOverride] = useState<ScreenName | null>(null);
  useTrackScreen(override ?? screenForPath(pathname));
  return <OverrideContext.Provider value={setOverride}>{children}</OverrideContext.Provider>;
}
