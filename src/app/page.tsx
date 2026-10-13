"use client";

import { useAuth } from "@/components/auth/auth-provider";
import { RequireAuth } from "@/components/auth/guards";
import { Button } from "@/components/ui/button";

// Temporary signed-in placeholder until `app-shell-navigation`.
function HomeContent() {
  const { user, signOutUser } = useAuth();
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[640px] flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-[22px] font-semibold">PowerApp</h1>
      <p className="text-base text-muted-foreground">
        Sesión iniciada como <span className="font-medium text-foreground">{user?.email}</span>
      </p>
      {/* Moves to the drawer menu with `app-shell-navigation`. */}
      <Button variant="outline" size="lg" className="h-12 w-full text-base" onClick={() => void signOutUser()}>
        Cerrar sesión
      </Button>
    </main>
  );
}

export default function Home() {
  return (
    <RequireAuth>
      <HomeContent />
    </RequireAuth>
  );
}
