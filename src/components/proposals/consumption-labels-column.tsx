import { Cell, HeaderBox, ROW_H, SectionBox, ValueList } from "@/components/proposals/table-cells";
import { kotlinDoubleToString } from "@/lib/comparator/format";
import type { PeriodValue } from "@/lib/gate/fee-first";
import {
  ANNUAL_BILL_TOTAL,
  ANNUAL_CONSUMPTION,
  ANNUAL_COST,
  ANNUAL_ENERGY_COST,
  ANNUAL_POWER_COST,
  ELECTRIC_TAX,
  ENERGY_CONSUMED,
  EXTRA_SERVICES,
  IVA,
  POWER_TERM,
} from "@/lib/proposals/messages";

type Props = {
  tariffName: string;
  powerRows: PeriodValue[];
  energyRows: PeriodValue[];
  powerRowCount: number;
  energyRowCount: number;
  ivaLabel: string;
  electricTaxLabel: string;
};

/** BmApp `SideTitleTableView`: side title + periods in one box, values in another. */
function SideTitleTable({ title, rows, count }: { title: string; rows: [string, string][]; count: number }) {
  return (
    <div className="flex gap-2">
      <div className="flex flex-[2] border border-table-border">
        <div className="flex flex-1 items-center justify-center px-1 text-center text-[10px] leading-tight font-bold text-table-text">
          {title}
        </div>
        <div className="w-8 divide-y divide-table-border border-l border-table-border">
          {Array.from({ length: count }, (_, i) => (
            <Cell key={i}>{rows[i]?.[0] ?? ""}</Cell>
          ))}
        </div>
      </div>
      <div className="flex-[1.4]">
        <ValueList values={rows.map((r) => r[1])} rows={count} />
      </div>
    </div>
  );
}

/** Port of BmApp `UserConsumptionDataView` (narrowed for phones; see DESIGN.md). */
export function ConsumptionLabelsColumn(p: Props) {
  return (
    <div className="flex w-44 flex-col gap-3">
      <div className="flex gap-2">
        <HeaderBox className="flex-1 text-xs">{p.tariffName}</HeaderBox>
        <HeaderBox className="flex-1 text-xs">{ANNUAL_CONSUMPTION}</HeaderBox>
      </div>
      <SideTitleTable
        title={POWER_TERM}
        count={p.powerRowCount}
        rows={p.powerRows.map((r) => [r.period, kotlinDoubleToString(r.value)])}
      />
      <SectionBox>{ANNUAL_POWER_COST}</SectionBox>
      <SideTitleTable
        title={ENERGY_CONSUMED}
        count={p.energyRowCount}
        rows={p.energyRows.map((r) => [r.period, String(r.value)])}
      />
      <SectionBox>{ANNUAL_ENERGY_COST}</SectionBox>
      <div className="divide-y divide-table-border border border-table-border">
        <LabelValue className={ROW_H.fixedAmount} label={EXTRA_SERVICES} value={ANNUAL_COST} />
        <LabelValue label={ELECTRIC_TAX} value={p.electricTaxLabel} />
        <LabelValue label={IVA} value={p.ivaLabel} />
      </div>
      <HeaderBox className="text-xs">{ANNUAL_BILL_TOTAL}</HeaderBox>
    </div>
  );
}

function LabelValue({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex">
      <Cell className={`flex-[2] ${className ?? ""}`}>{label}</Cell>
      <Cell className={`flex-[1.4] border-l border-table-border ${className ?? ""}`}>{value}</Cell>
    </div>
  );
}
