export const idrFormatter = new Intl.NumberFormat("en-ID", {
  currency: "IDR",
  maximumFractionDigits: 0,
  style: "currency",
});

export function formatIdr(amount: number) {
  return idrFormatter.format(amount);
}

export function formatOrderStatus(status: string) {
  return status
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}
