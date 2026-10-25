export type SalesRfqStatus = 'Draft' | 'Open' | 'Quoted' | 'Awarded' | 'Closed' | 'Cancelled';
export type SalesRfqLineStatus = 'Pending' | 'Confirmed' | 'Unavailable' | 'Lost';
/** A label from the Availability master list (e.g. "Ex-Stock", "2-3 Weeks"), or 'Unavailable' when the supplier cannot supply. */
export type SalesRfqAvailability = string;

/** Sales-facing labels for the shared RFQ statuses. */
export const SALES_RFQ_STATUS_LABELS: Record<string, string> = {
  Draft: 'Draft',
  Open: 'Awaiting Prices',
  Quoted: 'Prices In',
  Awarded: 'Ready to Quote',
  Closed: 'Quoted',
  Cancelled: 'Cancelled',
};

/** Pill classes per sales-facing status label. */
export const SALES_RFQ_BADGE_CLASSES: Record<string, string> = {
  'Draft': 'bg-gray-100 text-gray-700 ring-gray-200 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700 dark:border-gray-700',
  'Awaiting Prices': 'bg-amber-50 text-amber-700 ring-amber-200 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900 dark:border-amber-900',
  'Prices In': 'bg-sky-50 text-sky-700 ring-sky-200 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:ring-sky-900 dark:border-sky-900',
  'Ready to Quote': 'bg-emerald-50 text-emerald-700 ring-emerald-200 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900 dark:border-emerald-900',
  'Quoted': 'bg-slate-100 text-slate-700 ring-slate-200 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700 dark:border-slate-700',
  'Cancelled': 'bg-red-50 text-red-700 ring-red-200 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900 dark:border-red-900',
  'Not Selected': 'bg-gray-100 text-gray-500 ring-gray-200 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:ring-gray-700 dark:border-gray-700',
};

/** Label for an RFQ's status; Closed without a quotation means every product went to other suppliers. */
export const salesRfqStatusLabel = (status: string, hasQuotation?: boolean): string =>
  status === 'Closed' && !hasQuotation ? 'Not Selected' : SALES_RFQ_STATUS_LABELS[status] || status;

/** One supplier RFQ as a column of the enquiry comparison. */
export interface SalesRfqCompareColumn {
  _id: string;
  rfqNo: string;
  status: SalesRfqStatus;
  supplierName: string;
  supplierId?: string;
  supplierStatus?: SalesRfqSupplierStatus;
  sentVia?: string;
  declineReason?: string;
  replyTerms?: SalesRfqTerms;
  /** Discount on the supplier's whole quote, taken after line discounts. */
  totalDiscountType?: 'amount' | 'percent';
  totalDiscountValue?: number;
  /** Unit price × quoted qty over every priced line: what an amount discount is pro-rated against. */
  quotedTotal?: number;
  /** What was asked of the supplier when the RFQ was created. */
  requestedTerms?: SalesRfqTerms;
  deadline?: string;
  quotationId?: string | null;
  lineCount: number;
  wonCount: number;
}

export interface SalesRfqCompareCell {
  rfqId: string;
  lineKey: string;
  lineStatus: SalesRfqLineStatus;
  awardReason?: string;
  /** What this supplier won of the product: all of it, or its share when the product is split. 0 when not won. */
  awardedQty?: number;
  quote: {
    _id: string;
    unitPrice?: number;
    unitPriceQar?: number | null;
    unitLanded: number | null;
    unitLandedQar: number | null;
    currency: string;
    leadTimeDays?: number;
    availability?: SalesRfqAvailability;
    quantity?: number;
    remarks?: string;
    validityDate?: string;
    selected: boolean;
  } | null;
}

/** 'waiting' = no usable price yet; 'open' = priced but not awarded; 'partial' = split, with quantity still to award. */
export type SalesRfqCompareRowStatus = 'awarded' | 'partial' | 'open' | 'waiting' | 'unavailable';

