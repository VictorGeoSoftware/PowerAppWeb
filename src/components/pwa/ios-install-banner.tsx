"use client";

import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IOS_BANNER_CLOSE, IOS_BANNER_HOW, IOS_BANNER_TEXT } from "@/lib/pwa/messages";
import { useInstall } from "./install-provider";

/** Bottom banner in the signed-in shell, iOS only, until dismissed. */
export function IosInstallBanner() {
  const { showIosBanner, openIosSheet, dismissIosBanner } = useInstall();
  if (!showIosBanner) return null;
  return (
    <>
      {/* Spacer so the banner never covers the content's last action. */}
      <div aria-hidden className="h-20" />
      <div
        role="region"
        aria-label={IOS_BANNER_TEXT}
        className="fixed inset-x-0 bottom-0 z-30 border-t bg-card pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] shadow-lg"
      >
        <div className="mx-auto flex min-h-16 w-full max-w-[640px] items-center gap-2 px-4 py-2">
          <p className="flex-1 text-sm font-medium text-card-foreground">{IOS_BANNER_TEXT}</p>
          <Button type="button" className="h-11 px-4 font-bold" onClick={() => openIosSheet()}>
            {IOS_BANNER_HOW}
          </Button>
          <Button type="button" variant="ghost" size="icon" className="size-11" aria-label={IOS_BANNER_CLOSE} onClick={dismissIosBanner}>
            <XIcon />
          </Button>
        </div>
      </div>
    </>
  );
}
