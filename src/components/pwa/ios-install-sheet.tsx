"use client";

import { ShareIcon, SquarePlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { IOS_SHEET_OK, IOS_SHEET_TITLE, IOS_STEP_ADD, IOS_STEP_CONFIRM, IOS_STEP_SHARE } from "@/lib/pwa/messages";

type Props = { open: boolean; onOpenChange: (open: boolean) => void; note?: string };

const STEPS = [
  { text: IOS_STEP_SHARE, Icon: ShareIcon },
  { text: IOS_STEP_ADD, Icon: SquarePlusIcon },
  { text: IOS_STEP_CONFIRM, Icon: null },
] as const;

export function IosInstallSheet({ open, onOpenChange, note }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="max-h-[90dvh] gap-0 rounded-t-2xl pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
      >
        <SheetTitle className="px-4 pb-2 text-lg">{IOS_SHEET_TITLE}</SheetTitle>
        {note && <p className="px-4 pb-2 text-sm text-muted-foreground">{note}</p>}
        <ol className="flex flex-col">
          {STEPS.map(({ text, Icon }, i) => (
            <li key={text} className="flex min-h-12 items-center gap-3 px-4 text-base text-foreground">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                {i + 1}
              </span>
              <span className="flex-1">{text}</span>
              {Icon && <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden />}
            </li>
          ))}
        </ol>
        <div className="px-4 pt-3">
          <Button type="button" className="h-12 w-full text-base font-bold" onClick={() => onOpenChange(false)}>
            {IOS_SHEET_OK}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
