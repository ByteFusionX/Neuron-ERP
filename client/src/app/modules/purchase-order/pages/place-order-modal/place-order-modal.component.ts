import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MODAL_DATA, ModalRef } from 'src/app/shared/components/modal';
import { SfOption, SmartFormModule } from 'src/app/shared/components/smart-form';
import { DetailPanelIconComponent } from 'src/app/shared/components/detail-panel/detail-panel-icon.component';

export interface PlaceOrderModalData {
  /** PO number shown as a chip in the header. */
  context?: string;
  supplierName?: string;
  amount?: string;
  contactOptions?: SfOption[];
}

export interface PlaceOrderModalResult {
  expectedDeliveryDate: string;
  contactId?: string;
  note?: string;
}

/**
 * Place-order modal for purchase orders, mirroring LpoUploadModalComponent's layout.
 *
 *   modal.open<PlaceOrderModalResult>(PlaceOrderModalComponent, { width: '520px', data: { context, supplierName, amount } })
 */
@Component({
  selector: 'app-place-order-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, SmartFormModule, DetailPanelIconComponent],
  template: `
    <div class="flex max-h-[90vh] flex-col bg-white text-gray-900 dark:bg-erp-surface-dark dark:text-gray-100">
      <header class="flex items-start gap-3 border-b border-gray-100 px-6 py-4 dark:border-erp-border-dark">
        <span class="grid h-9 w-9 shrink-0 place-content-center rounded-lg bg-sky-50 text-sky-600 ring-1 ring-inset ring-sky-100 dark:bg-sky-950/40 dark:text-sky-400 dark:ring-sky-900">
          <app-dp-icon name="check" size="w-5 h-5"></app-dp-icon>
        </span>
        <div class="min-w-0 flex-1">
          <h2 class="text-base font-semibold leading-6">Place order</h2>
          <p class="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
            <ng-container *ngIf="data?.context; else noCtx">
              Placing
              <span class="inline-flex max-w-[16rem] items-center truncate rounded-md bg-gray-100 px-1.5 py-0.5 font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300">{{ data?.context }}</span>
            </ng-container>
            <ng-template #noCtx>Confirm the order has been sent to the supplier.</ng-template>
          </p>
        </div>
        <button type="button" (click)="close()" aria-label="Close"
          class="grid h-8 w-8 place-content-center rounded-md text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200">
          <app-dp-icon name="close" size="w-4 h-4"></app-dp-icon>
        </button>
      </header>

      <div class="flex-1 overflow-y-auto px-6 py-6">
        <p class="mb-4 text-xs text-gray-500">
          Confirm this LPO has been sent to <span class="font-medium text-gray-700 dark:text-gray-300">{{ data?.supplierName || 'the supplier' }}</span>
          <ng-container *ngIf="data?.amount"> ({{ data?.amount }})</ng-container>.
          The receiving team is notified and the LPO shows in GRN &gt; Upcoming, then Arriving on the delivery day.
        </p>
        <div class="grid gap-4 sm:grid-cols-2">
          <app-sf-field label="Expected delivery date" hint="The receiving team gets a reminder on this day.">
            <app-sf-date [(ngModel)]="expectedDeliveryDate" [ngModelOptions]="{ standalone: true }" [min]="today" typeable></app-sf-date>
          </app-sf-field>
          <app-sf-field *ngIf="contactOptions.length" label="Supplier contact person" hint="Optional">
            <app-sf-select [(ngModel)]="contactId" [ngModelOptions]="{ standalone: true }"
              [options]="contactOptions" placeholder="Select contact"></app-sf-select>
          </app-sf-field>
          <app-sf-field class="sm:col-span-2" label="Note" hint="Optional">
            <app-sf-textarea [(ngModel)]="note" [ngModelOptions]="{ standalone: true }" placeholder="Anything the receiving team should know"></app-sf-textarea>
          </app-sf-field>
        </div>
      </div>

      <footer class="flex flex-wrap items-center gap-3 border-t border-gray-100 bg-gray-50/70 px-6 py-3 dark:border-erp-border-dark dark:bg-black/20">
        <div class="flex gap-2 ml-auto">
          <button type="button" (click)="close()"
            class="rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-[13px] font-medium text-gray-700 transition hover:bg-gray-50 dark:border-erp-border-dark dark:bg-erp-surface-dark dark:text-gray-200 dark:hover:bg-gray-800">Cancel</button>
          <button type="button" (click)="submit()" [disabled]="!expectedDeliveryDate || expectedDeliveryDate < today"
            class="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3.5 py-2 text-[13px] font-medium text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600">
            Place order
          </button>
        </div>
      </footer>
    </div>
  `,
  styles: [':host{display:block}'],
})
export class PlaceOrderModalComponent {
  private dialogRef = inject<ModalRef<PlaceOrderModalResult>>(ModalRef);
  data = inject(MODAL_DATA, { optional: true }) as PlaceOrderModalData | null;

  today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  expectedDeliveryDate = '';
  contactId: string | null = null;
  note = '';

  get contactOptions(): SfOption[] {
    return this.data?.contactOptions || [];
  }

  close(): void {
    this.dialogRef.close();
  }

  submit(): void {
    if (!this.expectedDeliveryDate || this.expectedDeliveryDate < this.today) return;
    this.dialogRef.close({
      expectedDeliveryDate: this.expectedDeliveryDate,
      contactId: this.contactId || undefined,
      note: this.note.trim() || undefined,
    });
  }
}
