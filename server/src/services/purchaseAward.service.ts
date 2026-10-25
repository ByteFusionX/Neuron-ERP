/**
 * Supplier choices on a purchase request line, kept on the line's comparisons: one comparison per supplier
 * with its price, `selected` when it supplies the line, and `awardedQty` the share it supplies.
 */

const num = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const round4 = (v: number) => Number(v.toFixed(4));

export interface LineAward {
    lineKey: string;
    supplierId: string;
    /** The share this supplier supplies; blank = the whole line. */
    qty?: number;
    /** A price for a supplier with no comparison on the line yet. */
    unitPrice?: number;
    supplierName?: string;
    /** Takes the supplier off the line. */
    clear?: boolean;
}

export const findLine = (purchase: any, lineKey: string): any =>
    (purchase.items || []).flatMap((item: any) => item.itemDetails || []).find((d: any) => String(d._id) === String(lineKey));

/** The line's cost, supplier and name follow its chosen suppliers: a split line costs the share-weighted average. */
export const settleLine = (detail: any) => {
    const won = (detail.comparisons || []).filter((c: any) => c.selected && c.supplierId);
    if (!won.length) return;
    const total = won.reduce((sum: number, c: any) => sum + num(c.awardedQty), 0);
    if (total > 0) detail.unitCost = round4(won.reduce((sum: number, c: any) => sum + num(c.unitPrice) * num(c.awardedQty), 0) / total);
    const lead = won.reduce((a: any, b: any) => (num(b.awardedQty) > num(a.awardedQty) ? b : a));
    detail.supplierId = lead.supplierId;
    const names = Array.from(new Set<string>(won.map((c: any) => String(c.supplierName || '')).filter(Boolean)));
    if (names.length) detail.supplierName = names.join(' / ');
};

/**
 * Applies one award to its line. The whole line takes it from every other supplier; a share keeps the others,
 * trimmed (in their order) so the shares never add up to more than the line needs.
 * Returns an error message, or null when applied.
 */
export const applyLineAward = (purchase: any, award: LineAward, employeeId: any): string | null => {
    const detail = findLine(purchase, award.lineKey);
    if (!detail) return 'That product is not on this request.';
    const lineQty = num(detail.quantity);
    detail.comparisons = detail.comparisons || [];
    let mine = detail.comparisons.find((c: any) => String(c.supplierId) === String(award.supplierId));

    if (award.clear) {
        if (mine) { mine.selected = false; mine.awardedQty = undefined; }
        settleLine(detail);
        return null;
    }

    if (!mine) {
        if (!(num(award.unitPrice) > 0)) return `Enter a price for this supplier on "${detail.detail}".`;
        detail.comparisons.push({
            supplierId: award.supplierId, supplierName: award.supplierName, quantity: lineQty, unitPrice: num(award.unitPrice),
            paymentTerms: 'Not specified', selected: false, createdBy: employeeId, createdAt: new Date(),
        });
        mine = detail.comparisons[detail.comparisons.length - 1];
    } else if (num(award.unitPrice) > 0) {
        mine.unitPrice = num(award.unitPrice);
    }
    if (!(num(mine.unitPrice) > 0)) return `This supplier has no price for "${detail.detail}".`;

    const share = award.qty != null && num(award.qty) > 0 ? Math.min(num(award.qty), lineQty) : lineQty;
    let room = round4(lineQty - share);
    detail.comparisons.forEach((c: any) => {
        if (c === mine || !c.selected) return;
        const had = num(c.awardedQty) || num(c.quantity) || lineQty;
        const keep = Math.min(had, room);
        room = round4(room - keep);
        if (keep > 0) { c.awardedQty = keep; c.quantity = keep; }
        else { c.selected = false; c.awardedQty = undefined; }
    });
    mine.selected = true;
    mine.awardedQty = share;
    mine.quantity = share;
    settleLine(detail);
    return null;
};
