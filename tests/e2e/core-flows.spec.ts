import { expect, test } from "@playwright/test";

test("telão público carrega o evento demonstrativo", async ({ page }) => {
  await page.goto("/view");
  await expect(page.getByRole("heading", { name: /OBR Regional Paraíba 2026/i })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText("Valhalla · OBR presencial")).toBeVisible();
});

test("administrador entra e acessa o painel operacional", async ({ page }) => {
  await page.goto("/login");
  await expect(
    page.getByText("OBR Regional Paraíba 2026 · Demonstração", { exact: true }),
  ).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Admin" }).click();
  await page.getByLabel("Senha").fill("teste123");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/dashboard\/admin/);
  await expect(page.getByText("Painel OBR")).toBeVisible();
});
