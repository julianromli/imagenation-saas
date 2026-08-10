export const idrFormatter = new Intl.NumberFormat("en-ID", {
  currency: "IDR",
  maximumFractionDigits: 0,
  style: "currency",
});

export function formatIdr(amount: number) {
  return idrFormatter.format(amount);
}

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  month: "short",
});

export function formatMoment(value: Date | number) {
  return dateFormatter.format(value);
}

/** Ledger deltas read as +4 and −2, never as 4 and -2. */
export function formatDelta(delta: number) {
  return delta > 0 ? `+${delta}` : `−${Math.abs(delta)}`;
}
