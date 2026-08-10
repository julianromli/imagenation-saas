import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import type { CartLine } from "@/lib/validation";

const STORAGE_KEY = "then-ecommerce-cart-v1";

type CartContextValue = {
  add: (line: CartLine) => void;
  clear: () => void;
  count: number;
  /**
   * False until the stored cart has been read on the client. Consumers use it
   * to tell the hydration jump from 0 apart from a real user change, so they
   * do not animate on page load.
   */
  hydrated: boolean;
  lines: CartLine[];
  remove: (productId: string) => void;
  setQuantity: (productId: string, quantity: number) => void;
};

const CartContext = createContext<CartContextValue | null>(null);

function readStoredCart(): CartLine[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const value: unknown = JSON.parse(
      window.localStorage.getItem(STORAGE_KEY) ?? "[]"
    );

    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter(
      (line): line is CartLine =>
        typeof line === "object" &&
        line !== null &&
        typeof line.productId === "string" &&
        typeof line.quantity === "number" &&
        Number.isInteger(line.quantity) &&
        line.quantity > 0
    );
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setLines(readStoredCart());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
  }, [hydrated, lines]);

  const add = useCallback((line: CartLine) => {
    setLines((current) => {
      const existing = current.find(
        (currentLine) => currentLine.productId === line.productId
      );

      if (!existing) {
        return [...current, line];
      }

      return current.map((currentLine) =>
        currentLine.productId === line.productId
          ? {
              ...currentLine,
              quantity: Math.min(99, currentLine.quantity + line.quantity),
            }
          : currentLine
      );
    });
  }, []);

  const setQuantity = useCallback((productId: string, quantity: number) => {
    setLines((current) =>
      quantity <= 0
        ? current.filter((line) => line.productId !== productId)
        : current.map((line) =>
            line.productId === productId
              ? { ...line, quantity: Math.min(99, quantity) }
              : line
          )
    );
  }, []);

  const remove = useCallback((productId: string) => {
    setLines((current) =>
      current.filter((line) => line.productId !== productId)
    );
  }, []);

  const clear = useCallback(() => {
    setLines([]);
  }, []);

  const value = useMemo(
    () => ({
      add,
      clear,
      count: lines.reduce((total, line) => total + line.quantity, 0),
      hydrated,
      lines,
      remove,
      setQuantity,
    }),
    [add, clear, hydrated, lines, remove, setQuantity]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);

  if (!context) {
    throw new Error("useCart must be used inside CartProvider");
  }

  return context;
}
