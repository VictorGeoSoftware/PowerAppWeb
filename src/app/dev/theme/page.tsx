import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";

const swatches = [
  ["bg-background", "background"],
  ["bg-card", "card"],
  ["bg-primary", "primary"],
  ["bg-secondary", "secondary"],
  ["bg-tertiary", "tertiary"],
  ["bg-muted", "muted"],
  ["bg-table-header", "table-header"],
  ["bg-header-highlight", "header-highlight"],
  ["bg-section-highlight", "section-highlight"],
] as const;

// Dev-only token preview; unavailable in production builds.
export default function ThemePreview() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className="mx-auto flex w-full max-w-[640px] flex-col gap-4 p-4">
      <h1 className="text-[22px] font-semibold">Tokens</h1>
      <div className="grid grid-cols-3 gap-2">
        {swatches.map(([cls, name]) => (
          <div key={name} className="rounded-md border border-border text-xs">
            <div className={`${cls} h-12 rounded-t-md`} />
            <p className="p-1">{name}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button>Primario</Button>
        <Button variant="secondary">Secundario</Button>
        <Button variant="outline">Contorno</Button>
        <Button variant="destructive">Eliminar</Button>
      </div>
      <div className="rounded-lg bg-card p-4 text-card-foreground shadow-sm">
        <p>Tarjeta</p>
        <p className="text-muted-foreground">Texto secundario</p>
      </div>
      <table className="w-full border-collapse text-sm text-table-text">
        <thead>
          <tr className="bg-table-header text-table-header-foreground">
            <th className="border border-table-border p-1">Comercializadora</th>
            <th className="border border-table-border p-1">Importe</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="border border-table-border bg-section-highlight p-1">Actual</td>
            <td className="border border-table-border p-1">100,00 €</td>
          </tr>
        </tbody>
      </table>
    </main>
  );
}
