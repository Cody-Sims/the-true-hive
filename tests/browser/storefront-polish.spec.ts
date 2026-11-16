import { expect, test } from "@playwright/test";

const stagingCopy =
  /A collection in the making|Soap is the starting point|Honey and candles are future directions|A closer look, at your pace|Online ordering isn't open yet|Purchases are paused|Adding to your cart does not reserve stock or place an order|No cart, payment, reservation, or preorder is available|see what is a concept and what has been confirmed|Online checkout is being prepared/i;

test("customer routes use shopping content instead of repeated staging copy", async ({
  page,
}) => {
  for (const path of [
    "/",
    "/goods",
    "/goods/everyday-soap",
    "/cart",
    "/about",
    "/services",
    "/contact",
    "/privacy",
    "/accessibility",
    "/checkout/return",
    "/checkout/cancel",
    "/not-a-published-page",
  ]) {
    await page.goto(path);
    await expect(page.getByRole("main"), path).not.toContainText(stagingCopy);
    await expect(page.locator("body"), path).not.toContainText(
      /Online ordering isn't open yet|Purchases are paused/i,
    );
    await expect(
      page.locator('meta[name="description"]'),
      path,
    ).not.toHaveAttribute(
      "content",
      /does not reserve stock|not a purchase|Online ordering isn't open yet/i,
    );
    await expect(page.getByRole("heading", { level: 1 }), path).toHaveCount(1);
  }
});

test("a disabled checkout stays unavailable in the cart without advertising an unfinished store everywhere", async ({
  page,
}) => {
  await page.goto("/goods");
  await expect(
    page.getByRole("complementary", { name: "Shopping information" }),
  ).toHaveCount(0);
  await page.goto("/cart");
  await expect(page.locator("[data-cart-page]")).toHaveAttribute(
    "data-test-enabled",
    "false",
  );
  await expect(
    page.getByRole("button", { name: "Checkout unavailable", exact: true }),
  ).toBeDisabled();
  await expect(
    page
      .getByRole("navigation", { name: "Footer navigation" })
      .getByRole("link", { name: "Contact us", exact: true }),
  ).toHaveAttribute("href", "/contact");
  await expect(page.locator("[data-cart-checkout]")).toHaveCount(0);
});

test("checkout return routes provide recovery without claiming payment success or cancellation", async ({
  page,
}) => {
  for (const path of [
    "/checkout/return?payment=paid",
    "/checkout/cancel?released=true",
  ]) {
    await page.goto(path);
    await expect(page.getByRole("main")).toContainText(/test checkout/i);
    await expect(
      page
        .getByRole("main")
        .getByRole("link", { name: "View your cart", exact: true }),
    ).toHaveAttribute("href", "/cart");
    await expect(page.getByRole("main")).not.toContainText(
      /Payment successful|Order confirmed|Your order is canceled/i,
    );
  }
});
