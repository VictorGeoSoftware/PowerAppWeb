import type { ConsumptionSession, PeriodValue } from "@/lib/gate/fee-first";

// "always": es-ES would otherwise print 1234 without a separator (minimumGroupingDigits 2).
const kwh = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0, useGrouping: "always" });
const kw = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 3, useGrouping: "always" });

function Rows({ title, rows, format }: { title: string; rows: PeriodValue[]; format: (n: number) => string }) {
  if (rows.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-sm font-semibold uppercase text-muted-foreground">{title}</h3>
      <ul className="flex flex-col gap-0.5 text-base">
        {rows.map((r) => (
          <li key={r.period}>
            {r.period} · {format(r.value)}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Short Consumption Report summary on top of Current Conditions. */
export function ConsumptionSummary({ session }: { session: ConsumptionSession }) {
  return (
    <section aria-labelledby="consumption-summary" className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <h2 id="consumption-summary" className="text-lg font-semibold">
        Consumo obtenido
      </h2>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-base">
        <dt className="text-muted-foreground">CUPS</dt>
        <dd className="font-mono break-all">{session.cups}</dd>
        <dt className="text-muted-foreground">Tarifa</dt>
        <dd>{session.feeType}</dd>
      </dl>
      <Rows title="Consumo anual" rows={session.energyRows ?? []} format={(n) => `${kwh.format(Math.trunc(n))} kWh`} />
      <Rows title="Potencia contratada" rows={session.powerRows ?? []} format={(n) => `${kw.format(n)} kW`} />
    </section>
  );
}
