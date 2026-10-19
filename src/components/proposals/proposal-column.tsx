import { Cell, HeaderBox, ROW_H, SectionBox, ValueList } from "@/components/proposals/table-cells";
import {
  deltaLabel,
  deltaTone,
  isValidFixedAmountInput,
  middleEllipsize,
  sixDecimals,
  twoDecimals,
} from "@/lib/comparator/format";
import type { ProposalPrice } from "@/lib/comparator/proposal";
import { FIXED_AMOUNT_PLACEHOLDER, fixedAmountLabel } from "@/lib/proposals/messages";
import { cn } from "@/lib/utils";

type Props = {
  proposal: ProposalPrice;
  powerRowCount: number;
  energyRowCount: number;
  delta: number | undefined;
  savingsPercent: number | undefined;
  fixedAmount: string;
  onFixedAmountChange: (value: string) => void;
};

const TONE_CLASS = {
  negative: "text-delta-negative",
  positive: "text-delta-positive",
  neutral: "text-table-text",
} as const;

/** Port of BmApp `PriceProposalColumn` + `ExtraServicesAndTaxesRow`. */
export function ProposalColumn(p: Props) {
  const { proposal } = p;
  const tone = deltaTone(p.delta);
  return (
    <div className="flex w-[168px] shrink-0 flex-col gap-3" data-testid="proposal-column">
      <HeaderBox className="bg-header-background text-xs text-foreground" title={proposal.proposalTitle}>
        {middleEllipsize(proposal.proposalTitle)}
      </HeaderBox>
      <ValueList values={proposal.powerTermItems.map(sixDecimals)} rows={p.powerRowCount} />
      <SectionBox>{`${twoDecimals(proposal.annualPowerTermCost)}€`}</SectionBox>
      <ValueList values={proposal.consumedEnergyItems.map(sixDecimals)} rows={p.energyRowCount} />
      <SectionBox>{`${twoDecimals(proposal.annualEnergyCost)}€`}</SectionBox>
      <div className="divide-y divide-table-border border border-table-border">
        <div className={cn("flex items-center px-2", ROW_H.fixedAmount)}>
          <input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            aria-label={fixedAmountLabel(proposal.proposalTitle)}
            placeholder={FIXED_AMOUNT_PLACEHOLDER}
            value={p.fixedAmount}
            onChange={(e) => {
              if (isValidFixedAmountInput(e.target.value)) p.onFixedAmountChange(e.target.value);
            }}
            className="h-10 w-full min-w-0 rounded-md border border-table-border bg-card px-2 text-center text-base font-bold text-table-text outline-none placeholder:font-normal placeholder:text-table-text-secondary focus-visible:ring-2 focus-visible:ring-ring/50"
          />
        </div>
        <Cell>{twoDecimals(proposal.electricalTax)}</Cell>
        <Cell>{twoDecimals(proposal.iva)}</Cell>
      </div>
      <HeaderBox className="text-base" data-testid="total">
        {`${twoDecimals(proposal.totalAnnualPrice)}€`}
      </HeaderBox>
      <div
        data-testid="delta"
        data-tone={tone}
        className={cn(
          "flex items-center justify-center rounded-lg border border-section-border bg-section-highlight px-2 text-sm font-semibold",
          ROW_H.delta,
          TONE_CLASS[tone],
        )}
      >
        {deltaLabel(p.delta, p.savingsPercent)}
      </div>
    </div>
  );
}
