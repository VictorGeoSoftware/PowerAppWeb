import type { Page } from "@playwright/test";
import { expect, openSignedIn, test, useSignedInSession, FETCH_HEADING } from "./fixtures";

const ENTRIES = [
  { label: "Condiciones actuales", path: "/current-conditions" },
  { label: "Propuestas", path: "/proposals" },
  { label: "Configuración", path: "/configuration" },
  { label: "Nuevo estudio de propuestas", path: "/fetch-consumption" },
];

test("signed-out visitors are sent to /login from every section", async ({ page }) => {
  for (const { path } of ENTRIES) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
  }
});

test.describe("signed in", () => {
  useSignedInSession();

  const menuButton = (page: Page) => page.getByRole("button", { name: "Abrir menú" });

  test("menu shows BmApp entries; at the consumption step only 'Nuevo estudio' is enabled", async ({ page }) => {
    await openSignedIn(page);
    await menuButton(page).click();
    const menu = page.getByRole("dialog");
    await expect(menu.getByText("Menú", { exact: true })).toBeVisible();
    const nav = menu.getByRole("navigation");
    await expect(nav.locator("a, button, span[aria-disabled]")).toHaveText([
      "Nuevo estudio de propuestas",
      ...ENTRIES.filter((e) => e.path !== "/fetch-consumption").map((e) => e.label),
      "Cerrar sesión",
    ]);
    // Fee-First Gate: no Consumption Report yet -> three padlocks (sections covered by component tests).
    await expect(menu.getByLabel("Bloqueado")).toHaveCount(3);
    await expect(menu.getByText("Carga una factura o escanea un CUPS para empezar el estudio.")).toBeVisible();
    await expect(menu.getByText(/^v.+/)).toBeVisible();
    // Let the sheet finish sliding in so the screenshot is usable evidence.
    await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
    await page.screenshot({ path: `test-results/app-shell-menu-${test.info().project.name}.png` });

    await menu.getByRole("button", { name: "Nuevo estudio de propuestas" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page).toHaveURL(/\/fetch-consumption$/);
    await expect(page.getByRole("heading", { name: FETCH_HEADING })).toBeVisible();
  });

  test("Escape closes the menu without navigating and returns focus", async ({ page }) => {
    await openSignedIn(page);
    // Keyboard open: WebKit/Safari doesn't focus buttons on tap, so focus return
    // is only meaningful (and testable) for keyboard users.
    await menuButton(page).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page).toHaveURL(/\/fetch-consumption$/);
    await expect(menuButton(page)).toBeFocused();
  });

  test("top bar stays visible on scroll and uses safe-area insets", async ({ page }) => {
    await openSignedIn(page);
    await page.screenshot({ path: `test-results/app-shell-closed-${test.info().project.name}.png` });
    await page.evaluate(() => {
      const filler = document.createElement("div");
      filler.style.height = "3000px";
      document.querySelector("main")!.append(filler);
      window.scrollTo(0, 2000);
    });
    const bar = page.getByRole("banner");
    await expect(bar).toBeInViewport();
    expect((await bar.boundingBox())!.y).toBeLessThanOrEqual(1);
    const css = await page.evaluate(() =>
      [...document.styleSheets].flatMap((s) => [...s.cssRules].map((r) => r.cssText)).join("\n"),
    );
    expect(css).toContain("safe-area-inset-top");
    expect(css).toContain("safe-area-inset-bottom");
  });
});
