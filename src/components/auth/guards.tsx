"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ACCESS_CHECK_FAILED_MESSAGE, FullScreenSpinner, useAuth } from "./auth-provider";

function AccessCheckError() {
  const { retry, signOutUser } = useAuth();
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[400px] flex-col items-center justify-center gap-4 px-6 text-center">
      <p role="alert" className="text-base">
        {ACCESS_CHECK_FAILED_MESSAGE}
      </p>
      <Button size="lg" className="h-12 w-full text-base" onClick={retry}>
        Reintentar
      </Button>
      <Button variant="outline" size="lg" className="h-12 w-full text-base" onClick={() => void signOutUser()}>
        Cerrar sesión
      </Button>
    </main>
  );
}

/** Renders children only for granted Brokers; otherwise redirects to /login. */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "signed-out") router.replace("/login");
  }, [status, router]);

  if (status === "granted") return <>{children}</>;
  if (status === "error") return <AccessCheckError />;
  return <FullScreenSpinner />;
}

/** Renders children only for signed-out visitors; otherwise redirects to /. */
export function RedirectIfAuthenticated({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "granted" || status === "error") router.replace("/");
  }, [status, router]);

  if (status === "signed-out") return <>{children}</>;
  return <FullScreenSpinner />;
}
