import * as ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { ItemEntryItemValue, ItemEntryLineValue } from './item-entry.model';

/** One spreadsheet column and the line field it maps to. `item` is the item (group) name. */
export interface ItemSheetColumn {
  key: 'item' | 'itemCode' | 'partNo' | 'detail' | 'quantity' | 'uom' | 'unitCost' | 'unitSellingPrice' | 'availability' | 'paymentTerms' | 'deliveryTerms' | 'remarks' | 'offeredQty' | 'alternative';
  label: string;
  width: number;
  numeric?: boolean;
  /** Extra header names accepted on import. */
  aliases?: string[];
}

const ALL: ItemSheetColumn[] = [
  { key: 'item', label: 'Item', width: 22, aliases: ['item name', 'category', 'group'] },
  { key: 'itemCode', label: 'Item Code', width: 16, aliases: ['code', 'sku'] },
  { key: 'partNo', label: 'Part No', width: 16, aliases: ['part number', 'part no.', 'part #'] },
  { key: 'detail', label: 'Description', width: 48, aliases: ['detail', 'details', 'product', 'item description'] },
  { key: 'quantity', label: 'Qty', width: 10, numeric: true, aliases: ['quantity'] },
  { key: 'uom', label: 'Unit', width: 10, aliases: ['uom', 'unit of measure'] },
  { key: 'unitCost', label: 'Unit Cost', width: 14, numeric: true, aliases: ['cost', 'unit price', 'price'] },
  { key: 'unitSellingPrice', label: 'Selling Price', width: 14, numeric: true, aliases: ['unit selling price', 'selling'] },
  { key: 'availability', label: 'Availability', width: 18 },
  { key: 'offeredQty', label: 'Offered Qty', width: 14, numeric: true, aliases: ['supplier qty', 'qty offered', 'available qty'] },
  { key: 'alternative', label: 'Alternative Product', width: 28, aliases: ['alternative', 'alternate', 'alternative offered'] },
  { key: 'paymentTerms', label: 'Payment Terms', width: 20 },
  { key: 'deliveryTerms', label: 'Delivery Terms', width: 20 },
  { key: 'remarks', label: 'Remarks', width: 28, aliases: ['remark', 'notes'] },
];

/** Columns for a mode: an RFQ sheet is one format for create and edit (identifiers, quantity, price, availability); quote lines carry cost and selling price too. */
export function itemSheetColumns(mode: string, rfqPriced: boolean): ItemSheetColumn[] {
  const keys: ItemSheetColumn['key'][] = ['item', 'itemCode', 'partNo', 'detail', 'quantity', 'uom'];
  if (mode === 'rfq') keys.push('unitCost', 'availability');
  else if (mode === 'quote') keys.push('unitCost', 'unitSellingPrice', 'availability');
  else if (mode === 'purchase') keys.push('unitCost', 'availability');
  return ALL.filter((c) => keys.includes(c.key));
}

function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return '';
  if (typeof value === 'object') {
    const v: any = value;
    if (v.result !== undefined) return cellText(v.result);
    if (v.richText) return v.richText.map((r: any) => r.text).join('').trim();
    if (v.text !== undefined) return String(v.text).trim();
    if (value instanceof Date) return value.toISOString().slice(0, 10);
  }
  return String(value).trim();
}

