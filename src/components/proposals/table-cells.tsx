import { cn } from "@/lib/utils";

/**
 * Shared cells of the comparator table. Columns are separate stacks (as in BmApp), so
 * every row has a fixed height to stay aligned across columns.
 */
export const ROW_H = {
  header: "h-16",
  item: "h-10",
  section: "h-11",
  fixedAmount: "h-14",
  total: "h-16",
  delta: "h-11",
} as const;

/** BmApp `HeaderBox` (titleMedium, black weight, rounded, section border). */
export function HeaderBox({ children, className, ...rest }: React.ComponentProps<"div">) {
  return (
    <div
      {...rest}
      className={cn(
        "flex items-center justify-center rounded-lg border border-section-border bg-header-highlight px-2 text-center text-sm leading-tight font-black tracking-wide text-primary-foreground",
        ROW_H.header,
        className,
      )}
    >
      {children}
    </div>
  );
}

/** BmApp `SectionHeader` (titleSmall, semibold). */
export function SectionBox({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-lg border border-section-border bg-header-highlight px-2 text-center text-xs leading-tight font-semibold text-primary-foreground",
        ROW_H.section,
        className,
      )}
    >
      {children}
    </div>
  );
}

/** BmApp `DynamicTableColumnView`: bordered list of bold 12sp values. */
export function ValueList({ values, rows }: { values: string[]; rows: number }) {
  return (
    <div className="divide-y divide-table-border border border-table-border">
      {Array.from({ length: rows }, (_, i) => (
        <Cell key={i}>{values[i] ?? ""}</Cell>
      ))}
    </div>
  );
}

export function Cell({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center justify-center px-1 text-center text-xs leading-tight font-bold text-table-text",
        ROW_H.item,
        className,
      )}
    >
      {children}
    </div>
  );
}
