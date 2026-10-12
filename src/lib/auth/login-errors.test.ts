import { describe, expect, it } from "vitest";
import { loginErrorMessage, UNEXPECTED_LOGIN_ERROR } from "./login-errors";

describe("loginErrorMessage", () => {
  it.each([
    ["auth/invalid-credential", "Correo o contraseña incorrectos"],
    ["auth/wrong-password", "Correo o contraseña incorrectos"],
    ["auth/user-not-found", "Correo o contraseña incorrectos"],
    ["auth/invalid-email", "Correo electrónico no válido"],
    ["auth/user-disabled", "Esta cuenta ha sido deshabilitada"],
    ["auth/too-many-requests", "Demasiados intentos. Inténtalo más tarde"],
    ["auth/network-request-failed", "Sin conexión. Revisa tu red"],
  ])("%s -> %s", (code, message) => {
    expect(loginErrorMessage({ code })).toBe(message);
  });

  it("falls back for unknown errors", () => {
    expect(loginErrorMessage({ code: "auth/whatever" })).toBe(UNEXPECTED_LOGIN_ERROR);
    expect(loginErrorMessage(new Error("boom"))).toBe(UNEXPECTED_LOGIN_ERROR);
    expect(loginErrorMessage(undefined)).toBe(UNEXPECTED_LOGIN_ERROR);
  });
});
