import assert from "node:assert/strict";
import test from "node:test";
import { createPhotoDownloadLimiter } from "../../src/server/media/limit.ts";
import { PhotoError } from "../../src/server/media/errors.ts";

const unavailable = (error: unknown) =>
  error instanceof PhotoError && error.status === 503;

test(
  "downloads keep a bounded active count and start queued work in FIFO order",
  { timeout: 5000 },
  async () => {
    const limit = createPhotoDownloadLimiter({
      concurrency: 2,
      maxQueued: 2,
      waitMs: 1000,
    });
    const finish = Array.from({ length: 4 }, () =>
      Promise.withResolvers<void>(),
    );
    const entered = Array.from({ length: 4 }, () =>
      Promise.withResolvers<void>(),
    );
    const started: number[] = [];
    let active = 0;
    let maximum = 0;
    const requests = finish.map((gate, index) =>
      limit(async () => {
        active++;
        maximum = Math.max(maximum, active);
        started.push(index);
        entered[index]!.resolve();
        try {
          await gate.promise;
          return index;
        } finally {
          active--;
        }
      }),
    );
    try {
      await entered[1]!.promise;
      assert.deepEqual(started, [0, 1]);
      finish[1]!.resolve();
      await entered[2]!.promise;
      assert.deepEqual(started, [0, 1, 2]);
      finish[0]!.resolve();
      await entered[3]!.promise;
      assert.deepEqual(started, [0, 1, 2, 3]);
      assert.equal(maximum, 2);
    } finally {
      for (const gate of finish) gate.resolve();
      await Promise.allSettled(requests);
    }
    assert.deepEqual(await Promise.all(requests), [0, 1, 2, 3]);
  },
);

test(
  "download queue overflow rejects without starting additional work",
  { timeout: 5000 },
  async () => {
    const limit = createPhotoDownloadLimiter({
      concurrency: 1,
      maxQueued: 1,
      waitMs: 1000,
    });
    const finish = Promise.withResolvers<void>();
    const entered = Promise.withResolvers<void>();
    const first = limit(async () => {
      entered.resolve();
      await finish.promise;
    });
    await entered.promise;
    let queuedStarted = false;
    let overflowStarted = false;
    const queued = limit(async () => {
      queuedStarted = true;
    });
    try {
      await assert.rejects(
        limit(async () => {
          overflowStarted = true;
        }),
        unavailable,
      );
      assert.equal(queuedStarted, false);
      assert.equal(overflowStarted, false);
    } finally {
      finish.resolve();
      await Promise.allSettled([first, queued]);
    }
    assert.equal(queuedStarted, true);
  },
);

test("expired download waiters never run, release queue capacity, and work failures release active slots", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const limit = createPhotoDownloadLimiter({
    concurrency: 1,
    maxQueued: 1,
    waitMs: 100,
  });
  const finish = Promise.withResolvers<void>();
  const entered = Promise.withResolvers<void>();
  const first = limit(async () => {
    entered.resolve();
    await finish.promise;
  });
  await entered.promise;
  let expiredStarted = false;
  const expired = limit(async () => {
    expiredStarted = true;
  });
  const rejection = assert.rejects(expired, unavailable);
  try {
    context.mock.timers.tick(100);
    await rejection;
    assert.equal(expiredStarted, false);
    const successor = limit(async () => "successor");
    finish.resolve();
    await first;
    assert.equal(await successor, "successor");
    assert.equal(expiredStarted, false);
    await assert.rejects(
      limit(async () => {
        throw new Error("fixture download failed");
      }),
    );
    assert.equal(await limit(async () => "released"), "released");
  } finally {
    finish.resolve();
    await Promise.allSettled([first, expired]);
  }
});
