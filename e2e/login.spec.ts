import { expect, test } from "./fixtures";

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

test("signed-out visitor is redirected to /login", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "PowerApp" })).toBeVisible();
});

test("wrong credentials show a Spanish error", async ({ page }) => {
  await page.goto("/login");
  await page.getByPlaceholder("Correo electrónico").fill("no-existe@example.com");
  await page.getByPlaceholder("Contraseña").fill("incorrecta");
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Correo" })).toHaveText("Correo o contraseña incorrectos");
  await expect(page.getByPlaceholder("Correo electrónico")).toHaveValue("no-existe@example.com");
});

test("valid credentials sign in and persist across reload", async ({ page }) => {
  test.skip(!email || !password, "Set E2E_EMAIL and E2E_PASSWORD (QA account) to run");
  await page.goto("/login");
  await page.getByPlaceholder("Correo electrónico").fill(email!);
  await page.getByPlaceholder("Contraseña").fill(password!);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText(email!)).toBeVisible();

  await page.reload();
  await expect(page.getByText(email!)).toBeVisible();

  await page.goto("/login");
  await expect(page).toHaveURL(/\/$/);
});

test("Google button opens the Google sign-in popup", async ({ page }) => {
  test.setTimeout(45_000);
  await page.goto("/login");
  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Continuar con Google" }).click();
  const popup = await popupPromise;
  await popup.waitForLoadState();
  await expect(popup).toHaveURL(/accounts\.google\.com|firebaseapp\.com\/__\/auth\/handler/);
  await popup.close();
  await expect(page.getByRole("alert").filter({ hasText: "Google" })).toHaveText(
    "Inicio de sesión con Google cancelado",
    { timeout: 15_000 }, // Firebase polls for the closed popup
  );
});
