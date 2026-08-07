import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import { releaseOrderReservation } from "@/lib/inventory";

const PAST = 1_700_000_000_000;

async function seedReservedOrder(orderId: string, quantity: number) {
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO "order"
         (id, access_token_expires_at, access_token_hash, address_line, city,
          guest_email, guest_name, guest_phone, order_number, postal_code,
          province, reservation_expires_at, shipping_amount, subtotal, total,
          created_at, updated_at)
       VALUES (?, ?, ?, 'Jalan Test 1', 'Jakarta', 'buyer@example.com', 'Buyer',
               '0800000000', ?, '12345', 'DKI Jakarta', ?, 0, 1000, 1000, ?, ?)`
    ).bind(
      orderId,
      PAST,
      `hash-${orderId}`,
      `ORD-${orderId}`,
      PAST,
      PAST,
      PAST
    ),
    env.DB.prepare(
      `INSERT INTO inventory_reservation
         (id, order_id, product_id, quantity, expires_at, status, created_at, updated_at)
       VALUES (?, ?, 'shared-product', ?, ?, 'reserved', ?, ?)`
    ).bind(`res-${orderId}`, orderId, quantity, PAST, PAST, PAST),
  ]);
}

function readStock() {
  return env.DB.prepare(
    "SELECT available_stock, reserved_stock FROM product WHERE id = 'shared-product'"
  ).first<{ available_stock: number; reserved_stock: number }>();
}

function readReservation(orderId: string) {
  return env.DB.prepare("SELECT status FROM inventory_reservation WHERE id = ?")
    .bind(`res-${orderId}`)
    .first<{ status: string }>();
}

describe("releaseOrderReservation", () => {
  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM inventory_reservation"),
      env.DB.prepare('DELETE FROM "order"'),
      env.DB.prepare("DELETE FROM product"),
    ]);
    // Two orders hold three units between them, leaving seven available.
    await env.DB.prepare(
      `INSERT INTO product
         (id, name, slug, description, price, available_stock, reserved_stock, created_at, updated_at)
       VALUES ('shared-product', 'Shared', 'shared', 'desc', 1000, 7, 3, ?, ?)`
    )
      .bind(PAST, PAST)
      .run();
    await seedReservedOrder("first", 1);
    await seedReservedOrder("second", 2);
  });

  it("returns the stock one order was holding", async () => {
    await expect(releaseOrderReservation("first")).resolves.toBe(1);

    await expect(readStock()).resolves.toMatchObject({
      available_stock: 8,
      reserved_stock: 2,
    });
    await expect(readReservation("first")).resolves.toMatchObject({
      status: "expired",
    });
  });

  it("is harmless when the same order is released twice", async () => {
    await releaseOrderReservation("first");
    // A second release must not return the stock again. The reservation is no
    // longer reserved, so both guarded statements match nothing.
    await expect(releaseOrderReservation("first")).resolves.toBe(0);

    await expect(readStock()).resolves.toMatchObject({
      available_stock: 8,
      reserved_stock: 2,
    });
    // The other order still holds its own units on the same product.
    await expect(readReservation("second")).resolves.toMatchObject({
      status: "reserved",
    });
  });
});
