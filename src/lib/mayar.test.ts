import { describe, expect, it } from "vitest";

import { isMayarPaid, parseMayarWebhook } from "./mayar";

describe("Mayar webhook parsing", () => {
  it("reads the documented event and transaction candidate fields", () => {
    const webhook = parseMayarWebhook({
      data: {
        amount: 189_000,
        id: "webhook-id",
        transactionId: "transaction-id",
        transactionStatus: "paid",
      },
      event: "payment.received",
    });

    expect(webhook.eventType).toBe("payment.received");
    expect(webhook.id).toBe("webhook-id");
    expect(webhook.transactionId).toBe("transaction-id");
    expect(webhook.status).toBe("paid");
  });

  it("does not treat delivery success as transaction payment", () => {
    const webhook = parseMayarWebhook({
      data: {
        amount: 189_000,
        id: "webhook-id",
        status: "SUCCESS",
        transactionId: "transaction-id",
        transactionStatus: "created",
      },
      event: "payment.reminder",
    });

    expect(webhook.status).toBe("created");
    expect(isMayarPaid(webhook.status)).toBe(false);
  });
});
