import { describe, expect, it } from "vitest";

import { parseInvoiceResponse } from "./mayar";
import {
  parseMayarPaymentDetail,
  readStoredPaymentDetail,
} from "./payment-methods";

/**
 * The shapes below are trimmed copies of what Mayar sandbox actually returned
 * on 2026-08-12. No V2 page documents `paymentDetail`, so captured payloads are
 * the only source there is. See ADR-0021.
 */
const QRIS_DETAIL = {
  actions: [],
  qr_code: {
    amount: 10_000,
    channel_code: "XENDIT",
    channel_properties: {
      expires_at: "2026-08-12T11:02:10.011Z",
      qr_string: "00020101021226-real-qris-payload",
    },
    currency: "IDR",
  },
  status: "ACTIVE",
  type: "QR_CODE",
  virtual_account: null,
};

const VIRTUAL_ACCOUNT_DETAIL = {
  actions: [],
  ewallet: null,
  status: "PENDING",
  type: "VIRTUAL_ACCOUNT",
  virtual_account: {
    amount: 11_000,
    channel_code: "BNI",
    channel_properties: {
      customer_name: "XDT-Faiz Intifada",
      expires_at: "2026-08-12T11:04:26.67Z",
      virtual_account_number: "8808999924798687",
    },
    currency: "IDR",
  },
};

const EWALLET_DETAIL = {
  actions: [
    {
      action: "AUTH",
      method: "GET",
      qr_code: null,
      url: "https://ewallet.example.com/checkout?token=abc",
      url_type: "WEB",
    },
    {
      action: "AUTH",
      method: "GET",
      qr_code: null,
      url: "https://ewallet.example.com/checkout?token=abc",
      url_type: "MOBILE",
    },
  ],
  ewallet: {
    account: { balance: null, name: null },
    channel_code: "DANA",
    channel_properties: {
      success_return_url: "https://store.example.com/pay-thank-you/1",
    },
  },
  qr_code: null,
  type: "EWALLET",
};

describe("reading Mayar's payment detail", () => {
  it("reads a QRIS payload", () => {
    const detail = parseMayarPaymentDetail(QRIS_DETAIL);

    expect(detail).toEqual({
      expiresAt: Date.parse("2026-08-12T11:02:10.011Z"),
      kind: "qris",
      qrString: "00020101021226-real-qris-payload",
    });
  });

  it("reads a virtual account payload", () => {
    const detail = parseMayarPaymentDetail(VIRTUAL_ACCOUNT_DETAIL);

    expect(detail).toEqual({
      accountName: "XDT-Faiz Intifada",
      accountNumber: "8808999924798687",
      bank: "BNI",
      expiresAt: Date.parse("2026-08-12T11:04:26.67Z"),
      kind: "virtual_account",
    });
  });

  it("reads both links from an e-wallet payload", () => {
    const detail = parseMayarPaymentDetail(EWALLET_DETAIL);

    expect(detail).toMatchObject({
      channel: "DANA",
      kind: "ewallet",
      qrString: null,
    });
    expect(detail?.kind === "ewallet" && detail.links).toEqual([
      { kind: "web", url: "https://ewallet.example.com/checkout?token=abc" },
      { kind: "mobile", url: "https://ewallet.example.com/checkout?token=abc" },
    ]);
  });

  it("keeps the QR an e-wallet presents instead of a link", () => {
    const detail = parseMayarPaymentDetail({
      actions: [
        {
          action: "DEEPLINK",
          qr_code: null,
          url: "https://wallet.example.com/pay",
          url_type: "DEEPLINK",
        },
        {
          action: "PRESENT_TO_CUSTOMER",
          qr_code: "shopeepay-qr-payload",
          url: null,
          url_type: null,
        },
      ],
      ewallet: { channel_code: "SHOPEEPAY" },
      type: "EWALLET",
    });

    expect(detail).toMatchObject({
      channel: "SHOPEEPAY",
      kind: "ewallet",
      qrString: "shopeepay-qr-payload",
    });
  });

  it("refuses a link scheme that is not a wallet or https", () => {
    const detail = parseMayarPaymentDetail({
      actions: [
        // The scheme is split so the literal cannot be mistaken for a real one.
        {
          qr_code: null,
          url: `${"java"}${"script"}:alert(1)`,
          url_type: "WEB",
        },
      ],
      ewallet: { channel_code: "DANA" },
      type: "EWALLET",
    });

    expect(detail).toBeNull();
  });

  it.each([
    ["an unknown type", { type: "CRYPTO_WALLET" }],
    [
      "a QRIS with no string",
      { qr_code: { channel_properties: {} }, type: "QR_CODE" },
    ],
    [
      "a virtual account with no number",
      {
        type: "VIRTUAL_ACCOUNT",
        virtual_account: { channel_code: "BNI", channel_properties: {} },
      },
    ],
    [
      "an e-wallet with nothing to act on",
      { ewallet: { channel_code: "DANA" }, type: "EWALLET" },
    ],
    ["null", null],
    ["an array", []],
    ["a string", "QR_CODE"],
    ["a number", 42],
  ])("returns nothing for %s", (_label, value) => {
    expect(parseMayarPaymentDetail(value)).toBeNull();
  });
});

describe("re-reading a stored payment detail", () => {
  it("survives a round trip through the database", () => {
    const detail = parseMayarPaymentDetail(VIRTUAL_ACCOUNT_DETAIL);
    const stored = JSON.parse(JSON.stringify(detail));

    expect(readStoredPaymentDetail(stored)).toEqual(detail);
  });

  it("drops a stored row an older parser wrote badly", () => {
    expect(readStoredPaymentDetail({ kind: "qris", qrString: "" })).toBeNull();
    expect(readStoredPaymentDetail({ kind: "something-new" })).toBeNull();
  });

  it("re-checks a stored link rather than trusting our own write", () => {
    const detail = readStoredPaymentDetail({
      channel: "DANA",
      kind: "ewallet",
      links: [
        { kind: "web", url: "javascript:alert(1)" },
        { kind: "mobile", url: "https://wallet.example.com/pay" },
      ],
      qrString: null,
    });

    expect(detail?.kind === "ewallet" && detail.links).toEqual([
      { kind: "mobile", url: "https://wallet.example.com/pay" },
    ]);
  });
});

describe("reading an invoice create response", () => {
  const base = {
    expiredAt: 1_786_532_530_011,
    id: "invoice-id",
    link: "https://store.example.com/invoices/abc",
    transactionId: "transaction-id",
  };

  it.each([
    ["absent", undefined],
    ["null", null],
    ["a shape we do not know", { type: "SOMETHING_NEW", weird: true }],
    ["a string", "nope"],
  ])("parses when paymentDetail is %s", (_label, paymentDetail) => {
    const invoice = parseInvoiceResponse({ ...base, paymentDetail });

    expect(invoice.id).toBe("invoice-id");
    expect(parseMayarPaymentDetail(invoice.paymentDetail)).toBeNull();
  });
});
