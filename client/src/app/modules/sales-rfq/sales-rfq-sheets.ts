import { SalesRfq, SalesRfqLine, SalesRfqSupplier, SalesRfqTerms } from 'src/app/shared/interfaces/sales-rfq.interface';
import { ItemSheetMeta, exportItemsSheet, itemSheetColumns } from 'src/app/shared/components/item-entry/item-entry-excel';
import { ItemEntryItemValue, ItemEntryLineValue } from 'src/app/shared/components/item-entry/item-entry.model';

/**
 * Supplier request sheets. Sending happens outside the system, so each supplier gets a sheet with
 * only its lines: the Excel file is the same one the RFQ drawer exports and imports (details on top,
 * lines below), or a printable page for PDF.
 */

const REPLY_TERMS: { field: keyof SalesRfqTerms; label: string }[] = [
  { field: 'currency', label: 'Currency' },
  { field: 'paymentTerms', label: 'Payment terms' },
  { field: 'deliveryTerms', label: 'Delivery terms / lead time' },
  { field: 'validityDate', label: 'Quote valid until (dd/mm/yyyy)' },
  { field: 'warrantyTerms', label: 'Warranty' },
];

export function linesForSupplier(rfq: SalesRfq, supplier: SalesRfqSupplier): SalesRfqLine[] {
  const keys = new Set(supplier.lineKeys || []);
  return (rfq.requestedLines || []).filter((line) => keys.has(line.itemDetailKey));
}

function fileBase(rfq: SalesRfq, supplier: SalesRfqSupplier): string {
  return `${rfq.rfqNo}-${supplier.supplierName}`.replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '_');
}

function fmtDate(value?: string): string {
  if (!value) return '';
  const d = new Date(value);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function requestedTermsRows(rfq: SalesRfq): [string, string][] {
  const t = rfq.requestedTerms || {};
  return ([
    ['Payment terms requested', t.paymentTerms],
    ['Delivery terms requested', t.deliveryTerms],
    ['Shipping terms', t.shippingTerms],
    ['Delivery location', t.deliveryLocation],
    ['Preferred currency', t.currency],
  ] as [string, string | undefined][]).filter(([, v]) => !!v) as [string, string][];
}

// --- Excel ---------------------------------------------------------------------

/** dd/mm/yyyy for the sheet's date cells. */
function sheetDate(value?: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  return isNaN(d.getTime()) ? '' : `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

/** dd/mm/yyyy or yyyy-mm-dd → yyyy-mm-dd. */
function parseSheetDate(text: string): string | undefined {
  if (!text) return undefined;
  const dmy = text.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
  if (dmy) {
    const year = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
    return `${year}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  }
  const d = new Date(text);
  return isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10);
}

/** What the sheet carries above the lines: reference details (ignored on import) then the RFQ's own fields (filled back in on import). */
export interface RfqSheetDetails {
  rfqNo?: string;
  enquiryNo?: string;
  customer?: string;
  supplierName?: string;
  supplierCode?: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  deadline?: string | null;
  requiredBy?: string | null;
  terms?: SalesRfqTerms;
  /** Valid-until is a supplier answer, so only RFQs being priced carry it. */
  withValidity?: boolean;
  notes?: string;
}

export function rfqSheetMeta(d: RfqSheetDetails): ItemSheetMeta[] {
  const info: [string, string | undefined][] = [
    ['RFQ no.', d.rfqNo],
    ['Enquiry', d.enquiryNo],
    ['Customer', d.customer],
    ['Supplier', d.supplierName],
    ['Supplier code', d.supplierCode],
    ['Contact', d.contactName],
    ['Phone', d.contactPhone],
    ['Email', d.contactEmail],
  ];
  const t = d.terms || {};
  const own: [string, string][] = [
    ['Prices by', sheetDate(d.deadline)],
    ['Goods needed by', sheetDate(d.requiredBy)],
    ['Currency', t.currency || ''],
    ['Payment terms', t.paymentTerms || ''],
    ['ETA terms', t.deliveryTerms || ''],
    ['Deliver to', t.deliveryLocation || ''],
    ...(d.withValidity ? [['Valid until', sheetDate(t.validityDate)] as [string, string]] : []),
    ['Notes', d.notes || ''],
  ];
  return [
    ...info.filter(([, v]) => !!v).map(([label, value]) => ({ label, value: value as string })),
    ...own.map(([label, value]) => ({ label, value })),
  ];
}

/** The RFQ fields found in an imported sheet's details; blank or missing ones are left out so they do not overwrite the form. */
export function readRfqSheetMeta(meta: Record<string, string>): { deadline?: string; requiredBy?: string; notes?: string; terms: SalesRfqTerms } {
  const text = (label: string) => (meta[label.toLowerCase()] || '').trim();
  const out: { deadline?: string; requiredBy?: string; notes?: string; terms: SalesRfqTerms } = { terms: {} };
  const deadline = parseSheetDate(text('Prices by'));
  if (deadline) out.deadline = deadline;
  const requiredBy = parseSheetDate(text('Goods needed by'));
  if (requiredBy) out.requiredBy = requiredBy;
  const validity = parseSheetDate(text('Valid until'));
  if (validity) out.terms.validityDate = validity;
  const fields: [keyof SalesRfqTerms, string][] = [['currency', 'Currency'], ['paymentTerms', 'Payment terms'], ['deliveryTerms', 'ETA terms'], ['deliveryLocation', 'Deliver to']];
  fields.forEach(([field, label]) => {
    const value = text(label);
    if (value) out.terms[field] = field === 'currency' ? value.toUpperCase() : value;
  });
  if (text('Notes')) out.notes = text('Notes');
  return out;
}