function cellNumber(value: ExcelJS.CellValue): number | null {
  const text = cellText(value).replace(/,/g, '');
  if (!text) return null;
  const n = Number(text.replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

async function saveWorkbook(wb: ExcelJS.Workbook, fileName: string): Promise<void> {
  saveAs(new Blob([await wb.xlsx.writeBuffer()], { type: XLSX_TYPE }), fileName);
}

/** A detail above the item table (e.g. "Prices by"): label in column A, value in column B. */
export interface ItemSheetMeta {
  label: string;
  value: string;
}

const normText = (v: string) => v.toLowerCase().replace(/\s+/g, ' ').trim();

function newSheet(columns: ItemSheetColumn[], meta: ItemSheetMeta[] = []): { wb: ExcelJS.Workbook; ws: ExcelJS.Worksheet } {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Items');
  ws.columns = columns.map((c) => ({ key: c.key, width: c.width }));
  meta.forEach((m) => {
    const row = ws.addRow([m.label, m.value]);
    row.getCell(1).font = { bold: true };
    row.getCell(2).alignment = { wrapText: true, vertical: 'top' };
  });
  if (meta.length) ws.addRow([]);
  const head = ws.addRow(columns.map((c) => c.label));
  head.font = { bold: true };
  head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDE9FE' } };
  ws.views = [{ state: 'frozen', ySplit: head.number }];
  return { wb, ws };
}

/** Writes the details and the entered items (blank lines skipped) to an .xlsx download. Returns the row count. */
export async function exportItemsSheet(items: ItemEntryItemValue[], columns: ItemSheetColumn[], fileName: string, meta: ItemSheetMeta[] = []): Promise<number> {
  const { wb, ws } = newSheet(columns, meta);
  let rows = 0;
  items.forEach((item) => (item.itemDetails || []).forEach((d) => {
    if (!(d.detail || '').toString().trim() && d.quantity == null) return;
    ws.addRow(columns.map((c) => (c.key === 'item' ? item.itemName ?? '' : (d as any)[c.key] ?? '')));
    rows++;
  }));
  await saveWorkbook(wb, fileName);
  return rows;
}

/** An empty sheet with just the headers, so users know the expected format. */
export function downloadItemsTemplate(columns: ItemSheetColumn[], fileName: string, meta: ItemSheetMeta[] = []): Promise<void> {
  const { wb } = newSheet(columns, meta);
  return saveWorkbook(wb, fileName);
}

export interface ItemSheetImport {
  items: ItemEntryItemValue[];
  imported: number;
  /** Human-readable reasons rows were skipped, with their sheet row number. */
  skipped: string[];
  /** Details found above the table, keyed by lower-cased label. */
  meta: Record<string, string>;
}

/** Reads the first sheet. The header row is found by its names (so details may sit above it); column order and extra columns do not matter. */
export async function readItemsSheet(file: File, columns: ItemSheetColumn[]): Promise<ItemSheetImport> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('The file has no sheet.');

  const norm = normText;
  const at = new Map<ItemSheetColumn['key'], number>();
  let headerRow = 0;
  for (let r = 1; r <= Math.min(ws.rowCount, 40) && !headerRow; r++) {
    const found = new Map<ItemSheetColumn['key'], number>();
    ws.getRow(r).eachCell((cell, col) => {
      const name = norm(cellText(cell.value));
      const match = columns.find((c) => norm(c.label) === name || c.aliases?.some((a) => norm(a) === name));
      if (match && !found.has(match.key)) found.set(match.key, col);
    });
    if (found.has('detail') && found.has('quantity')) {
      headerRow = r;
      found.forEach((col, key) => at.set(key, col));
    }
  }
  if (!headerRow) throw new Error('The sheet needs "Description" and "Qty" columns. Export the lines first to get the expected format.');

  const meta: Record<string, string> = {};
  for (let r = 1; r < headerRow; r++) {
    const label = norm(cellText(ws.getRow(r).getCell(1).value));
    if (label) meta[label] = cellText(ws.getRow(r).getCell(2).value);
  }

  const text = (row: ExcelJS.Row, key: ItemSheetColumn['key']) => (at.has(key) ? cellText(row.getCell(at.get(key)!).value) : '');
  const num = (row: ExcelJS.Row, key: ItemSheetColumn['key']) => (at.has(key) ? cellNumber(row.getCell(at.get(key)!).value) : null);

  const groups = new Map<string, ItemEntryItemValue>();
  const skipped: string[] = [];
  let imported = 0;
  let lastItem = '';

  ws.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRow) return;
    const detail = text(row, 'detail');
    const qty = num(row, 'quantity');
    const item = text(row, 'item');
    if (!detail && qty == null && !item) return;
    if (!detail) { skipped.push(`Row ${rowNumber}: description is empty`); return; }
    if (qty == null || qty <= 0) { skipped.push(`Row ${rowNumber}: quantity must be more than 0`); return; }

    // A blank Item cell continues the item above it, as people leave it blank under a merged-looking group.
    const itemName = item || lastItem || 'Items';
    lastItem = itemName;
    const line: ItemEntryLineValue = {
      itemCode: text(row, 'itemCode'),
      partNo: text(row, 'partNo'),
      detail,
      quantity: qty,
      uom: text(row, 'uom'),
      unitCost: num(row, 'unitCost'),
      unitSellingPrice: num(row, 'unitSellingPrice'),
      availability: text(row, 'availability'),
      paymentTerms: text(row, 'paymentTerms'),
      deliveryTerms: text(row, 'deliveryTerms'),
      remarks: text(row, 'remarks'),
      offeredQty: num(row, 'offeredQty'),
      alternative: text(row, 'alternative'),
    };
    const groupKey = norm(itemName);
    const group = groups.get(groupKey) ?? { itemName, itemDetails: [] };
    group.itemDetails!.push(line);
    groups.set(groupKey, group);
    imported++;
  });

  return { items: [...groups.values()], imported, skipped, meta };
}
