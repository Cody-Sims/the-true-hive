import type { ProductCategory } from "./catalog.ts";

export interface AdminActor {
  uid: string;
  actorId: string;
}

export interface AdminLocation {
  key: string;
  name: string;
  publicLabel: string | null;
  active: boolean;
  pickupEnabled: boolean;
  revision: number;
}

export interface AdminInventoryLevel {
  variantKey: string;
  locationKey: string;
  onHand: number;
  held: number;
  committed: number;
  unavailable: number;
  sellable: number;
  revision: number;
}

export interface AdminVariant {
  key: string;
  sku: string;
  label: string;
  priceMinor: number | null;
  currency: "USD";
  active: boolean;
  levels: AdminInventoryLevel[];
}

export interface AdminProduct {
  key: string;
  slug: string;
  title: string;
  summary: string;
  details: string[];
  category: ProductCategory;
  imageKey: "soap" | "honey" | "candle";
  kind: "draft" | "concept" | "active";
  status: "draft" | "published" | "archived";
  revision: number;
  variants: AdminVariant[];
}

export interface AdminOrderLine {
  variantKey: string;
  title: string;
  label: string;
  quantity: number;
  priceMinor: number;
}

export type AdminOrderState =
  | "creating"
  | "open"
  | "paid"
  | "expired"
  | "picked_up"
  | "reconciliation_required";

export interface AdminOrder {
  id: string;
  state: AdminOrderState;
  locationKey: string;
  totalMinor: number;
  currency: "USD";
  revision: number;
  createdAt: string;
  paidAt: string | null;
  pickedUpAt: string | null;
  reconciliationReason: string | null;
  lines: AdminOrderLine[];
}

export interface AdminMovement {
  operationId: string;
  variantKey: string;
  locationKey: string;
  delta: number;
  actorId: string;
  reason: string;
  beforeOnHand: number;
  onHand: number;
  createdAt: string;
}
