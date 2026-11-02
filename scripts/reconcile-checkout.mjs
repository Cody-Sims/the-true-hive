import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { readCheckoutConfig } from "../src/server/commerce/config.ts";
import {
  createCheckoutServices,
  createStripeProvider,
} from "../src/server/commerce/stripe.ts";

/** @param {import("../src/server/commerce/config.ts").StripeTestConfig} config */
async function openRuntime(config) {
  const [persistence, { getAdminPool }] = await Promise.all([
    import("../src/server/commerce/orders.ts"),
    import("../src/server/admin/pool.ts"),
  ]);
  const pool = getAdminPool();
  return {
    services: createCheckoutServices({
      config,
      persistence,
      pool,
      provider: createStripeProvider(config),
    }),
    close: () => pool.end(),
  };
}

/**
 * @param {{ environment?: NodeJS.ProcessEnv, openRuntime?: (config: import("../src/server/commerce/config.ts").StripeTestConfig) => Promise<{ services: Pick<import("../src/server/commerce/stripe.ts").CheckoutServices, "reconcilePending">, close: () => Promise<void> }> }} [options]
 */
export async function runCheckoutReconciliation(options = {}) {
  const environment = options.environment ?? process.env;
  const config = readCheckoutConfig(environment);
  if (config.mode !== "stripe-test") {
    throw new Error("Checkout reconciliation is not configured.");
  }
  const value = environment["RECONCILE_CHECKOUT_LIMIT"] ?? "25";
  if (!/^[1-9][0-9]{0,2}$/.test(value) || Number(value) > 100) {
    throw new Error("Use a reconciliation batch size from 1–100.");
  }
  const runtime = await (options.openRuntime ?? openRuntime)(config);
  try {
    return await runtime.services.reconcilePending(Number(value));
  } finally {
    await runtime.close();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    if (process.argv.length !== 2) {
      throw new Error("Use private environment configuration, not arguments.");
    }
    const summary = await runCheckoutReconciliation();
    console.log(JSON.stringify(summary));
    if (summary.failed > 0) process.exitCode = 1;
  } catch {
    console.error(
      "Checkout reconciliation failed. Uncertain holds require operator review.",
    );
    process.exitCode = 1;
  }
}
