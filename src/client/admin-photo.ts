import type { ProductPhoto } from "../domain/catalog.ts";

type PhotoPhase = "idle" | "pending" | "uncertain" | "conflict" | "confirmed";
type PhotoIntent = Readonly<{
  operationId: string;
  expectedRevision: number;
  action: "upload" | "remove";
  file: File | null;
  alt: string;
}>;
type CurrentPhotoRecord = {
  revision: number;
  title: string;
  status: string;
  photo: ProductPhoto | null;
};
class PhotoSessionRequired extends Error {}

const photoUuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function photoInteger(value: unknown, max = 2147483647): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= max
  );
}

function photoAlt(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    [...value].length <= 300 &&
    !/[\p{Cc}\ud800-\udfff]/u.test(value)
  );
}

function photoObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Unverified photo response.");
  return value as Record<string, unknown>;
}

function verifiedPhoto(value: unknown): ProductPhoto | null {
  if (value === null) return null;
  const photo = photoObject(value);
  if (
    typeof photo.id !== "string" ||
    !photoUuid.test(photo.id) ||
    !photoAlt(photo.alt) ||
    !photoInteger(photo.width, 2048) ||
    !photoInteger(photo.height, 2048) ||
    !photoInteger(photo.bytes, 4 * 1024 * 1024)
  )
    throw new Error("Unverified photo response.");
  return {
    id: photo.id,
    alt: photo.alt,
    width: photo.width,
    height: photo.height,
    bytes: photo.bytes,
  };
}

async function photoRequest(
  path: string,
  method = "GET",
  intent?: PhotoIntent,
) {
  const url = new URL(path, location.origin);
  if (
    url.origin !== location.origin ||
    !/^\/api\/admin\/products\/[a-z0-9][a-z0-9-]{0,79}(?:\/photo)?$/.test(
      url.pathname,
    ) ||
    url.search ||
    url.hash
  )
    throw new Error("Only the same-origin product endpoint is allowed.");
  const csrf = document.querySelector<HTMLMetaElement>(
    'meta[name="csrf-token"]',
  )?.content;
  if (method !== "GET" && !csrf) throw new PhotoSessionRequired();
  const headers: Record<string, string> = { Accept: "application/json" };
  let body: FormData | string | undefined;
  if (intent) {
    headers["X-CSRF-Token"] = csrf!;
    if (intent.action === "upload") {
      const multipart = new FormData();
      multipart.set("operationId", intent.operationId);
      multipart.set("expectedRevision", String(intent.expectedRevision));
      multipart.set("alt", intent.alt);
      multipart.set("file", intent.file!, "product-photo");
      body = multipart;
    } else {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify({
        operationId: intent.operationId,
        expectedRevision: intent.expectedRevision,
      });
    }
  }
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url.href, {
      method,
      headers,
      ...(body === undefined ? {} : { body }),
      credentials: "same-origin",
      mode: "same-origin",
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
    });
    return {
      response,
      body: response.ok ? ((await response.json()) as unknown) : null,
    };
  } finally {
    window.clearTimeout(timeout);
  }
}

