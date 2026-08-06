import { describe, expect, it } from "vitest";

import { checkoutSchema, orderLookupSchema } from "./validation";

describe("checkout validation", () => {
  it("accepts the Indonesia basic shipping shape", () => {
    const result = checkoutSchema.safeParse({
      addressLine: "Jl. Merdeka No. 1",
      city: "Jakarta Selatan",
      email: "customer@example.com",
      guestName: "Customer",
      lines: [{ productId: "product-1", quantity: 1 }],
      phone: "081234567890",
      postalCode: "12190",
      province: "DKI Jakarta",
    });

    expect(result.success).toBe(true);
  });

  it("rejects an invalid postal code and empty cart", () => {
    const result = checkoutSchema.safeParse({
      addressLine: "Short",
      city: "Jakarta",
      email: "not-an-email",
      guestName: "",
      lines: [],
      phone: "123",
      postalCode: "12",
      province: "Jakarta",
    });

    expect(result.success).toBe(false);
  });
});

describe("order lookup validation", () => {
  it("accepts a then. order number", () => {
    const result = orderLookupSchema.safeParse({
      email: "customer@example.com",
      orderNumber: "THN-20260806051753-E99750",
    });

    expect(result.success).toBe(true);
  });

  it("rejects a malformed order number", () => {
    const result = orderLookupSchema.safeParse({
      email: "customer@example.com",
      orderNumber: "ORDER-1",
    });

    expect(result.success).toBe(false);
  });
});
