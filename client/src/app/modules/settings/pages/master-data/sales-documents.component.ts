import { Component } from '@angular/core';
import { SettingsSectionHeaderComponent } from '../settings-section-header.component';

@Component({
  selector: 'app-sales-documents',
  standalone: true,
  imports: [SettingsSectionHeaderComponent],
  template: `
    <div class="w-full min-h-full bg-white dark:bg-erp-surface-dark p-6 rounded-md">
      <app-settings-section-header sectionId="master-data" label="Sales Documents"
        description="Shows which shared lists should feed quotation, deal sheet and job sheet workflows."></app-settings-section-header>

      <div class="space-y-6">
        <div class="block rounded-lg border border-gray-200 p-5 dark:border-gray-700">
          <div class="text-sm font-semibold text-gray-900 dark:text-gray-100">Sales document lists are shared, not duplicated</div>
          <p class="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
            Quotation, Deal Sheet and Job Sheet should consume the same master data instead of maintaining separate copies.
            Edit payment terms in Customer Data, and tax/unit values in Product Data.
          </p>
        </div>
        <div class="grid gap-5 md:grid-cols-3">
          <div class="rounded-lg border border-gray-200 p-5 dark:border-gray-700">
            <div class="text-xs font-semibold uppercase tracking-wide text-gray-500">Payment terms</div>
            <p class="mt-2 text-sm text-gray-700 dark:text-gray-300">Used for quotation text, deal approval payment-term days, and customer default terms.</p>
          </div>
          <div class="rounded-lg border border-gray-200 p-5 dark:border-gray-700">
            <div class="text-xs font-semibold uppercase tracking-wide text-gray-500">Tax rates</div>
            <p class="mt-2 text-sm text-gray-700 dark:text-gray-300">Used for product tax now; should feed quotation/deal line tax calculation.</p>
          </div>
          <div class="rounded-lg border border-gray-200 p-5 dark:border-gray-700">
            <div class="text-xs font-semibold uppercase tracking-wide text-gray-500">Units</div>
            <p class="mt-2 text-sm text-gray-700 dark:text-gray-300">Used by products and should flow into quotation/deal/job sheet quantity lines.</p>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class SalesDocumentsComponent {}
