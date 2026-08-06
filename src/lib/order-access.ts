const STORAGE_KEY = "then-ecommerce-last-order-v1";
const STORAGE_EVENT = "then-ecommerce:last-order-hint";

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
  window.dispatchEvent(new Event(STORAGE_EVENT));
}

export function getLastOrderHintSnapshot() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function parseLastOrderHint(value: string | null): LastOrderHint | null {
  if (!value) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(value);

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof (parsed as LastOrderHint).orderNumber !== "string" ||
      typeof (parsed as LastOrderHint).orderStatusPath !== "string" ||
      typeof (parsed as LastOrderHint).createdAt !== "string"
    ) {
      return null;
    }

    return parsed as LastOrderHint;
  } catch {
    return null;
  }
}

export function subscribeToLastOrderHint(onChange: () => void) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) {
      onChange();
    }
  };

  window.addEventListener("storage", onStorage);
  window.addEventListener(STORAGE_EVENT, onChange);

  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(STORAGE_EVENT, onChange);
  };
}
