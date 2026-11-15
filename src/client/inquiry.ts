import { buildInquiryDraft } from "./inquiry-draft.ts";

for (const form of document.querySelectorAll<HTMLFormElement>(
  "[data-inquiry-form]",
)) {
  const name = form.querySelector<HTMLInputElement>('[name="name"]');
  const email = form.querySelector<HTMLInputElement>('[name="email"]');
  const type = form.querySelector<HTMLSelectElement>('[name="type"]');
  const message = form.querySelector<HTMLTextAreaElement>('[name="message"]');
  const status = form.querySelector<HTMLElement>("[data-inquiry-status]");
  const draft = form.querySelector<HTMLAnchorElement>("[data-inquiry-draft]");
  if (!name || !email || !type || !message || !status || !draft) continue;

  const fields = { name, email, type, message };
  const clearDraft = () => {
    draft.hidden = true;
    draft.removeAttribute("href");
    status.textContent = "";
  };
  form.addEventListener("input", clearDraft);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    clearDraft();
    for (const [key, field] of Object.entries(fields)) {
      field.removeAttribute("aria-invalid");
      const error = form.querySelector<HTMLElement>(`[data-error="${key}"]`);
      if (error) error.textContent = "";
    }
    const result = buildInquiryDraft({
      name: name.value,
      email: email.value,
      type: type.value,
      message: message.value,
    });
    if (!result.ok) {
      for (const [key, field] of Object.entries(fields)) {
        const errorMessage = result.errors[key as keyof typeof fields];
        if (!errorMessage) continue;
        field.setAttribute("aria-invalid", "true");
        const error = form.querySelector<HTMLElement>(`[data-error="${key}"]`);
        if (error) error.textContent = errorMessage;
      }
      status.textContent =
        result.errors.form ??
        "Please check the marked fields. Nothing has been sent or opened.";
      const firstInvalid = Object.values(fields).find(
        (field) => field.getAttribute("aria-invalid") === "true",
      );
      (firstInvalid ?? status).focus();
      return;
    }
    draft.href = result.url;
    draft.hidden = false;
    status.textContent =
      "Email draft requested, not sent. Review and send it in your email app. If nothing opens, use the email address below to write manually. No booking or availability is confirmed.";
    draft.click();
  });
  form.hidden = false;
}
