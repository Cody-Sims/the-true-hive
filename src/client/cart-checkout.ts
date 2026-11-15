import type { CartLine } from "../domain/cart.ts";

export type CheckoutPhase = "idle" | "pending" | "uncertain" | "redirecting";
export interface CheckoutClientOptions {
  request(body: string): Promise<Pick<Response, "ok" | "status" | "json">>;
  operationId(): string;
  navigate(url: string): void;
  onState(phase: CheckoutPhase, message: string): void;
}

export function createCartCheckout(options: CheckoutClientOptions) {
  let phase: CheckoutPhase = "idle";
  let body: string | null = null;
  let uncertain = false;
  function state(next: CheckoutPhase, message: string) {
    phase = next;
    options.onState(next, message);
  }
  async function send() {
    if (!body || phase === "pending" || phase === "redirecting") return;
    state(
      "pending",
      "Verifying TEST checkout with the server. No payment success is assumed.",
    );
    try {
      const response = await options.request(body);
      const result = await response.json();
      if (!response.ok) {
        // A conflict can refer to an existing held/reconciled intent, not just stock.
        if (
          uncertain ||
          response.status === 409 ||
          response.status === 429 ||
          response.status >= 500
        )
          throw new Error("Unverified outcome");
        body = null;
        state(
          "idle",
          "Test checkout was rejected. Refresh current prices and availability, then review your cart before trying again.",
        );
        return;
      }
      const url = new URL(
        result && typeof result.checkoutUrl === "string"
          ? result.checkoutUrl
          : "",
      );
      if (
        url.protocol !== "https:" ||
        url.hostname !== "checkout.stripe.com" ||
        url.port ||
        url.username ||
        url.password
      )
        throw new Error("Unverified checkout URL");
      state(
        "redirecting",
        "Opening Stripe TEST MODE — no real charge. This does not confirm payment.",
      );
      options.navigate(url.href);
    } catch {
      uncertain = true;
      state(
        "uncertain",
        "TEST checkout outcome is unverified. A stock hold may exist. Retry this same unchanged intent, including after a rate limit; do not start another checkout. Leaving or cancelling does not release stock. Keep this page open or contact the operator if unresolved.",
      );
    }
  }
  return {
    get phase(): CheckoutPhase {
      return phase;
    },
    async start(lines: CartLine[]) {
      if (phase !== "idle" || !lines.length) return;
      body = JSON.stringify({
        operationId: options.operationId(),
        lines: lines.map(({ variantKey, quantity }) => ({
          variantKey,
          quantity,
        })),
      });
      await send();
    },
    async retry() {
      if (phase === "uncertain") await send();
    },
  };
}
