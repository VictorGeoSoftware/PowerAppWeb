import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const replace = vi.fn();
const retry = vi.fn();
const signOutUser = vi.fn();
let status = "loading";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
vi.mock("./auth-provider", () => ({
  useAuth: () => ({ status, retry, signOutUser }),
  FullScreenSpinner: () => <div role="status" />,
  ACCESS_CHECK_FAILED_MESSAGE: "No se pudo verificar tu acceso. Revisa tu conexión.",
}));

import { RequireAuth } from "./guards";

const renderGuarded = () => render(<RequireAuth><p>protegido</p></RequireAuth>);

describe("RequireAuth", () => {
  it("redirects to /login when signed out", () => {
    status = "signed-out";
    renderGuarded();
    expect(replace).toHaveBeenCalledWith("/login");
    expect(screen.queryByText("protegido")).toBeNull();
  });

  it.each(["loading", "verifying"])("shows spinner while %s", (s) => {
    status = s;
    renderGuarded();
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByText("protegido")).toBeNull();
  });

  it("shows retry screen when the access check fails", () => {
    status = "error";
    renderGuarded();
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo verificar tu acceso");
    screen.getByRole("button", { name: "Reintentar" }).click();
    expect(retry).toHaveBeenCalled();
    screen.getByRole("button", { name: "Cerrar sesión" }).click();
    expect(signOutUser).toHaveBeenCalled();
  });

  it("renders children when granted", () => {
    status = "granted";
    renderGuarded();
    expect(screen.getByText("protegido")).toBeInTheDocument();
  });
});
