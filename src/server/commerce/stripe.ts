import Stripe from "stripe";
import { createHash } from "node:crypto";
import type { Pool } from "pg";
import type {
  CheckoutReservation,
  CheckoutPayment,
  CheckoutExpiry,
  CheckoutSettlement,
} from "../../domain/commerce.ts";
import { readCheckoutConfig, type StripeTestConfig } from "./config.ts";
import {
  isRecordKey,
  InventoryInputError,
  InventoryConflictError,
  InventoryNotFoundError,
} from "../inventory/rules.ts";
import { jsonResponse } from "../http.ts";
import { ConfigurationError } from "../config.ts";

export { getCheckoutPresentation, prepareCheckoutStartup } from "./config.ts";

export const STRIPE_API_VERSION = "2026-10-28.endive";
export const CHECKOUT_JSON_LIMIT = 8_192;
export const STRIPE_WEBHOOK_LIMIT = 262_144;

export class CheckoutBoundaryError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number, message: string) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function unavailable() {
  return new CheckoutBoundaryError(
    "CHECKOUT_UNAVAILABLE",
    503,
    "Test checkout is unavailable. Retry the same intent or contact the operator.",
  );
}

export function checkoutErrorResponse(error: unknown): Response {
  if (error instanceof CheckoutBoundaryError) {
    return jsonResponse(
      { error: { code: error.code, message: error.message } },
      error.status,
    );
  }
  const inputError = record(error);
  if (
    inputError &&
    typeof inputError["code"] === "string" &&
    ["BODY_TOO_LARGE", "INVALID_JSON", "INVALID_BODY"].includes(
      inputError["code"],
    ) &&
    [400, 413].includes(Number(inputError["status"]))
  ) {
    return jsonResponse(
      {
        error: {
          code: inputError["code"],
          message: "The request body is invalid or too large.",
        },
      },
      Number(inputError["status"]),
    );
  }
  if (
    error instanceof ConfigurationError ||
    error instanceof InventoryInputError ||
    error instanceof InventoryConflictError ||
    error instanceof InventoryNotFoundError
  ) {
    const status =
      error instanceof ConfigurationError
        ? 503
        : error instanceof InventoryInputError
          ? 400
          : error instanceof InventoryNotFoundError
            ? 404
            : 409;
    return jsonResponse(
      {
        error: {
          code: "CHECKOUT_UNAVAILABLE",
          message: "Test checkout cannot be completed.",
        },
      },
      status,
    );
  }
  const safe = unavailable();
  return jsonResponse(
    { error: { code: safe.code, message: safe.message } },
    safe.status,
  );
}

export interface CheckoutIntent {
  operationId: string;
  lines: { variantKey: string; quantity: number }[];
}

export interface CheckoutPersistence {
  reserveCheckout(
    pool: Pool,
    input: CheckoutIntent,
    locationKey: string,
  ): Promise<CheckoutReservation>;
  attachCheckoutSession(
    pool: Pool,
    orderId: string,
    sessionId: string,
    expiresAt: string,
  ): Promise<CheckoutReservation>;
  getCheckoutReservation(
    pool: Pool,
    orderId: string,
  ): Promise<CheckoutReservation | null>;
  applyCheckoutPayment(
    pool: Pool,
    input: CheckoutPayment,
  ): Promise<CheckoutSettlement>;
  releaseExpiredCheckout(
    pool: Pool,
    input: CheckoutExpiry,
  ): Promise<CheckoutSettlement>;
  markCheckoutReconciliation(
    pool: Pool,
    orderId: string,
    reason: string,
  ): Promise<void>;
  listPendingCheckoutReservations(
    pool: Pool,
    limit: number,
  ): Promise<CheckoutReservation[]>;
}

export interface CheckoutProvider {
  webhooks: Pick<Stripe["webhooks"], "constructEvent">;
  checkout: {
    sessions: {
      create(
        input: Stripe.Checkout.SessionCreateParams,
        options: Stripe.RequestOptions,
      ): Promise<Stripe.Checkout.Session>;
      retrieve(
        id: string,
        input: Stripe.Checkout.SessionRetrieveParams,
      ): Promise<Stripe.Checkout.Session>;
      listLineItems(
        id: string,
        input: Stripe.Checkout.SessionListLineItemsParams,
      ): Promise<Stripe.ApiList<Stripe.LineItem>>;
      expire(id: string): Promise<Stripe.Checkout.Session>;
    };
  };
}

