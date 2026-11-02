export class HttpInputError extends Error {
  readonly code: "BODY_TOO_LARGE" | "INVALID_JSON" | "INVALID_BODY";
  readonly status: number;
  constructor(
    code: "BODY_TOO_LARGE" | "INVALID_JSON" | "INVALID_BODY",
    status: number,
  ) {
    super("The request body is invalid.");
    this.code = code;
    this.status = status;
  }
}

export async function readRawBody(
  request: Request,
  maxBytes = 65536,
): Promise<Buffer> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1)
    throw new HttpInputError("INVALID_BODY", 400);
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > maxBytes)) {
    await request.body?.cancel().catch(() => {});
    throw new HttpInputError("BODY_TOO_LARGE", 413);
  }
  if (!request.body) return Buffer.alloc(0);
  const reader = request.body.getReader();
  const chunks: Buffer[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new HttpInputError("BODY_TOO_LARGE", 413);
      }
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks, bytes);
  } catch (error) {
    if (error instanceof HttpInputError) throw error;
    await reader.cancel().catch(() => {});
    throw new HttpInputError("INVALID_BODY", 400);
  } finally {
    reader.releaseLock();
  }
}

export async function readJsonBody(
  request: Request,
  maxBytes = 65536,
): Promise<unknown> {
  const raw = await readRawBody(request, maxBytes);
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw));
  } catch {
    throw new HttpInputError("INVALID_JSON", 400);
  }
}
