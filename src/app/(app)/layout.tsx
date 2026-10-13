"use client";

import { RequireAuth } from "@/components/auth/guards";
import { AppShell } from "@/components/shell/app-shell";

/** Every signed-in screen: access-gated and inside the BmApp shell. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <AppShell>{children}</AppShell>
    </RequireAuth>
  );
}
