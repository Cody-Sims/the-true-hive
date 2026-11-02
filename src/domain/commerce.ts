import type { AdminOrderLine, AdminOrderState } from "./admin.ts";

export interface CheckoutReservation {
  id: string;
  state: AdminOrderState;
  locationKey: string;
  totalMinor: number;
  currency: "USD";
  lines: AdminOrderLine[];
  checkoutSessionId: string | null;
  checkoutExpiresAt: string;
  requestHash: string;
  createdAt: string;
}

export interface CheckoutPayment {
  eventId: string;
  orderId: string;
  sessionId: string;
  paymentIntentId: string | null;
  totalMinor: number;
  currency: "USD";
}

export interface CheckoutExpiry {
  eventId: string;
  orderId: string;
  sessionId: string;
}

export type CheckoutSettlement =
  "paid" | "expired" | "already_processed" | "reconciliation_required";
