import { Cell, HeaderBox, ROW_H, SectionBox, ValueList } from "@/components/proposals/table-cells";
import type { CustomerConditionsColumn as Column } from "@/lib/comparator/calculate";
import { kotlinDoubleToString } from "@/lib/comparator/format";
import { CURRENT_TARIFF } from "@/lib/proposals/messages";

type Props = { column: Column; powerRowCount: number; energyRowCount: number };

/** Port of BmApp `CustomerConditionsColumnView`. */
export function CustomerConditionsColumn({ column, powerRowCount, energyRowCount }: Props) {
  return (
    <div className="flex w-[168px] shrink-0 flex-col gap-3" data-testid="customer-column">
      <HeaderBox>{CURRENT_TARIFF}</HeaderBox>
      <ValueList values={column.powerTermItems.map(kotlinDoubleToString)} rows={powerRowCount} />
      <SectionBox>{`${column.annualPowerTermCost}€`}</SectionBox>
      <ValueList values={column.consumedEnergyItems.map(kotlinDoubleToString)} rows={energyRowCount} />
      <SectionBox>{`${column.annualEnergyCost}€`}</SectionBox>
      <div className="divide-y divide-table-border border border-table-border">
        <Cell className={ROW_H.fixedAmount}>{column.extraServices}</Cell>
        <Cell>{column.electricTax}</Cell>
        <Cell>{column.iva}</Cell>
      </div>
      <HeaderBox className="text-base" data-testid="total">
        {`${column.totalAnnualPrice}€`}
      </HeaderBox>
    </div>
  );
}
