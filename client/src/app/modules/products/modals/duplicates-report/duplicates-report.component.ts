import { Component, inject, OnInit } from '@angular/core';
import { FormModalShellComponent, ModalRef } from 'src/app/shared/components/modal';
import { DuplicateGroupProduct, DuplicatesReport, ProductService } from 'src/app/core/services/product/product.service';

/** Read-only list of products that may be the same item entered twice. */
@Component({
  selector: 'app-duplicates-report',
  standalone: true,
  imports: [FormModalShellComponent],
  template: `
    <app-form-modal-shell
      icon="files" tone="amber" title="Possible duplicates"
      contextEmptyText="Products that share a part number, or a brand and description."
      formId="dup-report-form" submitLabel="Close" submitShortcutVerb="close" (closed)="close()">
      <form id="dup-report-form" (ngSubmit)="close()" class="space-y-4 text-sm">
        @if (loading) { <p class="text-gray-500">Loading...</p> }
        @if (error) { <p class="text-red-600">{{ error }}</p> }
        @if (report; as r) {
          @if (r.unmigrated) {
            <p class="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {{ r.unmigrated }} older product(s) have not been through the backfill yet, so they are missing from this report.
            </p>
          }
          <h3 class="font-semibold">Same part number ({{ r.samePartNumber.length }})</h3>
          @for (g of r.samePartNumber; track g.key) {
            <div class="rounded-md border border-gray-100 p-2 dark:border-erp-border-dark">
              <p class="text-xs font-medium">{{ g.key }} — {{ g.sameBrand ? 'same brand' : 'different brands' }}</p>
              @for (p of g.products; track p._id) { <p class="text-xs">{{ line(p) }}</p> }
            </div>
          } @empty { <p class="text-xs text-gray-500">None.</p> }
          <h3 class="font-semibold">Same brand and description ({{ r.sameDescription.length }})</h3>
          @for (g of r.sameDescription; track g.description + g.brand) {
            <div class="rounded-md border border-gray-100 p-2 dark:border-erp-border-dark">
              <p class="text-xs font-medium">{{ g.brand || 'No brand' }} — {{ g.description }}</p>
              @for (p of g.products; track p._id) { <p class="text-xs">{{ line(p) }}</p> }
            </div>
          } @empty { <p class="text-xs text-gray-500">None.</p> }
        }
      </form>
    </app-form-modal-shell>
  `,
  styles: [':host{display:block}'],
})
export class DuplicatesReportComponent implements OnInit {
  private ref = inject<ModalRef<any>>(ModalRef);
  private products = inject(ProductService);

  report: DuplicatesReport | null = null;
  loading = true;
  error = '';

  ngOnInit(): void {
    this.products.getDuplicatesReport().subscribe({
      next: (r) => { this.report = r; this.loading = false; },
      error: () => { this.error = 'Failed to load the report'; this.loading = false; },
    });
  }

  line(p: DuplicateGroupProduct): string {
    return [p.itemCode, p.partNo, p.brand, p.approvalStatus === 'Pending' ? '(Pending)' : ''].filter(Boolean).join(' · ');
  }

  close(): void { this.ref.close(); }
}