async function refreshPhotoCsrf(key: string, endpoint: string) {
  const url = new URL(`/inventory/products/${key}/photo`, location.origin);
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url.href, {
      method: "GET",
      credentials: "same-origin",
      mode: "same-origin",
      cache: "no-store",
      redirect: "error",
      headers: { Accept: "text/html" },
      signal: controller.signal,
    });
    if (
      response.status !== 200 ||
      response.redirected ||
      response.url !== url.href ||
      response.headers
        .get("content-type")
        ?.split(";")[0]
        ?.trim()
        .toLowerCase() !== "text/html"
    )
      throw new PhotoSessionRequired();
    const reader = response.body?.getReader();
    if (!reader) throw new PhotoSessionRequired();
    const decoder = new TextDecoder();
    let markup = "";
    let bytes = 0;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 1024 * 1024) {
        await reader.cancel();
        throw new PhotoSessionRequired();
      }
      markup += decoder.decode(value, { stream: true });
    }
    markup += decoder.decode();
    const shell = new DOMParser().parseFromString(markup, "text/html");
    const editors = shell.querySelectorAll<HTMLFormElement>(
      "form[data-photo-form]",
    );
    const tokens = shell.querySelectorAll<HTMLMetaElement>(
      'head meta[name="csrf-token"]',
    );
    const target = document.querySelector<HTMLMetaElement>(
      'meta[name="csrf-token"]',
    );
    const token = tokens[0]?.content;
    if (
      editors.length !== 1 ||
      editors[0]?.dataset.productKey !== key ||
      editors[0]?.dataset.endpoint !== endpoint ||
      tokens.length !== 1 ||
      !target ||
      !token ||
      !/^v1\.\d{10}\.[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/.test(token)
    )
      throw new PhotoSessionRequired();
    target.content = token;
  } catch {
    throw new PhotoSessionRequired();
  } finally {
    window.clearTimeout(timeout);
  }
}

async function validatePhotoFile(file: File) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error(
      "Choose a still JPG, PNG or WebP. HEIC, SVG, GIF and animation are not supported.",
    );
  if (!file.size || file.size > 8 * 1024 * 1024)
    throw new Error("Choose a nonempty image up to 8 MiB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const ascii = (start: number, length: number) =>
    String.fromCharCode(...bytes.subarray(start, start + length));
  const view = new DataView(bytes.buffer);
  const checkPixels = (width: number, height: number) => {
    if (!width || !height || width * height > 25000000)
      throw new Error(
        "Choose a valid image with at most 25 million decoded pixels.",
      );
  };
  const png =
    bytes.length >= 24 && bytes[0] === 137 && ascii(1, 7) === "PNG\r\n\x1a\n";
  const webp =
    bytes.length >= 20 && ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP";
  const jpeg =
    bytes.length >= 3 &&
    bytes[0] === 255 &&
    bytes[1] === 216 &&
    bytes[2] === 255;
  if (
    !(file.type === "image/png" && png) &&
    !(file.type === "image/webp" && webp) &&
    !(file.type === "image/jpeg" && jpeg)
  )
    throw new Error(
      "Choose a valid JPG, PNG or WebP image, not a renamed file.",
    );
  if (png) {
    if (ascii(12, 4) !== "IHDR") throw new Error("Choose a valid PNG image.");
    checkPixels(view.getUint32(16), view.getUint32(20));
    for (let offset = 8; offset + 12 <= bytes.length;) {
      const length = view.getUint32(offset);
      if (ascii(offset + 4, 4) === "acTL")
        throw new Error("Choose a still image; animation is not supported.");
      offset += 12 + length;
    }
  }
  if (jpeg) {
    for (let offset = 2; offset + 3 < bytes.length;) {
      if (bytes[offset++] !== 255) break;
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++]!;
      if (marker === 0xda || marker === 0xd9 || offset + 2 > bytes.length)
        break;
      if (marker === 1 || (marker >= 0xd0 && marker <= 0xd8)) continue;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) break;
      if (
        length >= 7 &&
        [
          0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd,
          0xce, 0xcf,
        ].includes(marker)
      ) {
        checkPixels(view.getUint16(offset + 5), view.getUint16(offset + 3));
        break;
      }
      offset += length;
    }
  }
  if (webp) {
    for (let offset = 12; offset + 8 <= bytes.length;) {
      const chunk = ascii(offset, 4);
      const length = view.getUint32(offset + 4, true);
      if (offset + 8 + length > bytes.length) break;
      if (
        chunk === "ANIM" ||
        (chunk === "VP8X" && length > 0 && bytes[offset + 8]! & 2)
      )
        throw new Error("Choose a still image; animation is not supported.");
      const dimension24 = (start: number) =>
        bytes[start]! + bytes[start + 1]! * 256 + bytes[start + 2]! * 65536 + 1;
      if (chunk === "VP8X" && length >= 10)
        checkPixels(dimension24(offset + 12), dimension24(offset + 15));
      if (
        chunk === "VP8 " &&
        length >= 10 &&
        ascii(offset + 11, 3) === "\x9d\x01\x2a"
      )
        checkPixels(
          view.getUint16(offset + 14, true) & 0x3fff,
          view.getUint16(offset + 16, true) & 0x3fff,
        );
      if (chunk === "VP8L" && length >= 5 && bytes[offset + 8] === 0x2f) {
        const dimensions = view.getUint32(offset + 9, true);
        checkPixels(
          (dimensions & 0x3fff) + 1,
          ((dimensions >>> 14) & 0x3fff) + 1,
        );
      }
      offset += 8 + length + (length % 2);
    }
  }
}

