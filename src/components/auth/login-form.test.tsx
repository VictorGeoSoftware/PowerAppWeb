import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LoginForm } from "./login-form";

const fill = async (email: string, password: string) => {
  const user = userEvent.setup();
  if (email) await user.type(screen.getByPlaceholderText("Correo electrónico"), email);
  if (password) await user.type(screen.getByPlaceholderText("Contraseña"), password);
  return user;
};

describe("LoginForm", () => {
  it("disables submit until both fields are filled", async () => {
    render(<LoginForm onLogin={vi.fn()} />);
    const button = screen.getByRole("button", { name: "Iniciar sesión" });
    expect(button).toBeDisabled();
    await fill("a@b.com", "");
    expect(button).toBeDisabled();
    await fill("", "secret");
    expect(button).toBeEnabled();
  });

  it("submits trimmed email and shows loading label", async () => {
    let resolve!: () => void;
    const onLogin = vi.fn(() => new Promise<void>((r) => (resolve = r)));
    render(<LoginForm onLogin={onLogin} />);
    const user = await fill("  broker@bm.es  ", "secret");
    await user.click(screen.getByRole("button", { name: "Iniciar sesión" }));

    expect(onLogin).toHaveBeenCalledWith("broker@bm.es", "secret");
    expect(screen.getByRole("button", { name: "Iniciando sesión…" })).toBeDisabled();
    resolve();
  });

  it("shows Spanish error and keeps inputs on failure", async () => {
    const onLogin = vi.fn().mockRejectedValue({ code: "auth/invalid-credential" });
    render(<LoginForm onLogin={onLogin} />);
    const user = await fill("broker@bm.es", "wrong");
    await user.click(screen.getByRole("button", { name: "Iniciar sesión" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Correo o contraseña incorrectos");
    expect(screen.getByPlaceholderText("Correo electrónico")).toHaveValue("broker@bm.es");
    expect(screen.getByRole("button", { name: "Iniciar sesión" })).toBeEnabled();
  });

  it("uses iOS-friendly input attributes", () => {
    render(<LoginForm onLogin={vi.fn()} />);
    const email = screen.getByPlaceholderText("Correo electrónico");
    expect(email).toHaveAttribute("type", "email");
    expect(email).toHaveAttribute("autocomplete", "username");
    expect(screen.getByPlaceholderText("Contraseña")).toHaveAttribute("autocomplete", "current-password");
  });
});

describe("LoginForm Google button", () => {
  it("is hidden without handler and calls handler when present", async () => {
    const { unmount } = render(<LoginForm onLogin={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Continuar con Google" })).toBeNull();
    unmount();

    const onGoogleLogin = vi.fn().mockResolvedValue(undefined);
    render(<LoginForm onLogin={vi.fn()} onGoogleLogin={onGoogleLogin} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Continuar con Google" }));
    expect(onGoogleLogin).toHaveBeenCalledOnce();
  });

  it("shows Spanish message when Google popup is closed", async () => {
    const onGoogleLogin = vi.fn().mockRejectedValue({ code: "auth/popup-closed-by-user" });
    render(<LoginForm onLogin={vi.fn()} onGoogleLogin={onGoogleLogin} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Continuar con Google" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Inicio de sesión con Google cancelado");
    expect(screen.getByRole("button", { name: "Continuar con Google" })).toBeEnabled();
  });
});
