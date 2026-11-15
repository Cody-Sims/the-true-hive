export type ProductCategory = "soap" | "honey" | "candles" | "gifts";
export type ProductImage = "soap" | "honey" | "candle";

export interface ProductPhoto {
  id: string;
  alt: string;
  width: number;
  height: number;
  bytes: number;
}

export interface ProductVariant {
  key: string;
  label: string;
  priceMinor: number | null;
  currency: "USD";
  stock?: ProductStock;
}

export type ProductStock =
  | { state: "low_stock"; remaining: number }
  | {
      state: "available" | "out_of_stock" | "not_offered" | "unverified";
      remaining?: never;
    };

export interface Product {
  key: string;
  slug: string;
  title: string;
  summary: string;
  details: string[];
  ingredients?: string[];
  category: ProductCategory;
  imageKey: ProductImage;
  photo?: ProductPhoto | null;
  kind: "concept" | "active";
  variants: ProductVariant[];
}

export interface Catalog {
  source: "showcase" | "database";
  products: Product[];
}

export type Availability = {
  variantKey: string;
  locationKey: string;
} & (ProductStock | { state: "concept"; remaining?: never });
