import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
test("live terminal, all navigation views, unsigned instruction and screenshot", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByText("RECONCILED", { exact: true })).toBeVisible();
  await expect(
    page.getByText("€10,000,000", { exact: true }).first(),
  ).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/terminal-desktop.png",
    fullPage: true,
  });
  const nav = [
    "Assets",
    "Issuance",
    "Investors",
    "Compliance",
    "Subscriptions",
    "Settlement",
    "Corporate Actions",
    "Transactions",
    "Audit Trail",
    "Settings",
  ];
  for (const name of nav) {
    await page
      .getByRole("navigation")
      .getByRole("button", { name, exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name, exact: true }).first(),
    ).toBeVisible();
  }
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Assets", exact: true })
    .click();
  const manifest = JSON.parse(
    await readFile("examples/corporate-bond/deployment.json", "utf8"),
  );
  await page.getByLabel("Action", { exact: true }).selectOption("1");
  await page
    .getByLabel("Signing wallet", { exact: true })
    .fill(manifest.investors[0].wallet);
  await page
    .getByLabel("Spender address", { exact: true })
    .fill(manifest.contracts.DvP);
  await page.getByLabel("Security quantity", { exact: true }).fill("1");
  await page.getByRole("button", { name: "Simulate & prepare" }).click();
  await expect(page.getByText(/Simulation passed/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Download unsigned instruction" }),
  ).toBeVisible();
  await page.getByLabel("Security quantity", { exact: true }).fill("2");
  await expect(
    page.getByRole("button", { name: "Download unsigned instruction" }),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
});
test("mobile navigation and no horizontal page overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByText("RECONCILED", { exact: true })).toBeVisible();
  const sizes = await page.evaluate(() => ({
    width: innerWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(sizes.scroll).toBeLessThanOrEqual(sizes.width);
  await page.screenshot({
    path: "docs/screenshots/terminal-mobile.png",
    fullPage: true,
  });
});
