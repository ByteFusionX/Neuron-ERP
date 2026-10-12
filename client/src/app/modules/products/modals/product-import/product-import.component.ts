import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { FormModalShellComponent, ModalRef } from 'src/app/shared/components/modal';
import { ProductImportResult, ProductImportRow, ProductService } from 'src/app/core/services/product/product.service';

const HEADER_ALIASES: Record<string, keyof ProductImportRow> = {
  partno: 'partNo', partnumber: 'partNo', part: 'partNo',
  brand: 'brand', make: 'brand', manufacturer: 'brand',
  description: 'productDescription', productdescription: 'productDescription', desc: 'productDescription',
  name: 'productName', productname: 'productName',
  uom: 'unitOfMeasure', unit: 'unitOfMeasure', unitofmeasure: 'unitOfMeasure',
  model: 'parentModel', family: 'parentModel', modelfamily: 'parentModel', parentmodel: 'parentModel',
};

/** Splits one line on the delimiter (tab when pasted from Excel, else comma), honouring double quotes. */
function splitLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) { cells.push(cell.trim()); cell = ''; }
    else cell += ch;
  }
  cells.push(cell.trim());
  return cells;
}

/** First line is the header; columns are matched by name, in any order. */
export function parseImportText(text: string): { rows: ProductImportRow[]; error?: string } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { rows: [], error: 'Paste a header row followed by at least one product.' };
  const delimiter = lines[0].includes('\t') ? '\t' : ',';
  const keys = splitLine(lines[0], delimiter).map((h) => HEADER_ALIASES[h.toLowerCase().replace(/[^a-z]/g, '')]);
  if (!keys.includes('productDescription')) return { rows: [], error: 'The header row needs a Description column.' };
  const rows = lines.slice(1).map((line) => {
    const cells = splitLine(line, delimiter);
    const row: any = {};
    keys.forEach((k, i) => { if (k && cells[i]) row[k] = cells[i]; });
    return row as ProductImportRow;
  });
  return { rows };
}

/** Bulk import: paste from Excel or load a CSV, check every row against the catalogue, then import as Pending for review. */
@Component({
  selector: 'app-product-import',
  standalone: true,
  imports: [FormsModule, FormModalShellComponent],
  template: `
    <app-form-modal-shell
      icon="plus" tone="violet" title="Import products"
      contextEmptyText="Rows are saved as Pending and appear under Needs review."
      formId="product-import-form" [saving]="saving"
      [submitLabel]="checked && canImport ? 'Import ' + okCount + ' product(s)' : (result && !result.dryRun ? 'Done' : 'Check rows')"
      savingLabel="Working..." submitShortcutVerb="continue"
      (closed)="close()">
      <form id="product-import-form" (ngSubmit)="submit()" class="space-y-3">
        <p class="text-xs text-gray-500 dark:text-gray-400">
          First row is the header. Columns: Part No, Brand, Description (required), Name, UOM, Model. Up to 1000 rows.
        </p>
        <input type="file" accept=".csv,.tsv,.txt" (change)="onFile($event)" class="text-xs" />
        <textarea name="text" [(ngModel)]="text" (ngModelChange)="reset()" rows="8" spellcheck="false"
          placeholder="Part No, Brand, Description"
          class="w-full rounded-md border border-gray-200 bg-white p-2 font-mono text-xs dark:border-erp-border-dark dark:bg-erp-surface-dark"></textarea>
        @if (error) { <p class="text-xs text-red-600" role="alert">{{ error }}</p> }
        @if (result; as r) {
          <p class="text-sm">
            <span class="text-emerald-700">{{ okCount }} {{ r.dryRun ? 'ready' : 'imported' }}</span> ·
            <span class="text-amber-700">{{ r.duplicates }} duplicate</span> ·
            <span class="text-red-700">{{ r.invalid }} invalid</span>
          </p>
          <div class="max-h-56 overflow-y-auto rounded-md border border-gray-100 dark:border-erp-border-dark">
            @for (x of problems; track x.row) {
              <p class="border-b border-gray-100 px-3 py-1.5 text-xs dark:border-erp-border-dark">
                <b>Row {{ x.row }}</b> — {{ x.status }}: {{ x.message }}
              </p>
            } @empty {
              <p class="px-3 py-2 text-xs text-gray-500">No problems found.</p>
            }
          </div>
        }
      </form>
    </app-form-modal-shell>
  `,
  styles: [':host{display:block}'],
})
export class ProductImportComponent {
  private ref = inject<ModalRef<any>>(ModalRef);
  private products = inject(ProductService);
  private toastr = inject(ToastrService);

  text = '';
  saving = false;
  error = '';
  result: ProductImportResult | null = null;
  checked = false;

  get okCount(): number {
    return this.result ? this.result.results.filter((x) => x.status === 'ok' || x.status === 'created').length : 0;
  }
  get canImport(): boolean { return this.okCount > 0 && !!this.result?.dryRun; }
  get problems() { return (this.result?.results ?? []).filter((x) => x.status === 'duplicate' || x.status === 'invalid'); }

  close(): void { this.ref.close(this.result && !this.result.dryRun && this.result.created ? true : undefined); }

  reset(): void { this.result = null; this.checked = false; this.error = ''; }

  onFile(e: Event): void {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    void file.text().then((t) => { this.text = t; this.reset(); });
  }

  submit(): void {
    if (this.result && !this.result.dryRun) { this.close(); return; }
    const parsed = parseImportText(this.text);
    if (parsed.error) { this.error = parsed.error; return; }
    const importNow = this.checked && this.canImport;
    this.saving = true;
    this.products.importProducts(parsed.rows, !importNow).subscribe({
      next: (r) => {
        this.saving = false;
        this.result = r;
        this.checked = true;
        if (!r.dryRun) this.toastr.success(`${r.created} product(s) imported and waiting for review`);
      },
      error: (e) => { this.saving = false; this.error = e?.error?.message || 'Import failed'; },
    });
  }
}
