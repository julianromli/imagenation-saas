import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

// The whole migration rests on two claims that Postgres used to guarantee:
// a check constraint refuses an overselling write, and a failed statement rolls
// back the entire D1 batch. These tests prove both by execution.
// See ADR-0012.

const NOW = 1_760_000_000_000;
const CHECK_FAILED = /CHECK constraint failed/;
const UNIQUE_FAILED = /UNIQUE constraint failed/;

async function seedProduct(id: string, availableStock: number) {
  await env.DB.prepare(
    `INSERT INTO product
       (id, name, slug, description, price, available_stock, reserved_stock, created_at, updated_at)
     VALUES (?, ?, ?, 'A test product', 1000, ?, 0, ?, ?)`
  )
    .bind(id, `Product ${id}`, `product-${id}`, availableStock, NOW, NOW)
    .run();
}

function stockOf(id: string) {
  return env.DB.prepare("SELECT available_stock FROM product WHERE id = ?")
    .bind(id)
    .first<{ available_stock: number }>()
    .then((row) => row?.available_stock);
}

function decrementStock(id: string, quantity: number) {
  return env.DB.prepare(
    `UPDATE product
       SET available_stock = available_stock - ?,
           reserved_stock = reserved_stock + ?
     WHERE id = ?`
  ).bind(quantity, quantity, id);
}

function insertOrder(id: string) {
  return env.DB.prepare(
    `INSERT INTO "order"
       (id, access_token_expires_at, access_token_hash, address_line, city,
        guest_email, guest_name, guest_phone, order_number, postal_code,
        province, reservation_expires_at, shipping_amount, subtotal, total,
        created_at, updated_at)
     VALUES (?, ?, ?, 'Jalan Test 1', 'Jakarta', 'buyer@example.com', 'Buyer',
             '0800000000', ?, '12345', 'DKI Jakarta', ?, 0, 1000, 1000, ?, ?)`
  ).bind(id, NOW, `hash-${id}`, `ORD-${id}`, NOW, NOW, NOW);
}

function countOrders() {
  return env.DB.prepare('SELECT COUNT(*) AS total FROM "order"')
    .first<{ total: number }>()
    .then((row) => row?.total ?? 0);
}

describe("D1 batch atomicity", () => {
  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM checkout_request"),
      env.DB.prepare("DELETE FROM inventory_reservation"),
      env.DB.prepare("DELETE FROM order_item"),
      env.DB.prepare('DELETE FROM "order"'),
      env.DB.prepare("DELETE FROM product"),
    ]);
  });

  it("refuses a write that would take stock below zero", async () => {
    await seedProduct("solo", 1);

    await expect(decrementStock("solo", 5).run()).rejects.toThrow(CHECK_FAILED);
    await expect(stockOf("solo")).resolves.toBe(1);
  });

  it("rolls back an earlier statement when a later one oversells", async () => {
    // This is the shape of a two-line checkout: the first line has stock, the
    // second does not. Without a rollback, the buyer loses stock on line one
    // and gets no order.
    await seedProduct("in-stock", 10);
    await seedProduct("last-one", 1);

    await expect(
      env.DB.batch([
        decrementStock("in-stock", 2),
        decrementStock("last-one", 5),
        insertOrder("order-1"),
      ])
    ).rejects.toThrow(CHECK_FAILED);

    await expect(stockOf("in-stock")).resolves.toBe(10);
    await expect(stockOf("last-one")).resolves.toBe(1);
    await expect(countOrders()).resolves.toBe(0);
  });

  it("commits every statement when none of them fails", async () => {
    await seedProduct("plenty", 10);

    await env.DB.batch([decrementStock("plenty", 3), insertOrder("order-2")]);

    await expect(stockOf("plenty")).resolves.toBe(7);
    await expect(countOrders()).resolves.toBe(1);
  });

  it("stops a replayed idempotency key from creating a second order", async () => {
    await seedProduct("replayed", 10);

    const checkout = (orderId: string, key: string) => [
      decrementStock("replayed", 1),
      insertOrder(orderId),
      env.DB.prepare(
        `INSERT INTO checkout_request (id, fingerprint, order_id, created_at, updated_at)
         VALUES (?, 'same-cart', ?, ?, ?)`
      ).bind(key, orderId, NOW, NOW),
    ];

    await env.DB.batch(checkout("order-3", "key-abc"));
    await expect(stockOf("replayed")).resolves.toBe(9);

    // The browser retries with the same key. The primary key refuses it, and
    // the batch takes the duplicate order and the stock deduction down with it.
    await expect(env.DB.batch(checkout("order-4", "key-abc"))).rejects.toThrow(
      UNIQUE_FAILED
    );

    await expect(stockOf("replayed")).resolves.toBe(9);
    await expect(countOrders()).resolves.toBe(1);
  });
});
