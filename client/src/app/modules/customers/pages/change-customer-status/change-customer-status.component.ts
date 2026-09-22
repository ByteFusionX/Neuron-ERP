import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, Validators } from '@angular/forms';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { DetailPanelIconComponent } from 'src/app/shared/components/detail-panel/detail-panel-icon.component';
import { MODAL_DATA, ModalRef } from 'src/app/shared/components/modal';
import { SmartFormModule } from 'src/app/shared/components/smart-form';
import { SfOption } from 'src/app/shared/components/smart-form/sf.model';
import { CUSTOMER_STATUSES, CustomerStatus } from 'src/app/shared/interfaces/customer.interface';

export interface ChangeCustomerStatusModalData {
  currentStatus: CustomerStatus;
  /** Customer name, shown as a chip in the header. */
  context?: string;
}

export interface ChangeCustomerStatusModalResult {
  status: CustomerStatus;
  reason?: string;
}

/**
 * Change a customer's status, optionally with a reason. Closes with the selection,
 * or undefined on cancel; the caller performs the request.
 */
@Component({
  selector: 'app-change-customer-status',
  standalone: true,
  imports: [CommonModule, SmartFormModule, DetailPanelIconComponent, ActionButtonComponent],
  template: `
    <div class="flex max-h-[90vh] flex-col bg-white text-gray-900 dark:bg-erp-surface-dark dark:text-gray-100">
      <header class="flex items-start gap-3 border-b border-gray-100 px-6 py-4 dark:border-erp-border-dark">
        <span class="grid h-9 w-9 shrink-0 place-content-center rounded-lg bg-violet-50 text-violet-600 ring-1 ring-inset ring-violet-100 dark:bg-violet-950/40 dark:text-violet-400 dark:ring-violet-900">
          <app-dp-icon name="flag" size="w-5 h-5"></app-dp-icon>
        </span>
        <div class="min-w-0 flex-1">
          <h2 class="text-base font-semibold leading-6">Change status</h2>
          <p class="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
            <ng-container *ngIf="data?.context; else noCtx">
              Updating status for
              <span class="inline-flex max-w-[16rem] items-center truncate rounded-md bg-gray-100 px-1.5 py-0.5 font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300">{{ data?.context }}</span>
            </ng-container>
            <ng-template #noCtx>Update this customer's status.</ng-template>
          </p>
        </div>
        <button type="button" (click)="close()" aria-label="Close"
          class="grid h-8 w-8 place-content-center rounded-md text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200">
          <app-dp-icon name="close" size="w-4 h-4"></app-dp-icon>
        </button>
      </header>

      <form id="change-status-form" [formGroup]="form" (ngSubmit)="submit()" novalidate class="overflow-y-auto px-6 py-5">
        <app-sf-field label="Status" [control]="form.controls.status">
          <app-sf-select formControlName="status" [options]="statusOptions"></app-sf-select>
        </app-sf-field>
        <app-sf-field class="mt-4" label="Reason" [control]="form.controls.reason">
          <app-sf-textarea formControlName="reason" placeholder="Optional note on why the status changed"></app-sf-textarea>
        </app-sf-field>
      </form>

      <footer class="flex items-center justify-end gap-2 border-t border-gray-100 bg-gray-50/70 px-6 py-3 dark:border-erp-border-dark dark:bg-black/20">
        <app-action-button variant="secondary" (click)="close()">Cancel</app-action-button>
        <app-action-button variant="primary" type="submit" form="change-status-form">Save</app-action-button>
      </footer>
    </div>
  `,
  styles: [':host{display:block}'],
})
export class ChangeCustomerStatusComponent {
  private fb = inject(FormBuilder);
  private modalRef = inject<ModalRef<ChangeCustomerStatusModalResult>>(ModalRef);
  data = inject(MODAL_DATA, { optional: true }) as ChangeCustomerStatusModalData | null;

  readonly statusOptions: SfOption[] = CUSTOMER_STATUSES.map((s) => ({ label: s, value: s }));

  form = this.fb.group({
    status: [this.data?.currentStatus ?? ('Active' as CustomerStatus), Validators.required],
    reason: [''],
  });

  close(): void {
    this.modalRef.close();
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { status, reason } = this.form.getRawValue();
    this.modalRef.close({ status: status as CustomerStatus, reason: reason || undefined });
  }
}
