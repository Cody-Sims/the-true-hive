export type ProductCategory = "soap" | "honey" | "candles" | "gifts";
export type ProductImage = "soap" | "honey" | "candle";

export interface ProductVariant {
  key: string;
  label: string;
  priceMinor: number | null;
  currency: "USD";
}

export interface Product {
  key: string;
  slug: string;
  title: string;
  summary: string;
  details: string[];
  category: ProductCategory;
  imageKey: ProductImage;
  kind: "concept" | "active";
  variants: ProductVariant[];
}

export interface Catalog {
  source: "showcase" | "database";
  products: Product[];
}

export interface Availability {
  variantKey: string;
  locationKey: string;
  state: "concept" | "available" | "out_of_stock" | "not_offered";
}
