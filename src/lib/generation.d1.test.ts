import { beforeEach, describe, expect, it, vi } from "vitest";

import { getDb, runBatch } from "@/db";
import { users } from "@/db/schema";
import { ensureAccountStatement, ledgerStatements } from "@/lib/credits";
import { createId } from "@/lib/ids";
import { ImageGenerationError } from "@/lib/openrouter";

// The model is the one thing these tests must not call. Everything else — the
// ledger, the constraints, the refund rules — is exercised for real.
const generateImage = vi.hoisted(() => vi.fn());

vi.mock("@/lib/openrouter", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/openrouter")>();

  return { ...actual, generateImage };
});

const { executeGeneration, startGeneration } = await import("@/lib/generation");

async function createUser(balance: number) {
  const id = createId();

  await getDb()
    .insert(users)
    .values({ email: `${id}@example.test`, id, name: "Test person" });

  await runBatch([
    ensureAccountStatement(id),
    ...ledgerStatements({
      delta: balance,
      reason: "grant",
      refId: id,
      refType: "signup",
      userId: id,
    }),
  ]);

  return id;
}

function readBalance(userId: string) {
  return getDb()
    .query.creditAccounts.findFirst({
      where: (row, { eq }) => eq(row.userId, userId),
    })
    .then((row) => row?.balance ?? 0);
}

const ALREADY_RUNNING = /already generating/i;
const NOT_ENOUGH_CREDITS = /enough credits/i;
const NOT_YOURS = /not yours/i;

const request = {
  aspectRatio: "16:9" as const,
  prompt: "A red apple on a grey backdrop",
  referenceKeys: [],
  resolution: "1K",
};

describe("starting a generation", () => {
  let userId: string;

  beforeEach(async () => {
    generateImage.mockReset();
    userId = await createUser(10);
  });

  it("charges once however many times the same key arrives", async () => {
    const key = createId();

    const first = await startGeneration({
      idempotencyKey: key,
      request,
      userId,
    });
    const second = await startGeneration({
      idempotencyKey: key,
      request,
      userId,
    });

    expect(second.replayed).toBe(true);
    expect(second.generation.id).toBe(first.generation.id);
    // Two credits for a 1K image, taken exactly once.
    expect(await readBalance(userId)).toBe(8);
  });

  it("refuses a second generation while one is still running", async () => {
    await startGeneration({ idempotencyKey: createId(), request, userId });

    await expect(
      startGeneration({ idempotencyKey: createId(), request, userId })
    ).rejects.toThrow(ALREADY_RUNNING);

    expect(await readBalance(userId)).toBe(8);
  });

  it("refuses to start when the balance is too low", async () => {
    const poor = await createUser(1);

    await expect(
      startGeneration({ idempotencyKey: createId(), request, userId: poor })
    ).rejects.toThrow(NOT_ENOUGH_CREDITS);

    expect(await readBalance(poor)).toBe(1);
  });

  it("refuses a reference image belonging to somebody else", async () => {
    const other = await createUser(10);

    await expect(
      startGeneration({
        idempotencyKey: createId(),
        request: { ...request, referenceKeys: [`references/${other}/x.png`] },
        userId,
      })
    ).rejects.toThrow(NOT_YOURS);
  });
});

describe("settling a generation", () => {
  let userId: string;

  beforeEach(async () => {
    generateImage.mockReset();
    userId = await createUser(10);
  });

  it("returns the credits when the provider fails", async () => {
    generateImage.mockRejectedValue(
      new ImageGenerationError("upstream", "The provider fell over")
    );

    const { generation } = await startGeneration({
      idempotencyKey: createId(),
      request,
      userId,
    });

    expect(await readBalance(userId)).toBe(8);

    const settled = await executeGeneration(generation.id);

    expect(settled.status).toBe("failed");
    expect(settled.errorCode).toBe("upstream");
    expect(settled.refundedAt).not.toBeNull();
    expect(await readBalance(userId)).toBe(10);
  });

  it("keeps the credits when the prompt is blocked", async () => {
    generateImage.mockRejectedValue(
      new ImageGenerationError("moderation", "That prompt is not allowed")
    );

    const { generation } = await startGeneration({
      idempotencyKey: createId(),
      request,
      userId,
    });
    const settled = await executeGeneration(generation.id);

    expect(settled.status).toBe("failed");
    expect(settled.errorCode).toBe("moderation");
    // Deliberate: refunding a blocked prompt would make probing the filter
    // free. See ADR-0017.
    expect(settled.refundedAt).toBeNull();
    expect(await readBalance(userId)).toBe(8);
  });

  it("stores the image and what it cost upstream", async () => {
    generateImage.mockResolvedValue({
      // A one-pixel PNG is enough: what matters is that the bytes reach R2.
      base64:
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      costUsd: 0.0672,
      mediaType: "image/png",
    });

    const { generation } = await startGeneration({
      idempotencyKey: createId(),
      request,
      userId,
    });
    const settled = await executeGeneration(generation.id);

    expect(settled.status).toBe("succeeded");
    expect(settled.objectKey).toBe(
      `generations/${userId}/${generation.id}.png`
    );
    expect(settled.upstreamCostUsd).toBeCloseTo(0.0672);
    expect(settled.refundedAt).toBeNull();
    expect(await readBalance(userId)).toBe(8);
  });

  it("does not run twice for the same row", async () => {
    generateImage.mockResolvedValue({
      base64:
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      costUsd: 0.0672,
      mediaType: "image/png",
    });

    const { generation } = await startGeneration({
      idempotencyKey: createId(),
      request,
      userId,
    });

    await executeGeneration(generation.id);
    await executeGeneration(generation.id);

    expect(generateImage).toHaveBeenCalledTimes(1);
  });
});
