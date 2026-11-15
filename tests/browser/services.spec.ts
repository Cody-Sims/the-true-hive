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
    services.getByRole("heading", { name: "Colony Rescue", exact: true }),
  ).toBeVisible();
  await expect(
    services.getByRole("heading", { name: "Farm Pollination", exact: true }),
  ).toBeVisible();
});
