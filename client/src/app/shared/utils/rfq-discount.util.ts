/** A supplier's discount on its whole RFQ quote. */
export interface RfqTotalDiscount {
  totalDiscountType?: 'amount' | 'percent';
  totalDiscountValue?: number;
  /** Unit price × quoted qty over every priced line. */
  quotedTotal?: number;
}

/**
 * The share of a supplier's total RFQ discount that falls on `value` (an award or one PO): a percent applies as is,
 * an amount is pro-rated by value against everything the supplier quoted. Several POs for one supplier each take
 * their own share, so together they never exceed the discount.
 */
export function proratedRfqDiscount(d: RfqTotalDiscount | undefined, value: number): number {
  const v = Number(d?.totalDiscountValue) || 0;
  if (!(v > 0) || !(value > 0)) return 0;
  const share = d?.totalDiscountType === 'percent'
    ? (value * Math.min(v, 100)) / 100
    : (Number(d?.quotedTotal) || 0) > 0 ? Math.min(v, (v * value) / Number(d!.quotedTotal)) : 0;
  return Math.round(Math.min(share, value) * 100) / 100;
}
