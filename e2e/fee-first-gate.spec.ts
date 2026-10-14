import { E2E_DEVICE_ID, expect, openSignedIn, test, useSignedInSession } from "./fixtures";

useSignedInSession();

test("without a Consumption Report, direct URLs go back to the fetch step without showing the screen", async ({
  page,
}) => {
  await openSignedIn(page);
  for (const [path, title] of [
    ["/proposals", "Propuestas"],
    ["/configuration", "Configuración"],
    ["/current-conditions", "Condiciones actuales"],
    ["/", null],
  ] as const) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/fetch-consumption$/);
    await expect(page.getByRole("heading", { name: "Nuevo estudio de propuestas" })).toBeVisible();
    if (title) await expect(page.getByRole("heading", { name: title, exact: true })).toHaveCount(0);
  }
});

test("conditions and job id are cleared on logout; the device id is kept", async ({ page }) => {
  await openSignedIn(page);
  await page.evaluate(() => {
    localStorage.setItem(
      "bm.currentConditions",
      JSON.stringify({ powerTermPriceByPeriod: { P1: "0.1" }, energyPriceByPeriod: {}, extraServices: "", companyName: "X" }),
    );
    localStorage.setItem("bm.lastCompletedJobId", "job-1");
  });
  await page.getByRole("button", { name: "Abrir menú" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/\/login$/);
  const stored = await page.evaluate(() => ({
    conditions: localStorage.getItem("bm.currentConditions"),
    job: localStorage.getItem("bm.lastCompletedJobId"),
    device: localStorage.getItem("bm.deviceId"),
  }));
  expect(stored).toEqual({ conditions: null, job: null, device: E2E_DEVICE_ID });
});
