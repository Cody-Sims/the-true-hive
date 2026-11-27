import { test, expect } from "@playwright/test";

test("homepage service copy agrees with the published rescue and pollination offers", async ({
  page,
}) => {
  await page.goto("/");
  const services = page.locator(".home-services");
  await expect(services.locator(".home-section-heading")).not.toContainText(
    /planned service paths|neither is bookable|scope and capacity/i,
  );
  await expect(
    services.getByRole("heading", {
      name: "Live Honeybee Colony Rescue",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    services.getByRole("heading", {
      name: "East Tennessee Farm Pollination",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    services.getByText("$0 NO-COST SERVICE", { exact: true }),
  ).toBeVisible();
  await expect(
    services.getByText("Peer-Reviewed Evidence", { exact: true }),
  ).toBeVisible();
  await expect(services.locator(".evidence-stat")).toHaveText("+24%");
  const call = services.getByRole("link", { name: /Call.*Free Rescue/ });
  await expect(call).toHaveAttribute("href", "tel:+14233682262");
  await expect(
    services.getByRole("link", {
      name: "Discuss Farm Pollination",
      exact: true,
    }),
  ).toHaveAttribute("href", "tel:+14233682262");
  await expect(
    services.getByRole("link", { name: /Assessment Checklist/ }),
  ).toHaveAttribute("href", "/services#farm-pollination");
  await expect(services.locator(".service-path-safety")).toContainText(
    "Safety First:",
  );
  await page.emulateMedia({ colorScheme: "dark" });
  const rescue = services.locator("#colony-removal");
  const farm = services.locator("#farm-pollination");
  expect(
    await rescue.evaluate((node) => getComputedStyle(node).borderTopColor),
  ).not.toBe(
    await farm.evaluate((node) => getComputedStyle(node).borderTopColor),
  );
  await services.getByRole("link", { name: /Bee vs. Wasp Helper/ }).click();
  await expect(page).toHaveURL(/\/services#bee-helper$/);
  await expect(page.locator("[data-bee-helper]")).toBeInViewport();
});
