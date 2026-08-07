import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Without a registered webhook, a buyer who pays and closes the tab is the
// ordinary case rather than an edge case. The sweep must ask Mayar before it
// cancels anything. See ADR-0010.
vi.mock("@/lib/mayar", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/mayar")>()),
  getMayarTransaction: vi.fn(),
}));

const { getMayarTransaction } = await import("@/lib/mayar");
const { reconcileExpiredOrders } = await import("@/lib/scheduled");

const PAST = 1_700_000_000_000;
const NOW = new Date(1_760_000_000_000);

async function seedExpiredOrder(options: {
  orderId: string;
  transactionId?: string;
}) {
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO product
         (id, name, slug, description, price, available_stock, reserved_stock, created_at, updated_at)
       VALUES (?, 'Test', ?, 'desc', 1000, 4, 1, ?, ?)`
    ).bind(`prod-${options.orderId}`, `slug-${options.orderId}`, PAST, PAST),
    env.DB.prepare(
      `INSERT INTO "order"
         (id, access_token_expires_at, access_token_hash, address_line, city,
          guest_email, guest_name, guest_phone, order_number, postal_code,
          province, reservation_expires_at, shipping_amount, subtotal, total,
          mayar_transaction_id, created_at, updated_at)
       VALUES (?, ?, ?, 'Jalan Test 1', 'Jakarta', 'buyer@example.com', 'Buyer',
               '0800000000', ?, '12345', 'DKI Jakarta', ?, 0, 1000, 1000, ?, ?, ?)`
    ).bind(
      options.orderId,
      PAST,
      `hash-${options.orderId}`,
      `ORD-${options.orderId}`,
      PAST,
      options.transactionId ?? null,
      PAST,
      PAST
    ),
    env.DB.prepare(
      `INSERT INTO inventory_reservation
         (id, order_id, product_id, quantity, expires_at, status, created_at, updated_at)
       VALUES (?, ?, ?, 1, ?, 'reserved', ?, ?)`
    ).bind(
      `res-${options.orderId}`,
      options.orderId,
      `prod-${options.orderId}`,
      PAST,
      PAST,
      PAST
    ),
  ]);
}

function readOrder(orderId: string) {
  return env.DB.prepare(
    'SELECT status, payment_status FROM "order" WHERE id = ?'
  )
    .bind(orderId)
    .first<{ payment_status: string; status: string }>();
}

function readStock(orderId: string) {
  return env.DB.prepare(
    "SELECT available_stock, reserved_stock FROM product WHERE id = ?"
  )
    .bind(`prod-${orderId}`)
    .first<{ available_stock: number; reserved_stock: number }>();
}

describe("scheduled reservation sweep", () => {
  beforeEach(async () => {
    vi.mocked(getMayarTransaction).mockReset();
    await env.DB.batch([
      env.DB.prepare("DELETE FROM webhook_event"),
      env.DB.prepare("DELETE FROM inventory_reservation"),
      env.DB.prepare("DELETE FROM order_status_history"),
      env.DB.prepare('DELETE FROM "order"'),
      env.DB.prepare("DELETE FROM product"),
    ]);
  });

  it("cancels an expired order and returns its stock", async () => {
    await seedExpiredOrder({ orderId: "unpaid" });

    const result = await reconcileExpiredOrders(NOW);

    expect(result.cancelled).toBe(1);
    await expect(readOrder("unpaid")).resolves.toMatchObject({
      payment_status: "expired",
      status: "cancelled",
    });
    await expect(readStock("unpaid")).resolves.toMatchObject({
      available_stock: 5,
      reserved_stock: 0,
    });
  });

  it("does not cancel an expired order that Mayar reports as paid", async () => {
    await seedExpiredOrder({ orderId: "paid", transactionId: "txn-1" });
    vi.mocked(getMayarTransaction).mockResolvedValue({
      amount: 1000,
      extraData: { orderId: "paid" },
      id: "txn-1",
      status: "paid",
    });

    const result = await reconcileExpiredOrders(NOW);

    expect(result.cancelled).toBe(0);
    expect(result.settled).toBe(1);

    const order = await readOrder("paid");

    expect(order?.status).not.toBe("cancelled");
    expect(order?.payment_status).toBe("paid");
  });

  it("leaves an order alone when Mayar cannot be reached", async () => {
    await seedExpiredOrder({ orderId: "unreachable", transactionId: "txn-2" });
    vi.mocked(getMayarTransaction).mockRejectedValue(new Error("network down"));

    const result = await reconcileExpiredOrders(NOW);

    // Cancelling a paid order cannot be undone, so an unknown answer must not
    // be treated as "unpaid".
    expect(result.cancelled).toBe(0);
    expect(result.skipped).toBe(1);
    await expect(readOrder("unreachable")).resolves.toMatchObject({
      status: "pending_payment",
    });
  });
});
