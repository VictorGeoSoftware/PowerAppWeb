import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

let pathname = "/current-conditions";
const signOutUser = vi.fn();
vi.mock("next/navigation", () => ({ usePathname: () => pathname, useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({ signOutUser }),
  FullScreenSpinner: () => <div role="status" />,
}));

import { FeeFirstGateProvider } from "@/components/gate/fee-first-gate-provider";
import { LOCKED_HINT_CONDITIONS, LOCKED_HINT_CONSUMPTION } from "@/lib/gate/fee-first";
import { saveConditions } from "@/lib/gate/storage";
import { AppShell, useTopBarAction } from "./app-shell";
import { MenuEntryItem } from "./app-menu";

const session = { powerPeriods: ["P1"], energyPeriods: ["P1"] };
const complete = {
  powerTermPriceByPeriod: { P1: "0,1" },
  energyPriceByPeriod: { P1: "0,2" },
  extraServices: "",
  companyName: "Endesa",
};

const renderShell = (initialSession: typeof session | null = session, children: React.ReactNode = "x") =>
  render(
    <FeeFirstGateProvider initialSession={initialSession}>
      <AppShell>{children}</AppShell>
    </FeeFirstGateProvider>,
  );

const openMenu = async () => {
  await userEvent.click(screen.getByRole("button", { name: "Abrir menú" }));
  return screen.findByRole("dialog");
};

describe("AppShell", () => {
  beforeEach(() => {
    pathname = "/current-conditions";
    signOutUser.mockReset();
    localStorage.clear();
  });

  it("renders the top bar and page content", () => {
    renderShell(session, <p>contenido</p>);
    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByText("contenido")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("UNLOCKED: BmApp entries in order, all enabled, no hint", async () => {
    saveConditions(complete);
    pathname = "/proposals";
    renderShell();
    const menu = await openMenu();
    expect(within(menu).getByText("Menú")).toBeInTheDocument();
    const nav = within(menu).getByRole("navigation");
    expect([...nav.querySelectorAll("a, button")].map((e) => e.textContent)).toEqual([
      "Nuevo estudio de propuestas",
      "Condiciones actuales",
      "Propuestas",
      "Configuración",
      "Cerrar sesión",
    ]);
    expect(within(menu).getByRole("link", { name: "Propuestas" })).toHaveAttribute("aria-current", "page");
    expect(within(menu).getByRole("link", { name: "Configuración" })).toHaveAttribute("href", "/configuration");
    expect(within(menu).queryByLabelText("Bloqueado")).toBeNull();
    expect(within(menu).queryByText(LOCKED_HINT_CONDITIONS)).toBeNull();
  });

  it("CURRENT_CONDITIONS_REQUIRED: proposals and configuration locked with prices hint", async () => {
    renderShell();
    const menu = await openMenu();
    expect(within(menu).getByRole("link", { name: "Condiciones actuales" })).toBeInTheDocument();
    expect(within(menu).queryByRole("link", { name: "Propuestas" })).toBeNull();
    expect(within(menu).queryByRole("link", { name: "Configuración" })).toBeNull();
    expect(within(menu).getAllByLabelText("Bloqueado")).toHaveLength(2);
    expect(within(menu).getByText(LOCKED_HINT_CONDITIONS)).toBeInTheDocument();
  });

  it("CONSUMPTION_REQUIRED: three entries locked with consumption hint, new study enabled", async () => {
    pathname = "/fetch-consumption";
    renderShell(null);
    const menu = await openMenu();
    expect(within(menu).queryAllByRole("link")).toHaveLength(0);
    expect(within(menu).getAllByLabelText("Bloqueado")).toHaveLength(3);
    expect(within(menu).getByText(LOCKED_HINT_CONSUMPTION)).toBeInTheDocument();
    expect(within(menu).getByRole("button", { name: "Nuevo estudio de propuestas" })).toBeEnabled();
  });

  it("new study clears conditions and job id and locks the menu again", async () => {
    saveConditions(complete);
    localStorage.setItem("bm.lastCompletedJobId", "job-1");
    localStorage.setItem("bm.deviceId", "web-1");
    renderShell();
    let menu = await openMenu();
    await userEvent.click(within(menu).getByRole("button", { name: "Nuevo estudio de propuestas" }));
    expect(localStorage.getItem("bm.currentConditions")).toBeNull();
    expect(localStorage.getItem("bm.lastCompletedJobId")).toBeNull();
    expect(localStorage.getItem("bm.deviceId")).toBe("web-1");
    menu = await openMenu();
    expect(within(menu).getAllByLabelText("Bloqueado")).toHaveLength(3);
  });

  it("logout entry signs out", async () => {
    renderShell();
    const menu = await openMenu();
    await userEvent.click(within(menu).getByRole("button", { name: "Cerrar sesión" }));
    expect(signOutUser).toHaveBeenCalled();
  });

  it("screens can put an action in the top bar", () => {
    function Screen() {
      useTopBarAction(<button>Crear informe</button>);
      return null;
    }
    renderShell(session, <Screen />);
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
