"use client";

import { RequireAuth } from "@/components/auth/guards";
import { FeeFirstGateGuard, FeeFirstGateProvider } from "@/components/gate/fee-first-gate-provider";
import { AppShell } from "@/components/shell/app-shell";

/** Every signed-in screen: access-gated, Fee-First-gated and inside the BmApp shell. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <FeeFirstGateProvider>
        <AppShell>
          <FeeFirstGateGuard>{children}</FeeFirstGateGuard>
        </AppShell>
      </FeeFirstGateProvider>
    </RequireAuth>
  );
}
