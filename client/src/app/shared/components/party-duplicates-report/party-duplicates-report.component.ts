import { Component, inject, OnInit } from '@angular/core';
import { FormModalShellComponent, MODAL_DATA, ModalRef } from 'src/app/shared/components/modal';
import { CustomerService, PartyDuplicateGroup } from 'src/app/core/services/customer/customer.service';

export type PartyKind = 'customer';

const SECTIONS: Record<PartyKind, { key: string; title: string }[]> = {
  customer: [
    { key: 'sameName', title: 'Same company name' },
    { key: 'sameTrn', title: 'Same TRN' },
    { key: 'similarName', title: 'Similar company name' },
    { key: 'sameEmail', title: 'Same email' },
    { key: 'samePhone', title: 'Same phone' },
  ],
};

/** Read-only list of customers that may have been entered twice. Opened with `data: 'customer'`. */
@Component({
  selector: 'app-party-duplicates-report',
  standalone: true,
  imports: [FormModalShellComponent],
  template: `
    <app-form-modal-shell
      icon="files" tone="amber" title="Possible duplicate customers"
      contextEmptyText="Records that share a name, tax ID, bank account, email or phone."
      formId="party-dup-report-form" submitLabel="Close" submitShortcutVerb="close" (closed)="close()">
      <form id="party-dup-report-form" (ngSubmit)="close()" class="space-y-4 text-sm">
        @if (loading) { <p class="text-gray-500">Loading...</p> }
        @if (error) { <p class="text-red-600">{{ error }}</p> }
        @if (report) {
          @for (s of sections; track s.key) {
            <h3 class="font-semibold">{{ s.title }} ({{ report[s.key].length }})</h3>
            @for (g of report[s.key]; track g.key) {
              <div class="rounded-md border border-gray-100 p-2 dark:border-erp-border-dark">
                <p class="text-xs font-medium">{{ g.key }}</p>
                @for (r of g.records; track r._id) { <p class="text-xs">{{ line(r) }}</p> }
              </div>
            } @empty { <p class="text-xs text-gray-500">None.</p> }
          }
        }
      </form>
    </app-form-modal-shell>
  `,
  styles: [':host{display:block}'],
})
export class PartyDuplicatesReportComponent implements OnInit {
  private ref = inject<ModalRef<any>>(ModalRef);
  kind: PartyKind = inject<PartyKind | null>(MODAL_DATA as any) ?? 'customer';
  private customers = inject(CustomerService);

  report: Record<string, PartyDuplicateGroup[]> | null = null;
  loading = true;
  error = '';

  get sections() { return SECTIONS[this.kind]; }

  ngOnInit(): void {
    this.customers.getDuplicatesReport().subscribe({
      next: (r: any) => { this.report = r; this.loading = false; },
      error: () => { this.error = 'Failed to load the report'; this.loading = false; },
    });
  }

  line(r: { [k: string]: any }): string {
    return [r['companyName'], r['clientRef'], r['trn'], r['customerEmailId']].filter(Boolean).join(' · ');
  }

  close(): void { this.ref.close(); }
}
