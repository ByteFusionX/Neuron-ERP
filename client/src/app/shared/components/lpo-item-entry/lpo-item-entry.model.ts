/** One line a supplier can still be ordered for, as the LPO endpoint reports it, plus the buyer's pick. */
export interface LpoIssueLine {
  item: any;
  picked: boolean;
  qty: number;
  /** Edits made on the LPO line; unset means the PR line's own value. */
  uom?: string;
  price?: number;
}

/** One supplier tab: what goes on one LPO. */
export interface LpoSupplierTab {
  key: string;
  label: string;
  count: number;
  paymentTerms?: string;
  etaTerms?: string;
  /** False when the supplier is not on record, so no LPO can be issued. */
  issuable?: boolean;
}

export const lineRemaining = (line: LpoIssueLine): number => Number(line.item.remainingQuantity) || 0;

export const lineUnitPrice = (line: LpoIssueLine): number =>
  Number(line.price ?? line.item.comparisons?.unitPrice ?? line.item.unitPrice) || 0;

export const lineUom = (line: LpoIssueLine): string => line.uom ?? line.item.uom ?? line.item.comparisons?.uom ?? '';

/** A line is open while something is left to order. */
export const lineIsOpen = (line: LpoIssueLine): boolean => !line.item.isIssued && lineRemaining(line) > 0;

export const lineQtyError = (line: LpoIssueLine): string | null => {
  if (!line.picked) return null;
  if (!(line.qty > 0)) return 'Must be more than 0';
  if (line.qty > lineRemaining(line)) return `Max ${lineRemaining(line)}`;
  return null;
};

export const lineTotalQty = (line: LpoIssueLine): number =>
  line.item.originalQuantity ?? line.item.comparisons?.quantity ?? line.item.quantity;
