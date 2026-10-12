const MESSAGES: Record<string, string> = {
  "auth/invalid-credential": "Correo o contraseña incorrectos",
  "auth/wrong-password": "Correo o contraseña incorrectos",
  "auth/user-not-found": "Correo o contraseña incorrectos",
  "auth/invalid-email": "Correo electrónico no válido",
  "auth/user-disabled": "Esta cuenta ha sido deshabilitada",
  "auth/too-many-requests": "Demasiados intentos. Inténtalo más tarde",
  "auth/network-request-failed": "Sin conexión. Revisa tu red",
  "auth/popup-closed-by-user": "Inicio de sesión con Google cancelado",
  "auth/cancelled-popup-request": "Inicio de sesión con Google cancelado",
  "auth/account-exists-with-different-credential":
    "Ya existe una cuenta con este correo. Inicia sesión con tu contraseña",
  "auth/operation-not-allowed": "Este método de inicio de sesión no está habilitado",
  "auth/unauthorized-domain": "Este dominio no está autorizado para iniciar sesión",
};

export const UNEXPECTED_LOGIN_ERROR = "Error inesperado al iniciar sesión";

/** Spanish message for a Firebase Auth error (parity with BmApp mapLoginError). */
export function loginErrorMessage(error: unknown): string {
  const code = (error as { code?: unknown })?.code;
  return (typeof code === "string" && MESSAGES[code]) || UNEXPECTED_LOGIN_ERROR;
}
