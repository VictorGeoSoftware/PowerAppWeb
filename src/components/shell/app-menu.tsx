"use client";

import { LockIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { LOGOUT_LABEL, MENU_ENTRIES } from "./menu-entries";

const entryClass = "flex h-12 w-full items-center gap-2 rounded-full px-4 text-left text-sm font-medium text-foreground";

type EntryProps = {
  label: string;
  href: string;
  selected: boolean;
  /** Set by `fee-first-gate`: entry stays visible but disabled, with a padlock. */
  locked?: boolean;
  onNavigate: () => void;
};

export function MenuEntryItem({ label, href, selected, locked = false, onNavigate }: EntryProps) {
  if (locked) {
    return (
      <span aria-disabled="true" className={cn(entryClass, "text-muted-foreground")}>
        <span className="flex-1">{label}</span>
        <LockIcon className="size-4" aria-label="Bloqueado" />
      </span>
    );
  }
  return (
    // replace: sections don't stack in history (BmApp popUpTo start).
    <Link
      href={href}
      replace
      aria-current={selected ? "page" : undefined}
      onClick={onNavigate}
      className={cn(entryClass, selected ? "bg-section-highlight" : "hover:bg-muted")}
    >
      {label}
    </Link>
  );
}

type Props = { open: boolean; onOpenChange: (open: boolean) => void };

export function AppMenu({ open, onOpenChange }: Props) {
  const pathname = usePathname();
  const { signOutUser } = useAuth();
  const close = () => onOpenChange(false);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        className="w-[280px] gap-0 px-3 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-[calc(1.5rem+env(safe-area-inset-bottom))] pl-[calc(0.75rem+env(safe-area-inset-left))] data-[side=left]:w-[280px]"
      >
        <SheetTitle className="px-4 pb-3 text-base font-semibold">Menú</SheetTitle>
        <nav aria-label="Menú principal" className="flex flex-col gap-1">
          {MENU_ENTRIES.map((entry) => (
            <MenuEntryItem key={entry.href} {...entry} selected={pathname === entry.href} onNavigate={close} />
          ))}
          <button
            type="button"
            className={cn(entryClass, "hover:bg-muted")}
            onClick={() => {
              close();
              void signOutUser();
            }}
          >
            {LOGOUT_LABEL}
          </button>
        </nav>
        <p className="mt-auto self-end px-4 text-xs font-medium text-muted-foreground">
          {process.env.NEXT_PUBLIC_APP_VERSION}
        </p>
      </SheetContent>
    </Sheet>
  );
}
