"use client";

import { BellIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PUSH_CARD_ACTION, PUSH_CARD_CLOSE, PUSH_CARD_TEXT } from "@/lib/pwa/messages";
import { usePush } from "./push-provider";

/** One-time dismissible card on /fetch-consumption. */
export function PushPromptCard() {
  const { showCard, enable, enabling, dismissCard } = usePush();
  if (!showCard) return null;
  return (
    <div role="region" aria-label={PUSH_CARD_TEXT} className="flex items-center gap-2 rounded-xl border bg-card p-3">
      <BellIcon className="size-5 shrink-0 text-primary" aria-hidden />
      <p className="flex-1 text-sm font-medium text-card-foreground">{PUSH_CARD_TEXT}</p>
      <Button type="button" className="h-11 px-4 font-bold" disabled={enabling} onClick={() => void enable()}>
        {PUSH_CARD_ACTION}
      </Button>
      <Button type="button" variant="ghost" size="icon" className="size-11" aria-label={PUSH_CARD_CLOSE} onClick={dismissCard}>
        <XIcon />
      </Button>
    </div>
  );
}
