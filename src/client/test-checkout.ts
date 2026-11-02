for (const form of document.querySelectorAll<HTMLFormElement>(
  "[data-test-checkout]",
)) {
  const fields = form.querySelector<HTMLFieldSetElement>(
    "[data-checkout-fields]",
  )!;
  const submit = form.querySelector<HTMLButtonElement>(
    'button[type="submit"]',
  )!;
  const retry = form.querySelector<HTMLButtonElement>("[data-checkout-retry]")!;
  const status = form.querySelector<HTMLElement>("[data-checkout-status]")!;
  let body: string | null = null;
  let phase: "idle" | "pending" | "uncertain" | "redirecting" = "idle";

  function state(next: typeof phase, message: string) {
    phase = next;
    form.dataset.phase = next;
    form.setAttribute("aria-busy", String(next === "pending"));
    fields.disabled = next !== "idle";
    submit.disabled = next !== "idle";
    retry.hidden = next !== "uncertain";
    status.textContent = message;
    if (next !== "pending") status.focus();
  }

  async function send() {
    if (!body || phase === "pending" || phase === "redirecting") return;
    state(
      "pending",
      "Verifying this test checkout with the server. No payment or reservation success is assumed.",
    );
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        mode: "same-origin",
        credentials: "same-origin",
        redirect: "error",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body,
        signal: controller.signal,
      });
      const result = (await response.json()) as {
        checkoutUrl?: string;
        error?: { message?: string };
      };
      if (!response.ok) {
        if (response.status === 429 || response.status >= 500)
          throw new Error("Outcome unverified.");
        body = null;
        state(
          "idle",
          (
            result.error?.message ??
            "Test checkout was rejected. Review the selection and current availability before another intent."
          ).slice(0, 500),
        );
        return;
      }
      const url = new URL(result.checkoutUrl ?? "");
      if (
        url.protocol !== "https:" ||
        url.hostname !== "checkout.stripe.com" ||
        url.port ||
        url.username ||
        url.password
      ) {
        throw new Error("Hosted checkout URL could not be verified.");
      }
      state(
        "redirecting",
        "Opening hosted Stripe test checkout. This does not confirm payment.",
      );
      window.location.assign(url.href);
    } catch {
      state(
        "uncertain",
        "Test checkout outcome is unverified. A hold may exist. Retry the same unchanged intent; leaving or cancelling this page does not release stock.",
      );
    } finally {
      window.clearTimeout(timer);
    }
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (phase !== "idle" || !form.reportValidity()) return;
    const data = new FormData(form);
    const raw = String(data.get("quantity") ?? "");
    const quantity = Number(raw);
    const variantKey = String(data.get("variantKey") ?? "");
    if (
      !/^\d+$/.test(raw) ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 100 ||
      !/^[a-z0-9][a-z0-9-]{0,79}$/.test(variantKey)
    ) {
      state(
        "idle",
        "Choose an offered variant and a whole quantity from 1 to 100.",
      );
      return;
    }
    body = JSON.stringify({
      operationId: crypto.randomUUID(),
      lines: [{ variantKey, quantity }],
    });
    void send();
  });
  retry.addEventListener("click", () => {
    if (phase === "uncertain") void send();
  });
}
