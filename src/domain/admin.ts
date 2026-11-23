import type { ProductCategory, ProductPhoto } from "./catalog.ts";

export const TEST_INVENTORY_LOCATION_KEY = "stripe-sandbox-pickup";

export interface AdminActor {
  uid: string;
  actorId: string;
}

export interface AdminDeletionReceipt {
  type: "product" | "variant";
  key: string;
  productKey: string;
  revision: number;
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
  ingredients?: string[];
  category: ProductCategory;
  imageKey: "soap" | "honey" | "candle";
  photo?: ProductPhoto | null;
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
