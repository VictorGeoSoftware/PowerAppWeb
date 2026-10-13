import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

let pathname = "/fetch-consumption";
const signOutUser = vi.fn();
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
vi.mock("@/components/auth/auth-provider", () => ({ useAuth: () => ({ signOutUser }) }));

import { AppShell, useTopBarAction } from "./app-shell";
import { MenuEntryItem } from "./app-menu";
import { MENU_ENTRIES } from "./menu-entries";

const openMenu = async () => {
  await userEvent.click(screen.getByRole("button", { name: "Abrir menú" }));
  return screen.findByRole("dialog");
};

describe("AppShell", () => {
  beforeEach(() => {
    pathname = "/fetch-consumption";
    signOutUser.mockReset();
  });

  it("renders the top bar and page content", () => {
    render(<AppShell><p>contenido</p></AppShell>);
    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByText("contenido")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("menu lists BmApp entries in order, then logout", async () => {
    render(<AppShell>x</AppShell>);
    const menu = await openMenu();
    expect(within(menu).getByText("Menú")).toBeInTheDocument();
    const items = within(menu).getAllByRole("link").map((l) => l.textContent);
    expect(items).toEqual([
      "Condiciones actuales",
      "Propuestas",
      "Configuración",
      "Nuevo estudio de propuestas",
    ]);
    expect(within(menu).getByRole("button", { name: "Cerrar sesión" })).toBeInTheDocument();
  });

  it("entries link to their routes and highlight the current one", async () => {
    pathname = "/proposals";
    render(<AppShell>x</AppShell>);
    const menu = await openMenu();
    for (const { label, href } of MENU_ENTRIES) {
      expect(within(menu).getByRole("link", { name: label })).toHaveAttribute("href", href);
    }
    expect(within(menu).getByRole("link", { name: "Propuestas" })).toHaveAttribute("aria-current", "page");
    expect(within(menu).getByRole("link", { name: "Configuración" })).not.toHaveAttribute("aria-current");
  });

  it("logout entry signs out", async () => {
    render(<AppShell>x</AppShell>);
    const menu = await openMenu();
    await userEvent.click(within(menu).getByRole("button", { name: "Cerrar sesión" }));
    expect(signOutUser).toHaveBeenCalled();
  });

  it("screens can put an action in the top bar", () => {
    function Screen() {
      useTopBarAction(<button>Crear informe</button>);
      return null;
    }
    render(<AppShell><Screen /></AppShell>);
    expect(within(screen.getByRole("banner")).getByRole("button", { name: "Crear informe" })).toBeInTheDocument();
  });
});

describe("MenuEntryItem", () => {
  it("locked entries are disabled with a padlock and no link", () => {
    render(<MenuEntryItem label="Propuestas" href="/proposals" selected={false} locked onNavigate={() => {}} />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByLabelText("Bloqueado")).toBeInTheDocument();
  });
});
