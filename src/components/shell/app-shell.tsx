"use client";

import { MenuIcon } from "lucide-react";
import { createContext, useContext, useEffect, useState } from "react";
import { IosInstallBanner } from "@/components/pwa/ios-install-banner";
import { AppMenu } from "./app-menu";
import { MenuPanel } from "./menu-panel";

/** Right side of the top bar (e.g. "Crear informe" on Proposals, added by later features). */
const TopBarActionContext = createContext<(node: React.ReactNode) => void>(() => {});

/** Tailwind `lg`: the menu becomes a permanent sidebar. */
const DESKTOP_QUERY = "(min-width: 1024px)";

/** Show `node` in the top bar while the calling screen is mounted. */
export function useTopBarAction(node: React.ReactNode) {
  const setAction = useContext(TopBarActionContext);
  useEffect(() => {
    setAction(node);
    return () => setAction(null);
  }, [node, setAction]);
}

/** Closes the drawer once the sidebar takes over, so no stale overlay remains after a resize. */
function useCloseOnDesktop(close: () => void) {
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(DESKTOP_QUERY);
    if (!mql) return;
    const onChange = () => {
      if (mql.matches) close();
    };
    onChange();
    mql.addEventListener?.("change", onChange);
    return () => mql.removeEventListener?.("change", onChange);
  }, [close]);
}

const noop = () => {};

export function AppShell({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [action, setAction] = useState<React.ReactNode>(null);
  const [closeMenu] = useState(() => () => setMenuOpen(false));
  useCloseOnDesktop(closeMenu);

  return (
    <TopBarActionContext.Provider value={setAction}>
      {/* Desktop sidebar: same content as the drawer, hidden (display: none) below lg. */}
      <aside
        data-testid="app-sidebar"
        className="fixed inset-y-0 left-0 z-30 hidden w-[280px] flex-col overflow-y-auto border-r border-section-border bg-background px-3 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-6 lg:flex"
      >
        <MenuPanel variant="sidebar" onNavigate={noop} />
      </aside>
      <div className="flex min-h-dvh flex-col lg:pl-[280px]">
        {/* BmApp TopActionBar: no title, hamburger left (below lg), optional action right. */}
        <header className="sticky top-0 z-40 bg-background pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]">
          <div className="mx-auto flex h-14 w-full max-w-[640px] items-center justify-between px-2 md:max-w-none md:px-4">
            <button
              type="button"
              aria-label="Abrir menú"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(true)}
              className="flex size-11 items-center justify-center rounded-full text-foreground hover:bg-muted lg:hidden"
            >
              <MenuIcon className="size-6" />
            </button>
            <div className="ml-auto flex items-center pr-2">{action}</div>
          </div>
        </header>
        <main className="w-full flex-1 px-4 pr-[calc(1rem+env(safe-area-inset-right))] pb-[calc(1rem+env(safe-area-inset-bottom))] pl-[calc(1rem+env(safe-area-inset-left))]">
          {children}
          <IosInstallBanner />
        </main>
      </div>
      <AppMenu open={menuOpen} onOpenChange={setMenuOpen} />
    </TopBarActionContext.Provider>
  );
}
