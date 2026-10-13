import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

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
  test.skip(!email || !password, "Set E2E_EMAIL and E2E_PASSWORD (QA account) to run");

  async function login(page: Page) {
    await page.goto("/login");
    await page.getByPlaceholder("Correo electrónico").fill(email!);
    await page.getByPlaceholder("Contraseña").fill(password!);
    await page.getByRole("button", { name: "Iniciar sesión" }).click();
    await expect(page).toHaveURL(/\/fetch-consumption$/);
  }
  const menuButton = (page: Page) => page.getByRole("button", { name: "Abrir menú" });

  test("menu shows BmApp entries and navigates to each section", async ({ page }) => {
    await login(page);
    await menuButton(page).click();
    const menu = page.getByRole("dialog");
    await expect(menu.getByText("Menú", { exact: true })).toBeVisible();
    await expect(menu.getByRole("link")).toHaveText(ENTRIES.map((e) => e.label));
    await expect(menu.getByRole("button", { name: "Cerrar sesión" })).toBeVisible();
    await expect(menu.getByText(/^v\d{4}_\d{4}$|^v.+/)).toBeVisible();
    await page.screenshot({ path: `test-results/app-shell-menu-${test.info().project.name}.png` });

    for (const { label, path } of ENTRIES) {
      await page.getByRole("dialog").getByRole("link", { name: label }).click();
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(page.getByRole("heading", { name: label })).toBeVisible();
      await menuButton(page).click();
      await expect(page.getByRole("dialog").getByRole("link", { name: label })).toHaveAttribute("aria-current", "page");
    }
  });

  test("Escape closes the menu without navigating and returns focus", async ({ page }) => {
    await login(page);
    await menuButton(page).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page).toHaveURL(/\/fetch-consumption$/);
    await expect(menuButton(page)).toBeFocused();
  });

  test("top bar stays visible on scroll and uses safe-area insets", async ({ page }) => {
    await login(page);
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
