"use client";

import { MenuIcon } from "lucide-react";
import { createContext, useContext, useEffect, useState } from "react";
import { IosInstallBanner } from "@/components/pwa/ios-install-banner";
import { AppMenu } from "./app-menu";

/** Right side of the top bar (e.g. "Crear informe" on Proposals, added by later features). */
const TopBarActionContext = createContext<(node: React.ReactNode) => void>(() => {});

/** Show `node` in the top bar while the calling screen is mounted. */
export function useTopBarAction(node: React.ReactNode) {
  const setAction = useContext(TopBarActionContext);
  useEffect(() => {
    setAction(node);
    return () => setAction(null);
  }, [node, setAction]);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [action, setAction] = useState<React.ReactNode>(null);

  return (
    <TopBarActionContext.Provider value={setAction}>
      <div className="flex min-h-dvh flex-col">
        {/* BmApp TopActionBar: no title, hamburger left, optional action right. */}
        <header className="sticky top-0 z-40 bg-background pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]">
          <div className="mx-auto flex h-14 w-full max-w-[640px] items-center justify-between px-2">
            <button
              type="button"
              aria-label="Abrir menú"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(true)}
              className="flex size-11 items-center justify-center rounded-full text-foreground hover:bg-muted"
            >
              <MenuIcon className="size-6" />
            </button>
            <div className="flex items-center pr-2">{action}</div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[640px] flex-1 px-4 pr-[calc(1rem+env(safe-area-inset-right))] pb-[calc(1rem+env(safe-area-inset-bottom))] pl-[calc(1rem+env(safe-area-inset-left))]">
          {children}
          <IosInstallBanner />
        </main>
      </div>
      <AppMenu open={menuOpen} onOpenChange={setMenuOpen} />
    </TopBarActionContext.Provider>
  );
}