export interface SalesRfqCompareRow {
  key: string;
  itemName: string;
  detail: string;
  quantity: number;
  uom?: string;
  partNo?: string;
  itemCode?: string;
  status: SalesRfqCompareRowStatus;
  /** Purchase request: the supplier already chosen for this line on the job sheet. */
  currentSupplier?: string;
  awardedRfqId: string | null;
  /** Quantity already awarded across suppliers. */
  allocatedQty?: number;
  lowestRfqId: string | null;
  /** What we last paid for this product on a purchase order (any supplier), unit price in QAR. */
  lastPaid?: { priceQar: number | null; poNo?: string; poDate?: string; supplierName?: string } | null;
  /** Purchase request: the buyer accepted this line as not fully covered, with a reason. */
  short?: boolean;
  shortReason?: string;
  cells: SalesRfqCompareCell[];
}

/** A supplier's latest priced quote for a product on another request; referenced from there, never copied. */
export interface SalesRfqPastQuote {
  rfqNo?: string;
  purchaseNo?: string;
  unitPrice: number;
  currency: string;
  /** Quantity the supplier quoted for. */
  quantity: number;
  quotedAt?: string;
  awarded: boolean;
  awardedAt?: string;
  /** Quantity awarded to this supplier for the product across other requests. */
  awardedQty: number;
}

export interface SalesRfqComparison {
  enquiry: { _id: string; enquiryId?: string; title?: string; status?: string; client?: { companyName?: string } };
  rfqs: SalesRfqCompareColumn[];
  rows: SalesRfqCompareRow[];
  /** `short` (purchase request): lines marked short, not counted in `open`. */
  coverage: { total: number; awarded: number; unavailable: number; open: number; short?: number };
  /** Purchase request: products no supplier has been asked about yet (they are not in `rows`). */
  unasked?: { itemDetailKey: string; itemName: string; detail: string; quantity: number; uom?: string; itemCode?: string; currentSupplier?: string; short?: boolean; shortReason?: string }[];
  /** Purchase request: suppliers asked about the same product on other requests, by line key. */
  previousSuppliers?: Record<string, { supplierId?: string; supplierName: string; last?: SalesRfqPastQuote }[]>;
  quotationId: string | null;
}

export interface SalesRfqEnquiryAward {
  rfqId: string;
  lineKey: string;
  quoteId: string | null;
  reason?: string;
  /** Purchase request split award: this supplier takes only this part of the quantity. 0 with a null quoteId takes back just this share. */
  qty?: number;
}

export interface SalesRfqLine {
  itemDetailKey: string;
  itemName: string;
  detail: string;
  quantity: number;
  uom?: string;
  estimatedUnitCost?: number;
  partNo?: string;
  isNewItem?: boolean;
  lineStatus?: SalesRfqLineStatus;
  /** Why the confirmed price is not the lowest one on the line. */
  awardReason?: string;
}

export type SalesRfqLineInput = Partial<SalesRfqLine> & Pick<SalesRfqLine, 'itemName' | 'detail' | 'quantity'>;

export interface SalesRfqQuote {
  _id: string;
  inviteId?: string;
  itemDetailKey: string;
  itemName?: string;
  detail: string;
  quantity: number;
  supplierId?: string;
  supplierName?: string;
  isSupplierApproved?: boolean;
  unitPrice?: number;
  availability?: SalesRfqAvailability;
  currency?: string;
  /** QAR per one unit of `currency`, captured with the price. */
  exchangeRate?: number;
  leadTimeDays?: number;
  discountType?: 'amount' | 'percent';
  discountValue?: number;
  taxPercent?: number;
  freightCost?: number;
  totalCost?: number;
  netAmount?: number;
  landedCost?: number;
  etaTerms?: string;
  paymentTerms?: string;
  validityDate?: string;
  warrantyTerms?: string;
  productId?: string;
  brandOffered?: string;
  modelOffered?: string;
  moq?: number;
  isAlternative?: boolean;
  remarks?: string;
  attachments?: { fileName: string; originalname?: string; uploadedAt?: string }[];
  selected: boolean;
  createdAt?: string;
}

