"use client";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import type { ProposalPrice } from "@/lib/comparator/proposal";
import {
  CANCEL,
  COPY_BUTTON,
  COPY_SHEET_HELPER,
  COPY_SHEET_LIST_LABEL,
  COPY_SHEET_SUBTITLE,
  COPY_SHEET_TITLE,
} from "@/lib/conditions/messages";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  proposals: ProposalPrice[];
  selectedTitle: string | null;
  onSelect: (title: string) => void;
  onDismiss: () => void;
  onConfirm: () => void;
};

/** Port of BmApp `CopyProposalPricesSheet` (opens fully expanded, actions always visible). */
export function CopyProposalPricesSheet({ open, proposals, selectedTitle, onSelect, onDismiss, onConfirm }: Props) {
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onDismiss()}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="max-h-[90dvh] gap-0 rounded-t-2xl pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
      >
        <SheetTitle className="px-4 text-lg">{COPY_SHEET_TITLE}</SheetTitle>
        <SheetDescription className="px-4 py-1">{COPY_SHEET_SUBTITLE}</SheetDescription>
        <p id="copy-sheet-list-label" className="px-4 py-2 text-sm font-medium text-foreground">
          {COPY_SHEET_LIST_LABEL}
        </p>
        <div role="radiogroup" aria-labelledby="copy-sheet-list-label" className="max-h-80 overflow-y-auto">
          {proposals.map((p) => {
            const checked = p.proposalTitle === selectedTitle;
            return (
              <button
                key={p.proposalTitle}
                type="button"
                role="radio"
                aria-checked={checked}
                onClick={() => onSelect(p.proposalTitle)}
                className="flex min-h-14 w-full items-center justify-between gap-3 px-4 text-left text-base text-foreground hover:bg-muted"
              >
                <span>{p.proposalTitle}</span>
                <span
                  aria-hidden
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full border-2",
                    checked ? "border-primary" : "border-muted-foreground",
                  )}
                >
                  {checked && <span className="size-2.5 rounded-full bg-primary" />}
                </span>
              </button>
            );
          })}
        </div>
        <p className="px-4 py-2 text-xs text-muted-foreground">{COPY_SHEET_HELPER}</p>
        <div className="flex flex-col gap-2 px-4 py-2">
          <Button type="button" variant="ghost" className="h-12 w-full text-base" onClick={onDismiss}>
            {CANCEL}
          </Button>
          <Button
            type="button"
            className="h-12 w-full text-base font-bold"
            disabled={selectedTitle == null}
            onClick={onConfirm}
          >
            {COPY_BUTTON}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
