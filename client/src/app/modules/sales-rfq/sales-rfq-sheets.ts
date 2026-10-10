import * as ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import {
  SalesRfq,
  SalesRfqAvailability,
  SalesRfqLine,
  SalesRfqReplyPrice,
  SalesRfqSupplier,
  SalesRfqTerms,
} from 'src/app/shared/interfaces/sales-rfq.interface';

/**
 * Supplier request sheets. Sending happens outside the system, so each supplier gets a sheet with
 * only its lines: an Excel file it can fill in and send back (re-imported with `readReplySheet`),
 * or a printable page for PDF. Column A of the Excel file carries hidden tags (`LINE:<key>`,
 * `TERM:<field>`) so the import does not depend on the supplier keeping the layout intact.
 */

const REPLY_TERMS: { field: keyof SalesRfqTerms; label: string }[] = [
  { field: 'currency', label: 'Currency' },
  { field: 'paymentTerms', label: 'Payment terms' },
  { field: 'deliveryTerms', label: 'Delivery terms / lead time' },
  { field: 'validityDate', label: 'Quote valid until (dd/mm/yyyy)' },
  { field: 'warrantyTerms', label: 'Warranty' },
];

const AVAILABILITY: SalesRfqAvailability[] = ['Available', 'Limited', 'Unavailable'];

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
    ['Incoterm', t.incoterm],
    ['Delivery location', t.deliveryLocation],
    ['Preferred currency', t.currency],
  ] as [string, string | undefined][]).filter(([, v]) => !!v) as [string, string][];
}

// --- Excel ---------------------------------------------------------------------

export async function downloadRequestSheet(rfq: SalesRfq, supplier: SalesRfqSupplier): Promise<void> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('RFQ');
  ws.columns = [
    { key: 'tag', width: 4, hidden: true },
    { key: 'no', width: 6 },
    { key: 'item', width: 24 },
    { key: 'detail', width: 48 },
    { key: 'qty', width: 8 },
    { key: 'uom', width: 8 },
    { key: 'price', width: 14 },
    { key: 'avail', width: 14 },
    { key: 'lead', width: 12 },
    { key: 'remarks', width: 30 },
  ];

  const title = ws.addRow(['', 'Request for Quotation']);
  title.font = { bold: true, size: 14 };
  const info: [string, string][] = [
    ['RFQ no.', rfq.rfqNo],
    ['Supplier', supplier.supplierName],
    ['Prices needed by', fmtDate(rfq.deadline) || '-'],
    ...requestedTermsRows(rfq),
  ];
  info.forEach(([label, value]) => {
    const row = ws.addRow(['', label, value]);
    row.getCell(2).font = { bold: true };
  });
  if (rfq.notes) ws.addRow(['', 'Notes', rfq.notes]).getCell(2).font = { bold: true };

  ws.addRow([]);
  ws.addRow(['', 'Your terms (please fill in)']).font = { bold: true, color: { argb: 'FF1D4ED8' } };
  REPLY_TERMS.forEach(({ field, label }) => {
    const row = ws.addRow([`TERM:${field}`, label, '']);
    row.getCell(2).font = { bold: true };
    const cell = row.getCell(3);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF9C3' } };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFCA8A04' } } };
    if (field === 'currency') cell.value = rfq.requestedTerms?.currency || 'QAR';
  });

  ws.addRow([]);
  const header = ws.addRow(['', '#', 'Item', 'Description / specification', 'Qty', 'UOM', 'Unit price', 'Availability', 'Lead time (days)', 'Remarks']);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.eachCell((cell, col) => {
    if (col > 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
  });

  linesForSupplier(rfq, supplier).forEach((line, i) => {
    const row = ws.addRow([`LINE:${line.itemDetailKey}`, i + 1, line.itemName, line.detail, line.quantity, line.uom || '', null, 'Available', null, '']);
    row.getCell(4).alignment = { wrapText: true, vertical: 'top' };
    [7, 8, 9, 10].forEach((col) => {
      row.getCell(col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF9C3' } };
    });
    row.getCell(7).numFmt = '#,##0.00';
    row.getCell(8).dataValidation = { type: 'list', allowBlank: true, formulae: [`"${AVAILABILITY.join(',')}"`] };
  });

  const buffer = await wb.xlsx.writeBuffer();
  saveAs(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${fileBase(rfq, supplier)}.xlsx`);
}

/** Every price row and the reply terms; a row without a price and not "Unavailable" is left blank. */
export interface ReplySheet {
  terms: SalesRfqTerms;
  prices: SalesRfqReplyPrice[];
  /** Tagged rows whose line no longer exists on the RFQ. */
  unknownLines: number;
}

function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    const v: any = value;
    if (v.result !== undefined) return cellText(v.result);
    if (v.richText) return v.richText.map((r: any) => r.text).join('');
    if (v.text !== undefined) return String(v.text);
  }
  return String(value).trim();
}

function cellNumber(value: ExcelJS.CellValue): number | null {
  const text = cellText(value).replace(/,/g, '');
  if (!text) return null;
  const n = Number(text.replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** dd/mm/yyyy, yyyy-mm-dd or an Excel date cell → yyyy-mm-dd. */
function parseDate(value: ExcelJS.CellValue): string | undefined {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = cellText(value);
  if (!text) return undefined;
  const dmy = text.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
  if (dmy) {
    const year = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
    return `${year}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  }
  const d = new Date(text);
  return isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10);
}

export async function readReplySheet(file: File, rfq: SalesRfq): Promise<ReplySheet> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('The file has no sheet.');
  const known = new Set((rfq.requestedLines || []).map((line) => line.itemDetailKey));
  const result: ReplySheet = { terms: {}, prices: [], unknownLines: 0 };
  let tagged = false;

  ws.eachRow((row) => {
    const tag = cellText(row.getCell(1).value);
    if (tag.startsWith('TERM:')) {
      tagged = true;
      const field = tag.slice(5) as keyof SalesRfqTerms;
      const value = field === 'validityDate' ? parseDate(row.getCell(3).value) : cellText(row.getCell(3).value);
      if (value) (result.terms as any)[field] = value;
    } else if (tag.startsWith('LINE:')) {
      tagged = true;
      const key = tag.slice(5);
      if (!known.has(key)) {
        result.unknownLines++;
        return;
      }
      const availText = cellText(row.getCell(8).value).toLowerCase();
      const availability = (AVAILABILITY.find((a) => a.toLowerCase() === availText) || 'Available') as SalesRfqAvailability;
      const unitPrice = cellNumber(row.getCell(7).value);
      if (unitPrice == null && availability !== 'Unavailable') return;
      result.prices.push({
        itemDetailKey: key,
        unitPrice: availability === 'Unavailable' ? null : unitPrice,
        availability,
        leadTimeDays: cellNumber(row.getCell(9).value),
        remarks: cellText(row.getCell(10).value) || undefined,
      });
    }
  });
  if (!tagged) throw new Error('This is not a request sheet downloaded from this RFQ.');
  return result;
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
<th class="fill">Unit price</th><th class="fill">Availability</th><th class="fill">Lead time</th><th class="fill">Remarks</th></tr></thead><tbody>
${lines.map((l, i) => `<tr><td>${i + 1}</td><td>${esc(l.itemName)}</td><td>${esc(l.detail)}</td><td class="num">${esc(l.quantity)}</td><td>${esc(l.uom || '')}</td><td></td><td></td><td></td><td></td></tr>`).join('')}
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
