export interface InquiryInput {
  name: string;
  email: string;
  type: string;
  message: string;
}

export type InquiryErrors = Partial<
  Record<keyof InquiryInput | "form", string>
>;
export type InquiryDraft =
  { ok: true; url: string } | { ok: false; errors: InquiryErrors };

export const INQUIRY_EMAIL = "loganstakely18@gmail.com";
export const INQUIRY_LIMITS = { name: 80, email: 120, message: 600, uri: 2000 };
export const INQUIRY_TYPES = [
  {
    value: "general",
    label: "General / products",
    subject: "General / products",
  },
  {
    value: "colony-removal",
    label: "Colony removal",
    subject: "Colony removal",
  },
  {
    value: "farm-pollination",
    label: "Farm pollination",
    subject: "Farm pollination",
  },
] as const;

const invalidText =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]|\p{Surrogate}/u;
const singleLineControls = /[\r\n\t]/;
const emailPattern =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)+$/;

export function buildInquiryDraft(input: InquiryInput): InquiryDraft {
  const errors: InquiryErrors = {};
  if (
    !input.name.trim() ||
    input.name.length > INQUIRY_LIMITS.name ||
    invalidText.test(input.name) ||
    singleLineControls.test(input.name)
  ) {
    errors.name = `Enter your name on one line (${INQUIRY_LIMITS.name} characters maximum).`;
  }
  if (
    input.email.length > INQUIRY_LIMITS.email ||
    !emailPattern.test(input.email) ||
    invalidText.test(input.email) ||
    singleLineControls.test(input.email)
  ) {
    errors.email = `Enter a valid reply-to email (${INQUIRY_LIMITS.email} characters maximum).`;
  }
  const type = INQUIRY_TYPES.find((option) => option.value === input.type);
  if (!type) errors.type = "Choose an inquiry type.";
  if (
    !input.message.trim() ||
    input.message.length > INQUIRY_LIMITS.message ||
    invalidText.test(input.message)
  ) {
    errors.message = `Enter a plain-text message (${INQUIRY_LIMITS.message} characters maximum), without unsupported control characters.`;
  }
  if (Object.keys(errors).length || !type) return { ok: false, errors };

  const body =
    `Name: ${input.name}\nReply-to email: ${input.email}\nInquiry: ${type.label}\n\nMessage:\n${input.message}`.replace(
      /\r\n|\r|\n/g,
      "\r\n",
    );
  // Visitor content stays in the encoded body, never in mail headers.
  const url = `mailto:${INQUIRY_EMAIL}?subject=${encodeURIComponent(`The True Hive — ${type.subject} inquiry`)}&body=${encodeURIComponent(body)}`;
  if (url.length > INQUIRY_LIMITS.uri) {
    return {
      ok: false,
      errors: {
        form: "This draft is too long for a reliable email link. Nothing was opened. Shorten it, or copy all your details into an email using the address below.",
      },
    };
  }
  return { ok: true, url };
}
