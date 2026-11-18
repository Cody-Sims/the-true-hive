// Only editable content belongs here. Immutable variant identities are supplied
// by the server baseline, never by browser storage.
export const draftTextLimits = {
  key: 80,
  slug: 80,
  title: 160,
  summary: 1000,
  details: 24011,
  ingredients: 16039,
  category: 16,
  imageKey: 16,
  kind: 16,
} as const;
export type DraftFields = Record<keyof typeof draftTextLimits, string>;
export type DraftVariant = {
  baselineIndex: number | null;
  label: string;
  price: string;
  active: boolean;
};
export type EditableDraft = {
  version: 1;
  kind: "editable";
  baseRevision: number | null;
  updatedAt: number;
  fields: DraftFields;
  variants: DraftVariant[];
};
export type SafetyDraft = {
  version: 1;
  kind: "safety";
  baseRevision: number | null;
  updatedAt: number;
};
export type LocalDraft = EditableDraft | SafetyDraft;
const maxLength = 65536;
const lifetime = 30 * 24 * 60 * 60 * 1000;

export function decodeDraft(
  raw: string,
  now = Date.now(),
  allowExpired = false,
): LocalDraft {
  if (raw.length > maxLength)
    throw new Error("The stored draft is too large for bounded recovery.");
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("The stored draft is corrupt or unreadable.");
  }
  if (!value || typeof value !== "object")
    throw new Error("The stored draft is corrupt.");
  const record = value as Record<string, unknown>;
  if (record.version !== 1)
    throw new Error(
      "This draft uses an unsupported or newer version. It has not been applied.",
    );
  const revision = record.baseRevision;
  if (
    revision !== null &&
    (!Number.isSafeInteger(revision) || (revision as number) < 1)
  )
    throw new Error("The stored draft revision is corrupt.");
  if (
    typeof record.updatedAt !== "number" ||
    !Number.isSafeInteger(record.updatedAt) ||
    record.updatedAt > now + 60000
  )
    throw new Error("The stored draft date is invalid or in the future.");
  const base = {
    version: 1 as const,
    baseRevision: revision as number | null,
    updatedAt: record.updatedAt,
  };
  // An unresolved mutation never expires into permission to send another one.
  if (record.kind === "safety") return { ...base, kind: "safety" };
  if (
    record.kind !== "editable" ||
    (!allowExpired && now - record.updatedAt > lifetime)
  )
    throw new Error(
      "The stored draft is expired or unreadable. Review server values and discard it.",
    );
  if (
    !record.fields ||
    typeof record.fields !== "object" ||
    !Array.isArray(record.variants) ||
    record.variants.length > 50
  )
    throw new Error("The stored editable draft is corrupt.");
  const fields = {} as DraftFields;
  for (const [name, limit] of Object.entries(draftTextLimits)) {
    const text = (record.fields as Record<string, unknown>)[name];
    if (typeof text !== "string" || text.length > limit)
      throw new Error("The stored editable text exceeds its bounded limits.");
    fields[name as keyof DraftFields] = text;
  }

  const seen = new Set<number>();
  const variants = record.variants.map((entry: unknown): DraftVariant => {
    if (!entry || typeof entry !== "object")
      throw new Error("The stored variant is corrupt.");
    const row = entry as Record<string, unknown>;
    const index = row.baselineIndex;
    if (
      index !== null &&
      (!Number.isInteger(index) ||
        (index as number) < 0 ||
        (index as number) >= 50 ||
        seen.has(index as number))
    )
      throw new Error("The stored variant reference is corrupt.");
    if (index !== null) seen.add(index as number);
    if (
      typeof row.label !== "string" ||
      row.label.length > 160 ||
      typeof row.price !== "string" ||
      row.price.length > 32 ||
      typeof row.active !== "boolean"
    )
      throw new Error("The stored variant text is corrupt.");
    return {
      baselineIndex: index as number | null,
      label: row.label,
      price: row.price,
      active: row.active,
    };
  });
  return { ...base, kind: "editable", fields, variants };
}

export function encodeDraft(draft: LocalDraft) {
  // Project through the allowlist even when a caller passes additional data.
  const raw = JSON.stringify(draft);
  return JSON.stringify(decodeDraft(raw));
}

export function reserveDraftSlot(
  storage: Storage,
  key: string,
  now = Date.now(),
) {
  const prefix = key.slice(0, key.lastIndexOf(":") + 1);
  const accountKeys = Array.from({ length: storage.length }, (_, index) =>
    storage.key(index)!,
  ).filter((entry) => entry.startsWith(prefix));
  const editable: { key: string; updatedAt: number }[] = [];
  let count = accountKeys.length;
  for (const candidate of accountKeys) {
    if (candidate === key) continue;
    try {
      const draft = decodeDraft(storage.getItem(candidate)!, now, true);
      if (draft.kind !== "editable") continue;
      if (now - draft.updatedAt > lifetime) {
        storage.removeItem(candidate);
        count--;
      } else editable.push({ key: candidate, updatedAt: draft.updatedAt });
    } catch {
      /* Unknown versions and safety evidence are never silently removed. */
    }
  }
  const limit = accountKeys.includes(key) ? 12 : 11;
  editable.sort((left, right) => left.updatedAt - right.updatedAt);
  for (const candidate of editable) {
    if (count <= limit) break;
    storage.removeItem(candidate.key);
    count--;
  }
  if (count > limit)
    throw new Error(
      "The local recovery limit is occupied by unresolved or unreadable records. Review and clear them before starting another operation.",
    );
}
