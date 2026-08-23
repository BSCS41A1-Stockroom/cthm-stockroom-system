export const DEFAULT_LOW_STOCK_THRESHOLD = 5;

function quantity(value) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function inventoryTotals(item = {}) {
  const total = quantity(item.quantity)
    + quantity(item.additional_qty)
    - quantity(item.replaces);
  const usable = total
    - quantity(item.missing)
    - quantity(item.breakage)
    - quantity(item.defective)
    - quantity(item.total_loss);
  const committed = quantity(item.reserved_quantity) + quantity(item.borrowed_quantity);
  const rawAvailable = usable - committed;
  const threshold = Math.max(0, quantity(item.low_stock_threshold ?? DEFAULT_LOW_STOCK_THRESHOLD));

  return Object.freeze({
    total,
    usable,
    committed,
    available: Math.max(0, rawAvailable),
    rawAvailable,
    threshold,
  });
}

export function inventoryStockStatus(item) {
  const { available, threshold } = inventoryTotals(item);
  if (available === 0) return "out-of-stock";
  if (available <= threshold) return "low-stock";
  return "in-stock";
}
