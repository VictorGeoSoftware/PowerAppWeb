import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const replace = vi.fn();
const retry = vi.fn();
let authState: { user: { email: string } | null; status: string };

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({ ...authState, retry, signOutUser: vi.fn() }),
  FullScreenSpinner: () => <div role="status" />,
  ACCESS_CHECK_FAILED_MESSAGE: "No se pudo verificar tu acceso. Revisa tu conexión.",
}));

import Home from "./page";

describe("Home (protected placeholder)", () => {
  it("redirects to /login when signed out", () => {
    authState = { user: null, status: "signed-out" };
    render(<Home />);
    expect(replace).toHaveBeenCalledWith("/login");
  });

  it.each(["loading", "verifying"])("shows spinner while %s", (status) => {
    authState = { user: { email: "broker@bm.es" }, status };
    render(<Home />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByText("broker@bm.es")).toBeNull();
  });

  it("shows retry screen when the access check fails", async () => {
    authState = { user: { email: "broker@bm.es" }, status: "error" };
    render(<Home />);
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo verificar tu acceso");
    screen.getByRole("button", { name: "Reintentar" }).click();
    expect(retry).toHaveBeenCalled();
  });

  it("shows the granted broker email", () => {
    authState = { user: { email: "broker@bm.es" }, status: "granted" };
    render(<Home />);
    expect(screen.getByText("broker@bm.es")).toBeInTheDocument();
  });
});
