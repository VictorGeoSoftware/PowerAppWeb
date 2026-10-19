"use client";

import Image from "next/image";
import { signInWithEmailAndPassword } from "firebase/auth";
import { TrackScreen } from "@/components/analytics/screen-tracking";
import { LoginForm } from "@/components/auth/login-form";
import { useAuth } from "@/components/auth/auth-provider";
import { RedirectIfAuthenticated } from "@/components/auth/guards";
import { signInWithGoogle } from "@/lib/auth/google-sign-in";
import { getFirebaseAuth } from "@/lib/firebase/client";

export default function LoginPage() {
  const { notice, clearNotice } = useAuth();
  return (
    <RedirectIfAuthenticated>
      <TrackScreen name="auth_login" />
      <main className="mx-auto flex min-h-dvh w-full max-w-[400px] flex-col items-center px-6 pt-[max(3.75rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]">
        <div className="flex size-24 items-center justify-center rounded-3xl bg-primary">
          <Image src="/brand-icon.png" alt="Icono de PowerApp" width={96} height={96} priority />
        </div>
        <h1 className="mt-4 text-[28px] font-semibold">PowerApp</h1>
        <p className="mt-3 text-center text-sm text-muted-foreground">
          Gestión inteligente de energía para tu equipo.
        </p>
        {notice && (
          <p
            role="alert"
            className="mt-6 w-full rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-center text-sm text-destructive"
          >
            {notice}
          </p>
        )}
        <div className="mt-7 w-full">
          <LoginForm
            onLogin={(email, password) => {
              clearNotice();
              return signInWithEmailAndPassword(getFirebaseAuth(), email, password);
            }}
            onGoogleLogin={() => {
              clearNotice();
              return signInWithGoogle(getFirebaseAuth());
            }}
          />
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          ¿No tienes cuenta? <span className="ml-1.5 text-tertiary">Solicitar acceso</span>
        </p>
      </main>
    </RedirectIfAuthenticated>
  );
}
