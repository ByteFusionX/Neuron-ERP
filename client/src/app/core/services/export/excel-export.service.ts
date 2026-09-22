import { Injectable } from '@angular/core';
import * as ExcelJS from 'exceljs';
import * as FileSaver from 'file-saver';

export interface ExcelColumn {
  header: string;
  key: string;
  width?: number;
}

export interface ExcelSheet {
  name: string;
  columns: ExcelColumn[];
  rows: Record<string, unknown>[];
}

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Builds a workbook from plain sheet definitions (bold header row, one sheet per entry) and downloads it.
 * Callers shape their own rows; this only owns the workbook plumbing.
 */
@Injectable({ providedIn: 'root' })
export class ExcelExportService {
  async download(fileName: string, sheets: ExcelSheet[]): Promise<void> {
    const workbook = new ExcelJS.Workbook();
    sheets.forEach((s) => {
      const sheet = workbook.addWorksheet(s.name);
      sheet.columns = s.columns.map((c) => ({ header: c.header, key: c.key, width: c.width }));
      s.rows.forEach((row) => sheet.addRow(row));
      sheet.getRow(1).font = { bold: true };
    });
    const buffer = await workbook.xlsx.writeBuffer();
    FileSaver.saveAs(new Blob([buffer], { type: XLSX_MIME }), fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`);
  }
}
