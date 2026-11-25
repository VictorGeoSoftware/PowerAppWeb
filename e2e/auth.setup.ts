import { E2E_EMAIL, E2E_PASSWORD, HAS_CREDENTIALS, authFile, expect, shellMenu, test } from "./fixtures";

// One real email/password sign-in per browser project; signed-in specs reuse it.
test("sign in once and save the QA session", async ({ page }, testInfo) => {
  test.skip(!HAS_CREDENTIALS, "Set E2E_EMAIL and E2E_PASSWORD (QA account) to run");
  await page.goto("/login");
  await page.getByPlaceholder("Correo electrónico").fill(E2E_EMAIL!);
  await page.getByPlaceholder("Contraseña").fill(E2E_PASSWORD!);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page).toHaveURL(/\/fetch-consumption$/);
  await expect(shellMenu(page)).toBeVisible();
  // Firebase Auth persists the session in IndexedDB.
  await page.context().storageState({ path: authFile(testInfo.project.name), indexedDB: true });
});