/** The same Excel as the RFQ drawer's Export, for an RFQ already saved: this supplier's lines, with any price it quoted. */
export async function downloadRequestSheet(rfq: SalesRfq, supplier: SalesRfqSupplier): Promise<void> {
  const enquiry: any = rfq.enquiryId && typeof rfq.enquiryId === 'object' ? rfq.enquiryId : {};
  const customer: any = rfq.customerId && typeof rfq.customerId === 'object' ? rfq.customerId : {};
  const groups = new Map<string, ItemEntryItemValue>();
  linesForSupplier(rfq, supplier).forEach((line) => {
    // The server populates the product on each line; an unlinked line has none.
    const raw: any = line.partNo;
    const product = raw && typeof raw === 'object' ? raw : null;
    const quote = (rfq.quotes || []).find((q) => q.inviteId === supplier._id && q.itemDetailKey === line.itemDetailKey);
    const group = groups.get(line.itemName) ?? { itemName: line.itemName, itemDetails: [] };
    group.itemDetails!.push({
      itemCode: product?.itemCode || '',
      partNo: product?.partNo || '',
      detail: line.detail,
      quantity: line.quantity,
      uom: line.uom || '',
      unitCost: quote?.unitPrice ?? null,
      availability: quote?.availability || '',
    } as ItemEntryLineValue);
    groups.set(line.itemName, group);
  });
  const meta = rfqSheetMeta({
    rfqNo: rfq.rfqNo,
    enquiryNo: enquiry.enquiryId,
    customer: customer.companyName || enquiry.client?.companyName,
    supplierName: supplier.supplierName,
    contactEmail: supplier.contactEmail,
    deadline: rfq.deadline,
    requiredBy: rfq.requiredBy,
    terms: { ...(rfq.requestedTerms || {}), ...(supplier.replyTerms?.validityDate ? { validityDate: supplier.replyTerms.validityDate } : {}) },
    withValidity: true,
    notes: rfq.notes,
  });
  await exportItemsSheet([...groups.values()], itemSheetColumns('rfq', true), `${fileBase(rfq, supplier)}.xlsx`, meta);
}

// --- printable sheet (Save as PDF from the print dialog) ------------------------

const esc = (value: unknown) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

export function printRequestSheet(rfq: SalesRfq, supplier: SalesRfqSupplier): boolean {
  const lines = linesForSupplier(rfq, supplier);
  const info: [string, string][] = [
    ['RFQ no.', rfq.rfqNo],
    ['Date', fmtDate(new Date().toISOString())],
    ['Supplier', supplier.supplierName],
    ['Prices needed by', fmtDate(rfq.deadline) || '-'],
    ...requestedTermsRows(rfq),
  ];
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(fileBase(rfq, supplier))}</title>
<style>
  body{font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#111;margin:24px}
  h1{font-size:18px;margin:0 0 12px}
  table{border-collapse:collapse;width:100%}
  .info td{padding:3px 8px 3px 0;vertical-align:top}.info td:first-child{font-weight:bold;width:180px}
  .lines{margin-top:16px}.lines th,.lines td{border:1px solid #999;padding:5px 6px;text-align:left;vertical-align:top}
  .lines th{background:#eee}.num{text-align:right}.fill{min-width:80px}
  .terms{margin-top:16px}.terms td{border:1px solid #999;padding:8px 6px}.terms td:first-child{width:220px;font-weight:bold;background:#f6f6f6}
  p.note{margin-top:12px;white-space:pre-line}
  @media print{body{margin:0}}
</style></head><body>
<h1>Request for Quotation</h1>
<table class="info">${info.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>
${rfq.notes ? `<p class="note">${esc(rfq.notes)}</p>` : ''}
<table class="lines"><thead><tr><th>#</th><th>Item</th><th>Description / specification</th><th class="num">Qty</th><th>UOM</th>
<th class="fill">Unit price</th><th class="fill">Availability</th></tr></thead><tbody>
${lines.map((l, i) => `<tr><td>${i + 1}</td><td>${esc(l.itemName)}</td><td>${esc(l.detail)}</td><td class="num">${esc(l.quantity)}</td><td>${esc(l.uom || '')}</td><td></td><td></td></tr>`).join('')}
</tbody></table>
<table class="terms">${REPLY_TERMS.map((t) => `<tr><td>${esc(t.label.replace(' (dd/mm/yyyy)', ''))}</td><td></td></tr>`).join('')}</table>
<script>window.onload=function(){window.print();}</script>
</body></html>`;
  const win = window.open('', '_blank');
  if (!win) return false;
  win.document.open();
  win.document.write(html);
  win.document.close();
  return true;
}

/** Plain-text body for the email to the supplier. */
export function requestEmailBody(rfq: SalesRfq, supplier: SalesRfqSupplier): string {
  const lines = linesForSupplier(rfq, supplier);
  const terms = requestedTermsRows(rfq).map(([k, v]) => `${k}: ${v}`);
  return [
    `Dear ${supplier.supplierName},`,
    '',
    `Please quote your best price and availability for the items below (our ref. ${rfq.rfqNo})${rfq.deadline ? ` by ${fmtDate(rfq.deadline)}` : ''}.`,
    '',
    ...lines.map((l, i) => `${i + 1}. ${l.itemName} - ${l.detail} - Qty ${l.quantity} ${l.uom || ''}`.trim()),
    ...(terms.length ? ['', ...terms] : []),
    '',
    'Please include payment terms, delivery lead time, quote validity and warranty. The attached sheet can be filled in and sent back.',
    '',
    'Regards',
  ].join('\n');
}
