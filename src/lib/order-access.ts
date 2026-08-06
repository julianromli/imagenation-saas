const STORAGE_KEY = "then-ecommerce-last-order-v1";

export type LastOrderHint = {
  createdAt: string;
  orderNumber: string;
  orderStatusPath: string;
};

export function saveLastOrderHint(hint: LastOrderHint) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(hint));
}

export function getLastOrderHint(): LastOrderHint | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const value: unknown = JSON.parse(
      window.localStorage.getItem(STORAGE_KEY) ?? "null"
    );

    if (
      typeof value !== "object" ||
      value === null ||
      typeof (value as LastOrderHint).orderNumber !== "string" ||
      typeof (value as LastOrderHint).orderStatusPath !== "string" ||
      typeof (value as LastOrderHint).createdAt !== "string"
    ) {
      return null;
    }

    return value as LastOrderHint;
  } catch {
    return null;
  }
}

export function clearLastOrderHint() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(STORAGE_KEY);
}
