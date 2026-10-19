import { CircleCheck } from "lucide-react";
import { bestOptionMessage, bestOptionTitle } from "@/lib/proposals/messages";

/** BmApp `BestProposalCard`. */
export function BestProposalCard({ title, saving }: { title: string; saving: string }) {
  return (
    <div
      data-testid="best-option"
      className="flex items-center gap-2.5 rounded-[10px] bg-best-option p-3 text-best-option-foreground"
    >
      <CircleCheck aria-hidden className="size-5 shrink-0" />
      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-bold">{bestOptionTitle(title)}</p>
        <p className="text-xs">{bestOptionMessage(saving)}</p>
      </div>
    </div>
  );
}
