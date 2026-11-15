import { PhotoError } from "./errors.ts";

let active = false;

export function createPhotoDownloadLimiter(
  limits = {
    concurrency: 4,
    maxQueued: 32,
    waitMs: 5000,
  },
) {
  const { concurrency, maxQueued, waitMs } = limits;
  if (
    !Number.isSafeInteger(concurrency) ||
    concurrency < 1 ||
    !Number.isSafeInteger(maxQueued) ||
    maxQueued < 0 ||
    !Number.isInteger(waitMs) ||
    waitMs < 1 ||
    waitMs > 2147483647
  )
    throw new RangeError("Invalid photo download limits.");
  let downloads = 0;
  const queue: {
    resume: () => void;
    timer: ReturnType<typeof setTimeout>;
  }[] = [];
  function unavailable() {
    return new PhotoError(
      503,
      "PHOTO_DOWNLOADS_BUSY",
      "Photo downloads are busy. Retry shortly.",
    );
  }
  function acquire(): Promise<void> {
    if (downloads < concurrency) {
      downloads++;
      return Promise.resolve();
    }
    if (queue.length >= maxQueued) return Promise.reject(unavailable());
    return new Promise((resolve, reject) => {
      const waiter = {
        resume: resolve,
        timer: setTimeout(() => {
          const index = queue.indexOf(waiter);
          if (index < 0) return;
          queue.splice(index, 1);
          reject(unavailable());
        }, waitMs),
      };
      queue.push(waiter);
    });
  }
  return async <T>(work: () => Promise<T>): Promise<T> => {
    await acquire();
    try {
      return await work();
    } finally {
      const next = queue.shift();
      if (next) {
        clearTimeout(next.timer);
        // Transfer this reserved slot without letting new arrivals jump the queue.
        next.resume();
      } else {
        downloads--;
      }
    }
  };
}

export const withPhotoDownload = createPhotoDownloadLimiter();

export async function withPhotoWork<T>(work: () => Promise<T>): Promise<T> {
  if (active)
    throw new PhotoError(
      429,
      "PHOTOS_BUSY",
      "Photo processing is busy. Retry shortly.",
    );
  active = true;
  try {
    return await work();
  } finally {
    active = false;
  }
}
