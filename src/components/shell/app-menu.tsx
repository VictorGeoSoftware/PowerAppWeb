"use client";

import { Sheet, SheetContent } from "@/components/ui/sheet";
import { MenuPanel } from "./menu-panel";

export { MenuEntryItem } from "./menu-panel";

type Props = { open: boolean; onOpenChange: (open: boolean) => void };

/** Phone/tablet drawer (below `lg`); desktop uses the sidebar in `AppShell`. */
export function AppMenu({ open, onOpenChange }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        className="w-[280px] gap-0 px-3 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-[calc(1.5rem+env(safe-area-inset-bottom))] pl-[calc(0.75rem+env(safe-area-inset-left))] data-[side=left]:w-[280px]"
      >
        <MenuPanel variant="drawer" onNavigate={() => onOpenChange(false)} />
      </SheetContent>
    </Sheet>
  );
}