function decodePhoto(url: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image();
    const finish = (error: string) => {
      clearTimeout(timeout);
      image.onload = null;
      image.onerror = null;
      image.removeAttribute("src");
      reject(new Error(error));
    };
    const timeout = window.setTimeout(
      () =>
        finish("The image could not be decoded in time. Choose another image."),
      5000,
    );
    image.onerror = () =>
      finish("The image could not be decoded. Choose a valid still image.");
    image.onload = () => {
      const { naturalWidth: width, naturalHeight: height } = image;
      if (!width || !height || width * height > 25000000) {
        finish("Choose an image with at most 25 million decoded pixels.");
        return;
      }
      clearTimeout(timeout);
      image.onload = null;
      image.onerror = null;
      image.removeAttribute("src");
      resolve({ width, height });
    };
    image.src = url;
  });
}

function setupPhotoEditor(form: HTMLFormElement) {
  const find = <T extends HTMLElement>(selector: string) =>
    form.querySelector<T>(selector)!;
  const fields = find<HTMLFieldSetElement>("[data-photo-fields]");
  const fileInput = find<HTMLInputElement>('[name="file"]');
  const altInput = find<HTMLInputElement>('[name="alt"]');
  const revisionInput = find<HTMLInputElement>('[name="expectedRevision"]');
  const upload = find<HTMLButtonElement>("[data-photo-upload]");
  const remove = find<HTMLButtonElement>("[data-photo-remove]");
  const removal = find<HTMLElement>("[data-photo-removal]");
  const removeConfirm = find<HTMLInputElement>("[data-photo-remove-confirm]");
  const removeSubmit = find<HTMLButtonElement>("[data-photo-remove-submit]");
  const removeCancel = find<HTMLButtonElement>("[data-photo-remove-cancel]");
  const status = find<HTMLElement>("[data-photo-status]");
  const retry = find<HTMLButtonElement>("[data-photo-retry]");
  const refresh = find<HTMLButtonElement>("[data-photo-refresh]");
  const review = find<HTMLButtonElement>("[data-photo-review]");
  const signin = find<HTMLElement>("[data-photo-signin]");
  const local = find<HTMLElement>("[data-photo-local]");
  const localImage = find<HTMLImageElement>("[data-photo-local-image]");
  const saved = find<HTMLElement>("[data-photo-saved]");
  const savedImage = find<HTMLImageElement>("[data-photo-saved-image]");
  const previewError = find<HTMLElement>("[data-photo-preview-error]");
  const endpoint = form.dataset.endpoint!;
  const key = form.dataset.productKey!;
  if (
    !/^[a-z0-9][a-z0-9-]{0,79}$/.test(key) ||
    endpoint !== `/api/admin/products/${key}`
  )
    return;
  let phase: PhotoPhase = "idle";
  let intent: PhotoIntent | null = null;
  let reviewed: CurrentPhotoRecord | null = null;
  let hasPhoto = !saved.hidden;
  let selected: File | null = null;
  let localUrl: string | null = null;
  let selectionVersion = 0;
  let selecting = false;
  let refreshing = false;
  let minimumRevision = Number(revisionInput.value);
  let sessionRefreshRequired = false;

  function state(next: PhotoPhase, message: string, focus = true) {
    phase = next;
    form.dataset.phase = next;
    form.setAttribute("aria-busy", String(next === "pending" || refreshing));
    fields.disabled = next !== "idle";
    upload.disabled = next !== "idle" || selecting;
    remove.disabled = next !== "idle" || refreshing || selecting;
    removeConfirm.disabled = next !== "idle" || selecting;
    removeCancel.disabled = next !== "idle";
    removeSubmit.disabled =
      next !== "idle" || selecting || !removeConfirm.checked;
    retry.hidden = next !== "uncertain";
    refresh.hidden = next !== "conflict" && next !== "confirmed";
    refresh.disabled = refreshing;
    review.hidden = next !== "conflict" || !reviewed || refreshing;
    status.textContent = message;
    if (focus && next !== "pending") status.focus();
  }

  function clearLocal() {
    local.hidden = true;
    localImage.removeAttribute("src");
    if (localUrl) URL.revokeObjectURL(localUrl);
    localUrl = null;
  }

  function cancelRemoval() {
    removal.hidden = true;
    removeConfirm.checked = false;
    removeSubmit.disabled = true;
  }

  function showCurrent(record: CurrentPhotoRecord) {
    hasPhoto = !!record.photo;
    find<HTMLElement>("[data-photo-current-text]").textContent =
      `${record.title} · ${record.status} · revision ${record.revision}.`;
    saved.hidden = !record.photo;
    previewError.hidden = true;
    if (record.photo) {
      savedImage.alt = record.photo.alt;
      savedImage.width = record.photo.width;
      savedImage.height = record.photo.height;
      savedImage.src = `${endpoint}/photo?revision=${record.revision}`;
    } else {
      savedImage.removeAttribute("src");
      savedImage.alt = "";
    }
    find<HTMLElement>("[data-photo-none]").hidden = !!record.photo;
    upload.textContent = record.photo ? "Replace photo" : "Upload photo";
    remove.hidden = !record.photo;
  }

  async function authoritative(): Promise<CurrentPhotoRecord> {
    const { response, body } = await photoRequest(endpoint);
    if (response.status === 401 || response.status === 403) {
      sessionRefreshRequired = true;
      throw new PhotoSessionRequired();
    }
    if (!response.ok) throw new Error("Current product is unavailable.");
    const product = photoObject(photoObject(body).product);
    if (
      product.key !== key ||
      !photoInteger(product.revision) ||
      product.revision < minimumRevision ||
      typeof product.title !== "string" ||
      !product.title.trim() ||
      product.title.length > 160 ||
      !["draft", "published", "archived"].includes(String(product.status))
    )
      throw new Error("Current product could not be verified.");
    const record = {
      revision: product.revision,
      title: product.title,
      status: String(product.status),
      photo: product.photo === undefined ? null : verifiedPhoto(product.photo),
    };
    minimumRevision = record.revision;
    showCurrent(record);
    return record;
  }

  async function refreshRecord(conflict: boolean) {
    if (refreshing) return;
    reviewed = null;
    refreshing = true;
    signin.hidden = true;
    state(
      conflict ? "conflict" : "confirmed",
      "Refreshing the current product separately.",
    );
    try {
      const current = await authoritative();
      if (conflict) {
        reviewed = current;
        state(
          "conflict",
          "Conflict: review the current server photo and revision above. Your selection and description are preserved. Explicit review is required before a new operation.",
        );
      } else {
        revisionInput.value = String(current.revision);
        intent = null;
        state(
          "idle",
          "Photo receipt confirmed; the current server record was verified separately. Any further change is a new operation.",
        );
      }
    } catch (error) {
      signin.hidden = !(error instanceof PhotoSessionRequired);
      state(
        conflict ? "conflict" : "confirmed",
        error instanceof PhotoSessionRequired
          ? "Sign in again in a separate tab, then refresh the current product here. Your fields and any confirmed receipt are preserved; no new operation is allowed yet."
          : conflict
            ? "Conflict: current product could not be verified. Refresh and review before a new operation. Your selection is preserved."
            : "The photo operation is confirmed, but the current product is unavailable. Refresh before another change; do not repeat the confirmed operation.",
      );
    } finally {
      refreshing = false;
      state(phase, status.textContent ?? "");
    }
  }

  async function send() {
    if (!intent || phase === "pending" || refreshing) return;
    signin.hidden = true;
    state(
      "pending",
      "Waiting for a verified photo receipt. No change has been assumed.",
    );
    let result: Awaited<ReturnType<typeof photoRequest>>;
    try {
      if (sessionRefreshRequired) {
        await refreshPhotoCsrf(key, endpoint);
        sessionRefreshRequired = false;
      }
      result = await photoRequest(
        `${endpoint}/photo`,
        intent.action === "upload" ? "POST" : "DELETE",
        intent,
      );
    } catch (error) {
      if (error instanceof PhotoSessionRequired) sessionRefreshRequired = true;
      signin.hidden = !(error instanceof PhotoSessionRequired);
      state(
        "uncertain",
        error instanceof PhotoSessionRequired
          ? "Sign in again in a separate tab, then retry the same photo operation. Your file and description are preserved here."
          : "Outcome unverified. The server may have recorded this operation. Retry the same photo operation with its unchanged file, description and operation ID.",
      );
      return;
    }
    const { response, body } = result;
    if (response.status === 409) {
      cancelRemoval();
      await refreshRecord(true);
      return;
    }
    if (response.status === 401 || response.status === 403) {
      sessionRefreshRequired = true;
      signin.hidden = false;
      state(
        "uncertain",
        "Sign in again in a separate tab, then retry the same photo operation. Your file and description are preserved here; do not close this page.",
      );
      return;
    }
    if (response.status === 429 || response.status >= 500) {
      state(
        "uncertain",
        "Outcome unverified while the server is busy or unavailable. Retry the same unchanged photo operation; do not create a new intent.",
      );
      return;
    }
    if (!response.ok) {
      intent = null;
      cancelRemoval();
      state(
        "idle",
        response.status === 413
          ? "The server rejected the image size. Choose a still image up to 8 MiB and 25 million decoded pixels."
          : "The server rejected this photo request. Review the still JPG, PNG or WebP file and required description, then try again. Your fields are preserved.",
      );
      return;
    }
    try {
      const receipt = photoObject(body);
      const attached = verifiedPhoto(receipt.photo);
      if (
        receipt.productKey !== key ||
        !photoInteger(receipt.revision) ||
        receipt.revision <= intent.expectedRevision ||
        (intent.action === "upload"
          ? !attached || attached.alt !== intent.alt
          : attached !== null)
      )
        throw new Error("Unverified receipt.");
      find<HTMLElement>("[data-photo-receipt-text]").textContent =
        `Operation ${intent.operationId}: product ${key}, revision ${receipt.revision}. ` +
        (attached
          ? `Photo attached: ${attached.alt}`
          : "Primary photo removed (detached; earlier objects retained).");
      find<HTMLElement>("[data-photo-receipt]").hidden = false;
      minimumRevision = receipt.revision;
    } catch {
      state(
        "uncertain",
        "The response did not verify this photo operation. Retry the same unchanged operation; no success has been assumed.",
      );
      return;
    }
    if (intent.action === "upload") {
      selectionVersion++;
      selected = null;
      fileInput.value = "";
      clearLocal();
    }
    cancelRemoval();
    await refreshRecord(false);
  }

  fileInput.addEventListener("change", async () => {
    if (phase !== "idle") return;
    const version = ++selectionVersion;
    selected = null;
    clearLocal();
    const file = fileInput.files?.[0];
    if (!file) {
      selecting = false;
      state("idle", "No local photo selected.", false);
      return;
    }
    selecting = true;
    state(
      "idle",
      "Checking the local selection. Nothing has been uploaded.",
      false,
    );
    let candidate: string | null = null;
    try {
      await validatePhotoFile(file);
      if (version !== selectionVersion) return;
      candidate = URL.createObjectURL(file);
      const dimensions = await decodePhoto(candidate);
      if (version !== selectionVersion) return;
      selected = file;
      localUrl = candidate;
      candidate = null;
      localImage.src = localUrl;
      localImage.alt = altInput.value.trim();
      localImage.width = dimensions.width;
      localImage.height = dimensions.height;
      local.hidden = false;
      state(
        "idle",
        "Local selection ready. Review its description before uploading.",
        false,
      );
    } catch (error) {
      if (version !== selectionVersion) return;
      state(
        "idle",
        error instanceof Error ? error.message : "Choose a valid still photo.",
      );
    } finally {
      if (candidate) URL.revokeObjectURL(candidate);
      if (version === selectionVersion) {
        selecting = false;
        state("idle", status.textContent ?? "", false);
      }
    }
  });
  altInput.addEventListener("input", () => {
    if (phase === "idle") localImage.alt = altInput.value.trim();
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (phase !== "idle" || selecting || refreshing) return;
    const alt = altInput.value.trim();
    const expectedRevision = Number(revisionInput.value);
    if (!selected || !photoAlt(alt) || !photoInteger(expectedRevision)) {
      state(
        "idle",
        !selected
          ? "Choose a valid photo file before uploading."
          : "Enter a required photo description of at most 300 characters without control characters.",
      );
      return;
    }
    if (!form.reportValidity()) return;
    intent = Object.freeze({
      operationId: crypto.randomUUID(),
      expectedRevision,
      action: "upload",
      file: selected,
      alt,
    });
    void send();
  });
  remove.addEventListener("click", () => {
    if (phase !== "idle" || !hasPhoto || refreshing || selecting) return;
    removal.hidden = false;
    removeConfirm.focus();
  });
  removeConfirm.addEventListener("change", () => {
    removeSubmit.disabled =
      phase !== "idle" || selecting || !removeConfirm.checked;
  });
  removeCancel.addEventListener("click", () => {
    if (phase !== "idle") return;
    cancelRemoval();
    remove.focus();
  });
  removeSubmit.addEventListener("click", () => {
    if (
      phase !== "idle" ||
      !hasPhoto ||
      !removeConfirm.checked ||
      refreshing ||
      selecting
    )
      return;
    const expectedRevision = Number(revisionInput.value);
    if (!photoInteger(expectedRevision)) return;
    intent = Object.freeze({
      operationId: crypto.randomUUID(),
      expectedRevision,
      action: "remove",
      file: null,
      alt: "",
    });
    void send();
  });
  retry.addEventListener("click", () => {
    if (phase === "uncertain") void send();
  });
  refresh.addEventListener("click", () => {
    if (phase === "conflict" || phase === "confirmed")
      void refreshRecord(phase === "conflict");
  });
  review.addEventListener("click", () => {
    if (phase !== "conflict" || !reviewed || refreshing) return;
    revisionInput.value = String(reviewed.revision);
    intent = null;
    reviewed = null;
    cancelRemoval();
    state(
      "idle",
      "Current product reviewed. Your selection is preserved. Submitting now creates a new photo operation; review the target photo before removal.",
    );
  });
  savedImage.addEventListener("error", () => {
    if (hasPhoto) previewError.hidden = false;
  });
  window.addEventListener("pagehide", () => {
    selectionVersion++;
    selecting = false;
    selected = null;
    fileInput.value = "";
    clearLocal();
    state(
      phase,
      phase === "idle"
        ? "Select a photo again to restore its local preview."
        : (status.textContent ?? ""),
      false,
    );
  });
  state(
    "idle",
    "Choose a local photo or review the current server record.",
    false,
  );
}

for (const form of document.querySelectorAll<HTMLFormElement>(
  "[data-photo-form]",
))
  setupPhotoEditor(form);
