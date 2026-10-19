"use client";

import { useFeeFirstGate } from "@/components/gate/fee-first-gate-provider";
import { Switch } from "@/components/ui/switch";
import { toProposalPrices } from "@/lib/comparator/proposal";
import { VISIBLE_PROPOSALS_HINT, VISIBLE_PROPOSALS_TITLE } from "@/lib/proposals/messages";
import { isProposalVisible } from "@/lib/proposals/visibility";
import { cn } from "@/lib/utils";

/** Port of BmApp `ProposalVisibilityConfigurationView`. */
export function ProposalVisibilityList() {
  const { session, proposalVisibility, setProposalVisibility } = useFeeFirstGate();
  const titles = session ? toProposalPrices(session.proposals).map((p) => p.proposalTitle) : [];

  return (
    <section className="flex flex-col gap-3 py-4">
      <h1 className="text-[22px] font-semibold">{VISIBLE_PROPOSALS_TITLE}</h1>
      <p className="text-sm text-muted-foreground">{VISIBLE_PROPOSALS_HINT}</p>
      <hr className="border-border" />
      <ul className="flex flex-col">
        {titles.map((title) => {
          const visible = isProposalVisible(proposalVisibility, title);
          return (
            <li key={title}>
              <label
                data-testid="proposal-visibility-row"
                className={cn("flex min-h-11 cursor-pointer items-center gap-3 py-1.5", !visible && "opacity-45")}
              >
                <Switch
                  checked={visible}
                  onCheckedChange={(checked) => setProposalVisibility(title, checked)}
                  aria-label={title}
                />
                <span className="flex-1 text-base font-medium break-words">{title}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
