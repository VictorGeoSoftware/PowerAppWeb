"use client";

import { BellIcon, BellOffIcon } from "lucide-react";
import { PUSH_BLOCKED_ENTRY, PUSH_BLOCKED_HINT, PUSH_ENTRY, PUSH_IOS_INSTALL_LINE } from "@/lib/pwa/messages";
import { cn } from "@/lib/utils";
import { useInstall } from "./install-provider";
import { usePush } from "./push-provider";

type Props = { className: string; onClose: () => void };

/** Hamburger menu row: enable push, the iOS install hint, or the blocked state. */
export function PushMenuEntry({ className, onClose }: Props) {
  const { support, permission, canEnable, enable, enabling } = usePush();
  const { openIosSheet } = useInstall();

  if (support === "needs-install") {
    return (
      <button
        type="button"
        className={cn(className, "hover:bg-muted")}
        onClick={() => {
          onClose();
          openIosSheet(PUSH_IOS_INSTALL_LINE);
        }}
      >
        <BellIcon className="size-4" aria-hidden />
        {PUSH_ENTRY}
      </button>
    );
  }
  if (support !== "available") return null;
  if (permission === "denied") {
    return (
      <span aria-disabled="true" className={cn(className, "h-auto min-h-12 py-2 text-muted-foreground")}>
        <BellOffIcon className="size-4 shrink-0" aria-hidden />
        <span className="flex flex-col">
          <span>{PUSH_BLOCKED_ENTRY}</span>
          <span className="text-xs font-normal">{PUSH_BLOCKED_HINT}</span>
        </span>
      </span>
    );
  }
  if (!canEnable) return null;
  return (
    <button
      type="button"
      disabled={enabling}
      className={cn(className, "hover:bg-muted")}
      onClick={() => {
        onClose();
        void enable();
      }}
    >
      <BellIcon className="size-4" aria-hidden />
      {PUSH_ENTRY}
    </button>
  );
}
