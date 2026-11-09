/**
 * The discount that belongs to one PO. The PR holds a supplier's discount for everything awarded to them; a PO that
 * carries only some of those items takes its share (a percent applies as is, an amount is split by value).
 * Falls back to the discount saved on the PO when the PR has none for the supplier.
 */
export function poShareDiscount(po: any, pr: any = po?.purchaseId): number {
  const lines: any[] = po?.items || [];
  const value = lines.reduce((s, l) => s + (Number(l.totalCost) || (Number(l.unitCost) || 0) * (Number(l.quantity) || 0)), 0);
  const idOf = (v: any) => String(v?._id ?? v ?? '');
  const supplierId = idOf(po?.supplierId);
  const entry = (pr?.supplierDiscounts?.suppliers ?? []).find((d: any) => idOf(d.supplierId) === supplierId);
  const typed = Number(entry?.discount) || 0;
  const saved = Number(po?.discount) || 0;
  if (!(typed > 0) || !(value > 0)) return saved;
  if (entry.discountType === 'percent') return round(Math.min((value * Math.min(typed, 100)) / 100, value));
  // everything awarded to this supplier on the PR
  const awarded = (pr?.items ?? []).flatMap((i: any) => i?.itemDetails ?? []).reduce((s: number, d: any) => {
    const c = (d?.comparisons ?? []).find((x: any) => x.selected && idOf(x.supplierId) === supplierId);
    return s + (c ? (Number(c.unitPrice) || 0) * (Number(c.quantity) || 0) : 0);
  }, 0);
  const share = awarded > 0 ? (typed * value) / awarded : typed;
  return round(Math.min(typed, share, value));
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
