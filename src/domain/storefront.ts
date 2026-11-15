export interface StoreSettings {
  purchasesEnabled: boolean;
  revision: number;
}

export interface StoreSettingsReceipt {
  settings: StoreSettings;
  replayed: boolean;
}

export interface StorefrontStatus {
  purchasesEnabled: boolean;
  checkoutEnabled: boolean;
  state: "open" | "closed" | "unconfigured" | "unavailable";
}
