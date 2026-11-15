import type { CartLine } from "../domain/cart.ts";
import {
  clearRejectedIntent,
  pendingBody,
  readPendingIntent,
  writePendingIntent,
  type PendingIntent,
  type PendingStorage,
} from "./cart-pending.ts";

export type CheckoutPhase =
  "idle" | "pending" | "uncertain" | "redirecting" | "blocked";
export interface CheckoutClientOptions {
  pendingStorage(): PendingStorage;
  request(body: string): Promise<Pick<Response, "ok" | "status" | "json">>;
  operationId(): string;
  navigate(url: string): void;
  onState(phase: CheckoutPhase, message: string): void;
}

export function createCartCheckout(options: CheckoutClientOptions) {
  const recovered = readPendingIntent(options.pendingStorage);
  let intent: PendingIntent | null =
    recovered.kind === "pending" ? recovered.intent : null;
  let body: string | null = intent ? pendingBody(intent) : null;
  let phase: CheckoutPhase =
    recovered.kind === "blocked" ? "blocked" : intent ? "uncertain" : "idle";
  let uncertain = recovered.kind === "pending";
  const recoveryMessage =
    "A pending TEST checkout was recovered. Its frozen selection and operation ID will be reused. Current catalog prices are not confirmation of the existing reserved order total. Returning or cancelling cannot confirm payment or release stock. Retry the same intent. If it cannot reopen, contact the operator for authoritative server reconciliation before another checkout.";
  const blockedMessage =
    "TEST checkout recovery is blocked. No replacement intent will be sent. Pending session storage is invalid, changed or unavailable. Do not clear browser storage or start another checkout; keep this page open and contact the operator to verify any existing order and stock hold. A new intent requires authoritative server recovery.";
  function state(next: CheckoutPhase, message: string) {
    phase = next;
    options.onState(next, message);
  }
  async function send() {
    if (!body || !intent || phase === "pending" || phase === "redirecting")
      return;
    if (!writePendingIntent(options.pendingStorage, intent)) {
      state("blocked", blockedMessage);
      return;
    }
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
        if (!clearRejectedIntent(options.pendingStorage, intent)) {
          state("blocked", blockedMessage);
          return;
        }
        body = null;
        intent = null;
        state(
          "idle",
          "Test checkout was rejected. Refresh current prices and availability, then review your cart before trying again.",
        );
        return;
      }
      // The server may hold stock even if persistence or navigation now fails.
      uncertain = true;
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
      if (!writePendingIntent(options.pendingStorage, intent)) {
        state("blocked", blockedMessage);
        return;
      }
      state(
        "redirecting",
        "Opening Stripe TEST MODE — no real charge. This does not confirm payment.",
      );
      options.navigate(url.href);
    } catch {
      uncertain = true;
      state(
        "uncertain",
        "TEST checkout outcome is unverified. A stock hold may exist. This tab has saved the frozen intent for recovery. Retry this same unchanged intent, including after a rate limit; do not start another checkout or clear browser session storage. Leaving, cancelling or elapsed time does not release stock. Contact the operator if unresolved.",
      );
    }
  }
  return {
    get phase(): CheckoutPhase {
      return phase;
    },
    get pendingLines(): CartLine[] | null {
      return intent?.lines.map((line) => ({ ...line })) ?? null;
    },
    get hasPendingIntent() {
      return intent !== null;
    },
    get canRetry() {
      return !!body && (phase === "uncertain" || phase === "blocked");
    },
    announceRecovery() {
      if (phase === "uncertain") options.onState(phase, recoveryMessage);
      else if (phase === "blocked") options.onState(phase, blockedMessage);
    },
    async start(lines: CartLine[]) {
      if (phase !== "idle" || !lines.length) return;
      intent = {
        operationId: options.operationId(),
        lines: lines.map(({ variantKey, quantity }) => ({
          variantKey,
          quantity,
        })),
      };
      body = pendingBody(intent);
      await send();
    },
    async retry() {
      if (phase === "uncertain" || phase === "blocked") await send();
    },
  };
}
