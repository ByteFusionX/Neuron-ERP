/** Pure deal-sheet pricing maths, kept out of the component so it can be unit-tested. */

export interface DealLine {
  selected: boolean;
  quantity: number;
  unitCost: number;
  unitSellingPrice: number;
}

export interface DealCost {
  type: string;
  value: number;
}

export interface DealTotals {
  sellingPrice: number;
  totalCost: number;
  profit: number;
  marginPct: number;
}

const num = (v: unknown): number => Number(v) || 0;

/** Margin % of a selling price over its cost. 0 when there is no price to divide by. */
export function marginFromPrice(unitCost: number, unitSellingPrice: number): number {
  const price = num(unitSellingPrice);
  if (price <= 0) return 0;
  return Number((((price - num(unitCost)) / price) * 100).toFixed(2));
}

/** Selling price (rounded up to a whole unit) that yields the margin %. null when the margin is unattainable (>= 100%). */
export function priceFromMargin(unitCost: number, marginPct: number): number | null {
  const margin = num(marginPct) / 100;
  if (margin >= 1) return null;
  return Math.ceil(Number((num(unitCost) / (1 - margin)).toFixed(2)));
}

export function dealTotals(lines: DealLine[], costs: DealCost[]): DealTotals {
  let sellingPrice = 0;
  let totalCost = 0;
  for (const l of lines) {
    if (!l.selected) continue;
    sellingPrice += num(l.unitSellingPrice) * num(l.quantity);
    totalCost += num(l.unitCost) * num(l.quantity);
  }
  for (const c of costs) {
    const v = num(c.value);
    if (c.type === 'Customer Discount') sellingPrice -= v;
    else if (c.type === 'Additional Cost') totalCost += v;
    else if (c.type === 'Supplier Discount') totalCost -= v;
  }
  const profit = sellingPrice - totalCost;
  return { sellingPrice, totalCost, profit, marginPct: sellingPrice ? (profit / sellingPrice) * 100 : 0 };
}

/** Deal items that have at least one line selected for the deal. */
export function selectedDealItems<T extends { itemDetails?: { dealSelected?: boolean }[] }>(items: (T | undefined)[] | undefined): T[] {
  return (items ?? []).filter((item): item is T => !!item?.itemDetails?.some((d) => d.dealSelected));
}

export interface DealPriceDetails {
  totalSellingPrice: number;
  totalCost: number;
  profit: number;
  perc: number;
}

/**
 * Totals for a saved deal sheet (selected lines plus its additional costs/discounts), shaped like the
 * `priceDetails` the deal-sheet screens already pass around. Any cost type other than the two discounts counts as a cost.
 */
export function dealSheetPriceDetails(
  items: { itemDetails?: { dealSelected?: boolean; quantity?: number; unitCost?: number; unitSellingPrice?: number }[] }[] | undefined,
  additionalCosts: { type?: string; value?: number }[] | undefined,
): DealPriceDetails {
  const details: DealPriceDetails = { totalSellingPrice: 0, totalCost: 0, profit: 0, perc: 0 };
  for (const item of items ?? []) {
    for (const d of item.itemDetails ?? []) {
      if (!d.dealSelected) continue;
      const quantity = num(d.quantity);
      details.totalSellingPrice += num(d.unitSellingPrice) * quantity;
      details.totalCost += num(d.unitCost) * quantity;
    }
  }
  for (const cost of additionalCosts ?? []) {
    const value = num(cost.value);
    if (cost.type === 'Customer Discount') details.totalSellingPrice -= value;
    else if (cost.type === 'Supplier Discount') details.totalCost -= value;
    else details.totalCost += value;
  }
  details.profit = details.totalSellingPrice - details.totalCost;
  details.perc = details.totalSellingPrice ? (details.profit / details.totalSellingPrice) * 100 : 0;
  return details;
}
