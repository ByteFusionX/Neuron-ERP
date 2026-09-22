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