export type SalesRfqQuoteInput = Partial<Omit<SalesRfqQuote, '_id' | 'selected' | 'attachments'>>;

export type SalesRfqSupplierStatus = 'Not Sent' | 'Sent' | 'Replied' | 'Declined';

/** Same list as the server's RFQ_DECLINE_REASONS. */
export const SALES_RFQ_DECLINE_REASONS = ['Price not competitive', 'No stock', 'Lead time too long', 'Not in their range', 'Terms not acceptable', 'No response', 'Other'] as const;

/** A chase on the RFQ, for one supplier when `inviteId` is set. */
export interface SalesRfqFollowUp {
  _id: string;
  inviteId?: string;
  supplierName?: string;
  status: 'scheduled' | 'done' | 'cancelled';
  dueDate?: string;
  outcome?: string;
  note?: string;
  completedAt?: string;
  cancelReason?: string;
  auto?: boolean;
  createdByName?: string;
  createdAt?: string;
}

/** Another open request to the same supplier, so requests can be bundled instead of sent twice. */
export interface SalesRfqSupplierActivity {
  supplierId: string;
  supplierName: string;
  rfqId: string;
  rfqNo: string;
  enquiryNo: string;
  customer: string;
  status: SalesRfqSupplierStatus;
  sentAt: string | null;
  createdAt: string;
  lineCount: number;
  /** Lines asked there that are also on this RFQ (same product or description). */
  overlap: string[];
  thisWeek: boolean;
}

export interface SalesRfqFxRates {
  base: 'QAR';
  /** QAR per one unit of each currency. */
  rates: Record<string, number>;
  asOf: string | null;
}

export interface SalesRfqTerms {
  paymentTerms?: string;
  deliveryTerms?: string;
  shippingTerms?: string;
  deliveryLocation?: string;
  validityDate?: string;
  currency?: string;
  warrantyTerms?: string;
}

/** One supplier asked to price some of the lines. */
export interface SalesRfqSupplier {
  _id: string;
  supplierId?: string;
  supplierName: string;
  contactEmail?: string;
  isSupplierApproved?: boolean;
  lineKeys: string[];
  status: SalesRfqSupplierStatus;
  sentAt?: string;
  sentVia?: string;
  repliedAt?: string;
  replyTerms?: SalesRfqTerms;
  attachments?: { fileName: string; originalname?: string; uploadedAt?: string }[];
  remarks?: string;
  declineReason?: string;
  declineNote?: string;
}

export interface SalesRfqSupplierInput {
  supplierId: string;
  contactEmail?: string;
  lineKeys: string[];
}

/** A supplier offered by the RFQ form's picker. */
export interface SalesRfqSupplierOption {
  supplierId: string;
  supplierName: string;
  contactEmail?: string;
  isSupplierApproved: boolean;
  /** This supplier already holds a live RFQ for the enquiry (its number in `askedRfqNo`). */
  alreadyAsked?: boolean;
  askedRfqNo?: string;
  /** Details from the supplier master, shown in the drawer banner. */
  code?: string;
  contactName?: string;
  contactPhone?: string;
  companyEmail?: string;
  address?: string;
  creditDays?: number | null;
  creditLimit?: number | null;
}

export interface SalesRfqReplyPrice {
  itemDetailKey: string;
  unitPrice?: number | null;
  availability?: SalesRfqAvailability;
  leadTimeDays?: number | null;
  quantity?: number;
  remarks?: string;
  paymentTerms?: string;
  deliveryTerms?: string;
  modelOffered?: string;
  isAlternative?: boolean;
}

