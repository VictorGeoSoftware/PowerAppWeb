"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginErrorMessage } from "@/lib/auth/login-errors";

type Props = {
  /** Performs the sign-in; rejects with a Firebase Auth error on failure. */
  onLogin: (email: string, password: string) => Promise<unknown>;
  /** Google sign-in; resolves when done (or redirecting), rejects with a Firebase Auth error. */
  onGoogleLogin?: () => Promise<unknown>;
};

export function LoginForm({ onLogin, onGoogleLogin }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = !loading && email.trim() !== "" && password !== "";

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    try {
      await onLogin(email.trim(), password);
    } catch (e) {
      setError(loginErrorMessage(e));
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setLoading(true);
    setError(null);
    try {
      await onGoogleLogin?.();
    } catch (e) {
      setError(loginErrorMessage(e));
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-3" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email" className="sr-only">
          Correo electrónico
        </Label>
        <Input
          id="email"
          type="email"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          placeholder="Correo electrónico"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={loading}
          className="h-12 bg-card text-base md:text-base"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password" className="sr-only">
          Contraseña
        </Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          placeholder="Contraseña"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={loading}
          className="h-12 bg-card text-base md:text-base"
        />
      </div>
      <Button type="submit" size="lg" className="mt-3 h-12 w-full text-base" disabled={!canSubmit}>
        {loading ? "Iniciando sesión…" : "Iniciar sesión"}
      </Button>
      {onGoogleLogin && (
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="mx-auto mt-2 h-12 px-6 text-base"
          onClick={handleGoogle}
          disabled={loading}
        >
          Continuar con Google
        </Button>
      )}
      {error && (
        <p role="alert" className="text-center text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
