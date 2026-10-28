export interface InsufficientStockErrorInfo {
  itemId: string;
  availableKg: number;
  requestedKg: number;
}

export function parseInsufficientStockError(message: string | undefined | null): InsufficientStockErrorInfo | null {
  if (!message) return null;
  const match = message.match(/INSUFFICIENT_STOCK\|([0-9a-fA-F-]+)\|([\d.]+)\|([\d.]+)/);
  if (!match) return null;
  return { itemId: match[1], availableKg: parseFloat(match[2]), requestedKg: parseFloat(match[3]) };
}