export interface CheckoutDependencies {
  config: StripeTestConfig;
  provider: CheckoutProvider;
  persistence: CheckoutPersistence;
  pool: Pool;
  now?: () => number;
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function validateCheckoutIntent(input: unknown): CheckoutIntent {
  const value = record(input);
  const lines = value?.["lines"];
  const seen = new Set<string>();
  if (
    !value ||
    Object.keys(value).some((key) => !["operationId", "lines"].includes(key)) ||
    !isUuid(value["operationId"]) ||
    !Array.isArray(lines) ||
    lines.length < 1 ||
    lines.length > 20 ||
    lines.some((line: unknown) => {
      const item = record(line);
      if (
        !item ||
        Object.keys(item).some(
          (key) => !["variantKey", "quantity"].includes(key),
        ) ||
        !isRecordKey(item["variantKey"]) ||
        typeof item["quantity"] !== "number" ||
        !Number.isInteger(item["quantity"]) ||
        item["quantity"] < 1 ||
        item["quantity"] > 100 ||
        seen.has(item["variantKey"])
      )
        return true;
      seen.add(item["variantKey"]);
      return false;
    })
  ) {
    throw new CheckoutBoundaryError(
      "INVALID_CHECKOUT",
      400,
      "Provide a UUID intent and 1–20 distinct variants with whole quantities from 1–100.",
    );
  }
  return {
    operationId: value["operationId"].toLowerCase(),
    lines: lines.map((line: { variantKey: string; quantity: number }) => ({
      variantKey: line.variantKey,
      quantity: line.quantity,
    })),
  };
}

function validSessionId(value: unknown): value is string {
  return (
    typeof value === "string" && /^cs_test_[a-zA-Z0-9_]{1,240}$/.test(value)
  );
}

function lineName(line: CheckoutReservation["lines"][number]) {
  return `${line.title} — ${line.label}`;
}

function validReservation(order: CheckoutReservation): boolean {
  const keys = new Set<string>();
  let total = 0;
  if (
    !isUuid(order.id) ||
    order.currency !== "USD" ||
    !isRecordKey(order.locationKey) ||
    !Number.isFinite(Date.parse(order.checkoutExpiresAt)) ||
    !Array.isArray(order.lines) ||
    order.lines.length < 1 ||
    order.lines.length > 20
  )
    return false;
  for (const line of order.lines) {
    if (
      !isRecordKey(line.variantKey) ||
      keys.has(line.variantKey) ||
      !Number.isInteger(line.quantity) ||
      line.quantity < 1 ||
      line.quantity > 100 ||
      !Number.isSafeInteger(line.priceMinor) ||
      line.priceMinor < 1 ||
      typeof line.title !== "string" ||
      !line.title.trim() ||
      typeof line.label !== "string" ||
      !line.label.trim() ||
      lineName(line).length > 250
    )
      return false;
    keys.add(line.variantKey);
    total += line.priceMinor * line.quantity;
  }
  return (
    Number.isSafeInteger(total) &&
    total > 0 &&
    total <= 99_999_999 &&
    total === order.totalMinor
  );
}

function validSession(
  session: Stripe.Checkout.Session,
  order: CheckoutReservation,
  expectedId: string,
): boolean {
  return (
    validReservation(order) &&
    validSessionId(session.id) &&
    session.id === expectedId &&
    session.object === "checkout.session" &&
    session.livemode === false &&
    session.mode === "payment" &&
    session.client_reference_id === order.id &&
    session.metadata?.["app"] === "the-true-hive" &&
    session.metadata?.["orderId"] === order.id &&
    session.currency === "usd" &&
    session.amount_total === order.totalMinor &&
    session.amount_subtotal === order.totalMinor &&
    session.expires_at ===
      Math.floor(Date.parse(order.checkoutExpiresAt) / 1000) &&
    session.payment_method_types?.length === 1 &&
    session.payment_method_types[0] === "card" &&
    session.total_details?.amount_discount === 0 &&
    session.total_details.amount_shipping === 0 &&
    session.total_details.amount_tax === 0
  );
}

function validLines(
  session: Stripe.Checkout.Session,
  order: CheckoutReservation,
): boolean {
  const items = session.line_items;
  if (
    !items ||
    items.has_more !== false ||
    !Array.isArray(items.data) ||
    items.data.length !== order.lines.length
  )
    return false;
  const expected = new Map(order.lines.map((line) => [line.variantKey, line]));
  for (const item of items.data) {
    const price = item.price;
    const product = price?.product;
    if (!price || !product || typeof product === "string" || product.deleted)
      return false;
    const metadata = record(product.metadata);
    const variantKey = metadata?.["variantKey"];
    const line =
      typeof variantKey === "string" ? expected.get(variantKey) : undefined;
    if (
      !line ||
      product.livemode !== false ||
      metadata?.["app"] !== "the-true-hive" ||
      product.name !== lineName(line) ||
      price.livemode !== false ||
      price.currency !== "usd" ||
      price.unit_amount !== line.priceMinor ||
      price.type !== "one_time" ||
      price.billing_scheme !== "per_unit" ||
      item.currency !== "usd" ||
      item.quantity !== line.quantity ||
      item.amount_subtotal !== line.priceMinor * line.quantity ||
      item.amount_total !== line.priceMinor * line.quantity ||
      item.amount_discount !== 0 ||
      item.amount_tax !== 0
    )
      return false;
    expected.delete(line.variantKey);
  }
  return expected.size === 0;
}

function checkoutUrl(session: Stripe.Checkout.Session): string | null {
  if (!session.url || session.url.length > 8192) return null;
  try {
    const url = new URL(session.url);
    return url.protocol === "https:" &&
      url.hostname === "checkout.stripe.com" &&
      !url.port &&
      !url.username &&
      !url.password &&
      !url.search &&
      url.pathname === `/c/pay/${session.id}`
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export function createCheckoutServices(dependencies: CheckoutDependencies) {
  const { config, provider, persistence, pool } = dependencies;
  const now = dependencies.now ?? Date.now;

  async function quarantine(order: CheckoutReservation, reason: string) {
    await persistence.markCheckoutReconciliation(pool, order.id, reason);
    return { result: "reconciliation_required" };
  }

  async function retrieve(order: CheckoutReservation) {
    if (!validSessionId(order.checkoutSessionId)) return null;
    const session = await provider.checkout.sessions.retrieve(
      order.checkoutSessionId,
      {
        expand: ["line_items.data.price.product"],
      },
    );
    if (!session.line_items || session.line_items.has_more) {
      session.line_items = await provider.checkout.sessions.listLineItems(
        order.checkoutSessionId,
        {
          limit: 100,
          expand: ["data.price.product"],
        },
      );
    }
    return session;
  }

  async function settle(
    order: CheckoutReservation,
    session: Stripe.Checkout.Session,
    eventId: string,
  ) {
    if (
      !validSession(session, order, order.checkoutSessionId ?? "") ||
      !validLines(session, order)
    ) {
      return quarantine(order, "checkout_session_mismatch");
    }
    if (session.status === "complete" && session.payment_status === "paid") {
      const intent = session.payment_intent;
      const paymentIntentId = typeof intent === "string" ? intent : intent?.id;
      if (
        !paymentIntentId ||
        !/^pi_[a-zA-Z0-9_]{1,240}$/.test(paymentIntentId) ||
        (intent && typeof intent !== "string" && intent.livemode !== false)
      )
        return quarantine(order, "checkout_payment_mismatch");
      const result = await persistence.applyCheckoutPayment(pool, {
        eventId,
        orderId: order.id,
        sessionId: session.id,
        paymentIntentId,
        totalMinor: order.totalMinor,
        currency: "USD",
      });
      return { result };
    }
    if (session.status === "expired" && session.payment_status === "unpaid") {
      const result = await persistence.releaseExpiredCheckout(pool, {
        eventId,
        orderId: order.id,
        sessionId: session.id,
      });
      return { result };
    }
    return quarantine(order, "checkout_unconfirmed_state");
  }

  return {
    async createCheckout(input: unknown): Promise<{ checkoutUrl: string }> {
      const intent = validateCheckoutIntent(input);
      const order = await persistence.reserveCheckout(
        pool,
        intent,
        config.locationKey,
      );
      if (
        !validReservation(order) ||
        order.locationKey !== config.locationKey
      ) {
        await quarantine(order, "checkout_reservation_mismatch");
        throw unavailable();
      }
      if (!["creating", "open"].includes(order.state)) {
        throw new CheckoutBoundaryError(
          "CHECKOUT_CONFLICT",
          409,
          "This intent cannot start another payment. Contact the operator if unresolved.",
        );
      }
      if (order.checkoutSessionId) {
        try {
          const existing = await retrieve(order);
          if (
            !existing ||
            !validSession(existing, order, order.checkoutSessionId) ||
            !validLines(existing, order) ||
            existing.status !== "open" ||
            existing.payment_status !== "unpaid" ||
            existing.expires_at <= now() / 1000 ||
            !checkoutUrl(existing)
          ) {
            await quarantine(order, "checkout_existing_session_unavailable");
            throw unavailable();
          }
          return { checkoutUrl: checkoutUrl(existing)! };
        } catch {
          throw unavailable();
        }
      }
      const expiresAt = Math.floor(Date.parse(order.checkoutExpiresAt) / 1000);
      // A safety margin prevents crossing Stripe's 30-minute minimum in transit.
      if (expiresAt - now() / 1000 < 1860 || expiresAt - now() / 1000 > 86400) {
        await quarantine(order, "checkout_creation_window_elapsed");
        throw unavailable();
      }
      let reason = "checkout_create_uncertain";
      try {
        const session = await provider.checkout.sessions.create(
          {
            mode: "payment",
            payment_method_types: ["card"],
            client_reference_id: order.id,
            metadata: { app: "the-true-hive", orderId: order.id },
            payment_intent_data: {
              metadata: { app: "the-true-hive", orderId: order.id },
            },
            expires_at: expiresAt,
            success_url: `${config.siteOrigin}/checkout/return`,
            cancel_url: `${config.siteOrigin}/checkout/cancel`,
            allow_promotion_codes: false,
            automatic_tax: { enabled: false },
            line_items: [...order.lines]
              .sort((a, b) => (a.variantKey < b.variantKey ? -1 : 1))
              .map((line) => ({
                quantity: line.quantity,
                price_data: {
                  currency: "usd",
                  unit_amount: line.priceMinor,
                  product_data: {
                    name: lineName(line),
                    metadata: {
                      app: "the-true-hive",
                      variantKey: line.variantKey,
                    },
                  },
                },
              })),
          },
          { idempotencyKey: order.id },
        );
        reason = "checkout_create_mismatch";
        if (
          !validSession(session, order, session.id) ||
          session.status !== "open" ||
          session.payment_status !== "unpaid" ||
          !checkoutUrl(session)
        )
          throw unavailable();
        reason = "checkout_attach_uncertain";
        await persistence.attachCheckoutSession(
          pool,
          order.id,
          session.id,
          order.checkoutExpiresAt,
        );
        return { checkoutUrl: checkoutUrl(session)! };
      } catch {
        try {
          await quarantine(order, reason);
        } catch {
          // Never acknowledge an uncertain database write or release its hold.
        }
        throw unavailable();
      }
    },
    async handleWebhook(
      raw: Uint8Array,
      signature: string,
    ): Promise<{ result: string }> {
      if (raw.byteLength > STRIPE_WEBHOOK_LIMIT) {
        throw new CheckoutBoundaryError(
          "BODY_TOO_LARGE",
          413,
          "The request body is too large.",
        );
      }
      let event: Stripe.Event;
      try {
        if (!signature || signature.length > 2048) throw new Error();
        event = provider.webhooks.constructEvent(
          raw,
          signature,
          config.webhookSecret,
          300,
          undefined,
          now(),
        );
      } catch {
        throw new CheckoutBoundaryError(
          "INVALID_SIGNATURE",
          400,
          "Invalid Stripe signature.",
        );
      }
      if (
        !["checkout.session.completed", "checkout.session.expired"].includes(
          event.type,
        )
      ) {
        if (event.livemode !== false) {
          throw new CheckoutBoundaryError(
            "INVALID_MODE",
            400,
            "Only Stripe test-mode events are accepted.",
          );
        }
        return { result: "ignored" };
      }
      try {
        const object = record(event.data?.object);
        const metadata = record(object?.["metadata"]);
        const id = metadata?.["orderId"];
        if (
          !isUuid(id) ||
          typeof event.id !== "string" ||
          !/^evt_[a-zA-Z0-9_]{1,240}$/.test(event.id)
        )
          throw unavailable();
        const order = await persistence.getCheckoutReservation(pool, id);
        if (!order) throw unavailable();
        if (
          event.livemode !== false ||
          event.account ||
          event.context ||
          event.api_version !== STRIPE_API_VERSION ||
          !object ||
          !validSession(
            object as unknown as Stripe.Checkout.Session,
            order,
            order.checkoutSessionId ?? "",
          )
        )
          return await quarantine(order, "checkout_event_association_mismatch");
        const session = await retrieve(order);
        if (!session)
          return await quarantine(order, "checkout_session_unknown");
        return await settle(order, session, event.id);
      } catch {
        throw unavailable();
      }
    },
    async reconcilePending(limit = 25) {
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
        throw new CheckoutBoundaryError(
          "INVALID_BATCH",
          400,
          "Use a batch size from 1–100.",
        );
      }
      const orders = await persistence.listPendingCheckoutReservations(
        pool,
        limit,
      );
      if (orders.length > limit) throw unavailable();
      const summary = {
        checked: 0,
        settled: 0,
        pending: 0,
        quarantined: 0,
        failed: 0,
      };
      for (const order of orders) {
        summary.checked++;
        try {
          let session = await retrieve(order);
          if (!session) {
            await quarantine(order, "checkout_session_unknown");
            summary.quarantined++;
            continue;
          }
          if (
            !validSession(session, order, order.checkoutSessionId ?? "") ||
            !validLines(session, order)
          ) {
            await quarantine(order, "checkout_session_mismatch");
            summary.quarantined++;
            continue;
          }
          if (
            session.status === "open" &&
            session.payment_status === "unpaid"
          ) {
            if (now() < Date.parse(order.checkoutExpiresAt)) {
              summary.pending++;
              continue;
            }
            try {
              await provider.checkout.sessions.expire(session.id);
            } catch {
              // An expiry conflict/timeout can race payment; only a new read decides.
            }
            session = await retrieve(order);
            if (!session) throw unavailable();
          }
          const action =
            session.status === "complete" && session.payment_status === "paid"
              ? "paid"
              : "expired";
          const eventId = `reconcile_${createHash("sha256").update(`${session.id}:${action}`).digest("hex")}`;
          const outcome = await settle(order, session, eventId);
          if (["paid", "expired", "already_processed"].includes(outcome.result))
            summary.settled++;
          else summary.quarantined++;
        } catch {
          summary.failed++;
          try {
            await quarantine(order, "checkout_reconciliation_uncertain");
          } catch {
            // The failure is reported; no release is inferred from an outage.
          }
        }
      }
      return summary;
    },
  };
}

export type CheckoutServices = ReturnType<typeof createCheckoutServices>;

export function createStripeProvider(config: StripeTestConfig): Stripe {
  return new Stripe(config.secretKey, {
    apiVersion: STRIPE_API_VERSION,
    timeout: 5_000,
    maxNetworkRetries: 1,
    telemetry: false,
  });
}

export async function getCheckoutServices(): Promise<CheckoutServices> {
  const config = readCheckoutConfig();
  if (config.mode !== "stripe-test") throw unavailable();
  const [persistence, { getAdminPool }] = await Promise.all([
    import("./orders.ts"),
    import("../admin/pool.ts"),
  ]);
  return createCheckoutServices({
    config,
    persistence,
    pool: getAdminPool(),
    provider: createStripeProvider(config),
  });
}
