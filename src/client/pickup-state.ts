import type {
  PickupMutationReceipt,
  PickupSiteImpact,
} from "../domain/pickup.ts";

type Fetcher = (url: string, init: RequestInit) => Promise<Response>;
type Frozen = Readonly<{
  path: string;
  body: string;
  operationId: string;
  resourceKey: string;
}>;
export type PickupRejection = {
  code: string;
  message: string;
  impact?: PickupSiteImpact;
};
export type WriteResult =
  | { kind: "blocked" | "uncertain" }
  | { kind: "rejected"; error: PickupRejection }
  | { kind: "confirmed"; receipt: PickupMutationReceipt };

export function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
export function revision(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function safePath(path: string) {
  if (
    !/^\/api\/(?:admin\/)?pickup(?:\/[a-zA-Z0-9_%.-]+)*(\?[^#]*)?$/.test(path)
  )
    throw new Error("Only same-origin pickup requests are allowed.");
}

async function bounded<T>(
  action: (signal: AbortSignal) => Promise<T>,
  milliseconds: number,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      action(controller.signal),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error("Pickup request timed out."));
        }, milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function readJson(response: Response): Promise<unknown> {
  if (!response.headers.get("content-type")?.includes("application/json"))
    throw new Error("Pickup returned an unreadable response.");
  const text = await response.text();
  if (text.length > 8_000_000) throw new Error("Pickup response is too large.");
  return JSON.parse(text) as unknown;
}

export async function pickupRead(path: string, fetcher: Fetcher = fetch) {
  safePath(path);
  return bounded(async (signal) => {
    const response = await fetcher(path, {
      credentials: "same-origin",
      mode: "same-origin",
      cache: "no-store",
      redirect: "error",
      headers: { Accept: "application/json" },
      signal,
    });
    const value = await readJson(response);
    if (!response.ok) {
      const error =
        record(value) && record(value["error"]) ? value["error"] : {};
      throw new Error(
        response.status === 401
          ? path.startsWith("/api/admin/")
            ? "Your verified inventory session has expired. Sign in again before managing pickup records."
            : "Buyer access is unavailable in this browser. Use the same browser as checkout, or contact the shop for help. A public order number cannot restore access."
          : typeof error["message"] === "string"
            ? error["message"]
            : "Pickup records are unavailable. Refresh to try again.",
      );
    }
    return value;
  }, 15_000);
}

export class PickupWriter {
  #intent: Frozen | null = null;
  #pending = false;
  #fetcher: Fetcher;
  #timeout: number;
  constructor(fetcher: Fetcher = fetch, timeout = 15_000) {
    this.#fetcher = fetcher;
    this.#timeout = timeout;
  }
  get frozen(): Frozen | null {
    return this.#intent;
  }
  async send(
    path: string,
    payload: Record<string, unknown>,
    resourceKey: string,
    csrf: string,
  ): Promise<WriteResult> {
    if (this.#intent || this.#pending) return { kind: "blocked" };
    safePath(path);
    if (!csrf || typeof payload["operationId"] !== "string")
      throw new Error(
        "Refresh your verified pickup session before continuing.",
      );
    this.#intent = Object.freeze({
      path,
      body: JSON.stringify(payload),
      operationId: payload["operationId"],
      resourceKey,
    });
    return this.retry(csrf);
  }
  async retry(csrf: string): Promise<WriteResult> {
    const intent = this.#intent;
    if (!intent || this.#pending || !csrf) return { kind: "blocked" };
    this.#pending = true;
    try {
      const result = await bounded(async (signal): Promise<WriteResult> => {
        const fetcher = this.#fetcher;
        const response = await fetcher(intent.path, {
          method: intent.path.startsWith("/api/admin/pickup/sites/")
            ? "PUT"
            : "POST",
          credentials: "same-origin",
          mode: "same-origin",
          cache: "no-store",
          redirect: "error",
          signal,
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            [intent.path.startsWith("/api/admin/")
              ? "X-CSRF-Token"
              : "X-Pickup-CSRF"]: csrf,
          },
          body: intent.body,
        });
        const value = await readJson(response);
        if (
          (response.status === 400 || response.status === 409) &&
          record(value) &&
          record(value["error"]) &&
          typeof value["error"]["code"] === "string" &&
          typeof value["error"]["message"] === "string"
        ) {
          return { kind: "rejected", error: value["error"] as PickupRejection };
        }
        if (!response.ok || !validReceipt(value, intent))
          return { kind: "uncertain" };
        return { kind: "confirmed", receipt: value };
      }, this.#timeout);
      if (result.kind === "confirmed" || result.kind === "rejected")
        this.#intent = null;
      return result;
    } catch {
      return { kind: "uncertain" };
    } finally {
      this.#pending = false;
    }
  }
}

function validReceipt(
  value: unknown,
  intent: Frozen,
): value is PickupMutationReceipt {
  if (
    !record(value) ||
    value["operationId"] !== intent.operationId ||
    value["resourceKey"] !== intent.resourceKey ||
    !revision(value["revision"]) ||
    typeof value["replayed"] !== "boolean"
  )
    return false;
  const payload = JSON.parse(intent.body) as Record<string, unknown>;
  if (
    typeof payload["expectedRevision"] === "number" &&
    value["revision"] !== payload["expectedRevision"] + 1
  )
    return false;
  if (intent.path.endsWith("/booking")) {
    const booking = value["booking"];
    if (
      !record(booking) ||
      booking["orderId"] !== payload["orderId"] ||
      booking["siteKey"] !== payload["siteKey"] ||
      booking["status"] !== "scheduled" ||
      booking["revision"] !== value["revision"] ||
      !Number.isFinite(Date.parse(String(booking["startsAt"]))) ||
      !Number.isFinite(Date.parse(String(booking["endsAt"]))) ||
      typeof booking["id"] !== "string"
    )
      return false;
    if (
      value["revision"] !==
      Number(payload["expectedBookingRevision"] ?? 0) + 1
    )
      return false;
  }
  return true;
}

export function siteDate(zone: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (name: string) =>
    parts.find((item) => item.type === name)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function pickupTime(instant: string, timezone: string): string {
  return (
    new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      dateStyle: "medium",
      timeStyle: "long",
    }).format(new Date(instant)) +
    " · " +
    new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      timeZoneName: "longOffset",
    })
      .formatToParts(new Date(instant))
      .find((part) => part.type === "timeZoneName")!.value
  );
}
