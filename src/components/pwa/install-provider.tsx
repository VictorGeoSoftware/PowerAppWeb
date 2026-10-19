"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { INSTALL_HINT_DISMISSED_KEY } from "@/lib/pwa/messages";
import { isIos, isStandalone } from "@/lib/pwa/platform";
import { IosInstallSheet } from "./ios-install-sheet";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type InstallState = {
  /** Android/Chromium: a captured `beforeinstallprompt` can be shown. */
  canPrompt: boolean;
  promptInstall: () => Promise<void>;
  /** iOS, not installed: show the Add to Home Screen hint. */
  showIosHint: boolean;
  /** iOS banner not dismissed yet. */
  showIosBanner: boolean;
  dismissIosBanner: () => void;
  openIosSheet: () => void;
};

const noop = () => {};
const InstallContext = createContext<InstallState>({
  canPrompt: false,
  promptInstall: async () => {},
  showIosHint: false,
  showIosBanner: false,
  dismissIosBanner: noop,
  openIosSheet: noop,
});

export function useInstall() {
  return useContext(InstallContext);
}

export function InstallProvider({ children }: { children: React.ReactNode }) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    const standalone = isStandalone(navigator, window.matchMedia?.bind(window));
    setInstalled(standalone);
    setIos(isIos(navigator));
    try {
      setBannerDismissed(localStorage.getItem(INSTALL_HINT_DISMISSED_KEY) === "1");
    } catch {
      setBannerDismissed(false);
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    const event = deferred;
    if (!event) return;
    // The event can only be used once, whatever the choice.
    setDeferred(null);
    try {
      await event.prompt();
      await event.userChoice;
    } catch {
      // Ignored: the browser may reject a stale prompt.
    }
  }, [deferred]);

  const dismissIosBanner = useCallback(() => {
    setBannerDismissed(true);
    try {
      localStorage.setItem(INSTALL_HINT_DISMISSED_KEY, "1");
    } catch {
      // Storage unavailable: hidden for this session only.
    }
  }, []);

  const openIosSheet = useCallback(() => setSheetOpen(true), []);

  const showIosHint = ios && !installed;
  const value = useMemo<InstallState>(
    () => ({
      canPrompt: !installed && deferred != null,
      promptInstall,
      showIosHint,
      showIosBanner: showIosHint && !bannerDismissed,
      dismissIosBanner,
      openIosSheet,
    }),
    [installed, deferred, promptInstall, showIosHint, bannerDismissed, dismissIosBanner, openIosSheet],
  );

  return (
    <InstallContext.Provider value={value}>
      {children}
      {showIosHint && <IosInstallSheet open={sheetOpen} onOpenChange={setSheetOpen} />}
    </InstallContext.Provider>
  );
}
