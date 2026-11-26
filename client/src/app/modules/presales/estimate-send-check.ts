/** Line fields a presale estimate needs before it is sent to the enquiry or quote (saving accepts blanks). */
export const ESTIMATE_SEND_LINE_FIELDS = ['detail', 'quantity', 'uom', 'unitCost', 'profit', 'unitSellingPrice'];

const blank = (v: any) => v === undefined || v === null || String(v).trim() === '';

/** True when a saved estimation has no items, an item without a name, or a line missing a send-required value. */
export function estimateHasSendGaps(optionalItems: any): boolean {
  const options: any[] = Array.isArray(optionalItems) ? optionalItems : [];
  if (!options.some((o) => (o?.items ?? []).length)) return true;
  return options.some((o) => (o?.items ?? []).some((item: any) =>
    blank(item?.itemName) || !(item?.itemDetails ?? []).length
    || (item.itemDetails as any[]).some((line) => ESTIMATE_SEND_LINE_FIELDS.some((f) => blank(line?.[f])))));
}
