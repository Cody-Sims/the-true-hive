import {
  CART_STORAGE_KEY,
  parseCart,
  serializeCart,
  type CartLine,
} from "../domain/cart.ts";

type CartStorage = Pick<Storage, "getItem" | "setItem">;

export function readStoredCart(storage: () => CartStorage) {
  try {
    return {
      ...parseCart(storage().getItem(CART_STORAGE_KEY)),
      persistent: true,
    };
  } catch {
    return { ...parseCart(null), persistent: false };
  }
}

export function saveStoredCart(
  storage: () => CartStorage,
  lines: CartLine[],
): boolean {
  try {
    storage().setItem(CART_STORAGE_KEY, serializeCart(lines));
    return true;
  } catch {
    return false;
  }
}