/** Stock position of one RFQ line, and the suppliers to ask when it is short. */
export interface SalesRfqStockCheck {
  itemDetailKey: string;
  matched: boolean;
  productId?: string;
  partNo?: string;
  itemCode?: string;
  uom?: string;
  requested: number;
  available: number | null;
  inStock: boolean;
  /** Unit cost of the newest stock batch that still has free quantity; null when nothing is on hand. */
  stockUnitCost?: number | null;
  stockCostDate?: string | null;
  suppliers: {
    supplierId: string;
    supplierName: string;
    contactEmail?: string;
    source: 'Default vendor' | 'Bought before';
    lastUnitCost: number | null;
    lastDate: string | null;
  }[];
}

export interface SalesRfq {
  _id: string;
  rfqNo: string;
  rfqType: 'Sales';
  status: SalesRfqStatus;
  enquiryId: any;
  customerId?: any;
  quotationId?: { _id: string; quoteId?: string; status?: string } | null;
  fromPresale?: boolean;
  requestedLines: SalesRfqLine[];
  quotes: SalesRfqQuote[];
  suppliers?: SalesRfqSupplier[];
  requestedTerms?: SalesRfqTerms;
  deadline?: string;
  /** When the customer needs the goods. */
  requiredBy?: string;
  followUps?: SalesRfqFollowUp[];
  nextFollowUpDate?: string;
  notes?: string;
  createdBy?: any;
  createdAt: string;
  updatedAt?: string;
}

/** Products of an enquiry settled across its supplier RFQs; `open` is what still needs an award. */
export interface SalesRfqAwardCoverage {
  total: number;
  awarded: number;
  unavailable: number;
  open: number;
}

export interface SalesRfqSummary {
  _id: string;
  rfqNo: string;
  enquiryId: string;
  status: SalesRfqStatus;
  requestedLines: { lineStatus?: SalesRfqLineStatus }[];
  suppliers?: { status: SalesRfqSupplierStatus }[];
  deadline?: string;
}

/** A line of a purchase request as the RFQ drawer lists it; `itemDetailKey` is the saved line's id. */
export interface PurchaseRfqLine {
  itemDetailKey: string;
  itemName: string;
  detail: string;
  quantity: number;
  uom?: string;
  partNo?: string;
  itemCode?: string;
  estimatedUnitCost?: number;
  /** Supplier the line is awarded to, when it is. */
  awardedSupplier?: string;
  /** Suppliers with an offer on file for the line, and the supplier name typed on it. */
  suppliers?: { supplierId: string; supplierName?: string }[];
  supplierName?: string;
}

/** A supplier RFQ raised from a purchase request (same shape as a sales RFQ, tied to the request instead of an enquiry). */
export type PurchaseRfq = Omit<SalesRfq, 'rfqType' | 'enquiryId'> & { rfqType: 'Procurement'; purchaseRequestId: string; purchaseNo?: string };

/** One PO on a request line, as the PO step lists it. */
export interface PurchaseOrderStatusPo {
  _id: string;
  poNo: string;
  poStatus: string;
  qty: number;
  receivedQty: number;
  cancelledQty: number;
}

/** A supplier on a request line: awarded share, what its POs hold, and what is still to order. */
export interface PurchaseOrderStatusSupplier {
  supplierId: string;
  supplierName: string;
  awardedQty: number;
  unitPrice: number | null;
  orderedQty: number;
  receivedQty: number;
  cancelledQty: number;
  freeQty: number;
  pos: PurchaseOrderStatusPo[];
}

export interface PurchaseOrderStatusRow {
  lineKey: string;
  itemName?: string;
  detail: string;
  uom?: string;
  quantity: number;
  short: boolean;
  awardedQty: number;
  orderedQty: number;
  receivedQty: number;
  cancelledQty: number;
  toOrderQty: number;
  unawardedQty: number;
  suppliers: PurchaseOrderStatusSupplier[];
}

export interface PurchaseOrderStatus {
  purchaseId: string;
  status: string;
  currency: string;
  rows: PurchaseOrderStatusRow[];
}

export interface PurchaseRfqData {
  purchase: { _id: string; purchaseNo: string; status: string; editable: boolean; currency: string; hasJob?: boolean };
  lines: PurchaseRfqLine[];
  rfqs: PurchaseRfq[];
}
