import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, Validators } from '@angular/forms';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { DetailPanelIconComponent } from 'src/app/shared/components/detail-panel/detail-panel-icon.component';
import { MODAL_DATA, ModalRef } from 'src/app/shared/components/modal';
import { SmartFormModule } from 'src/app/shared/components/smart-form';
import { SfOption } from 'src/app/shared/components/smart-form/sf.model';

export interface ShareTransferModalData {
  type: 'Share' | 'Transfer';
  customerId: string;
  /** Customer name, shown as a chip in the header. */
  context?: string;
}

/** Employee ids picked in the modal (always an array; a transfer has exactly one). */
export interface ShareTransferModalResult {
  employees: string[];
  type: 'Share' | 'Transfer';
}

/**
 * Share a customer with employees, or transfer ownership to one. Closes with the selection,
 * or undefined on cancel; the caller performs the request.
 */
@Component({
  selector: 'app-share-transfer-customer',
  standalone: true,
  imports: [CommonModule, SmartFormModule, DetailPanelIconComponent, ActionButtonComponent],
  template: `
    <div class="flex max-h-[90vh] flex-col bg-white text-gray-900 dark:bg-erp-surface-dark dark:text-gray-100">
      <header class="flex items-start gap-3 border-b border-gray-100 px-6 py-4 dark:border-erp-border-dark">
        <span class="grid h-9 w-9 shrink-0 place-content-center rounded-lg bg-violet-50 text-violet-600 ring-1 ring-inset ring-violet-100 dark:bg-violet-950/40 dark:text-violet-400 dark:ring-violet-900">
          <app-dp-icon [name]="isTransfer ? 'transfer' : 'send'" size="w-5 h-5"></app-dp-icon>
        </span>
        <div class="min-w-0 flex-1">
          <h2 class="text-base font-semibold leading-6">{{ isTransfer ? 'Transfer customer' : 'Share customer' }}</h2>
          <p class="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
            <ng-container *ngIf="data?.context; else noCtx">
              {{ isTransfer ? 'Transferring' : 'Sharing' }}
              <span class="inline-flex max-w-[16rem] items-center truncate rounded-md bg-gray-100 px-1.5 py-0.5 font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300">{{ data?.context }}</span>
            </ng-container>
            <ng-template #noCtx>{{ isTransfer ? 'Hand this customer over to another employee.' : 'Give employees access to this customer.' }}</ng-template>
          </p>
        </div>
        <button type="button" (click)="close()" aria-label="Close"
          class="grid h-8 w-8 place-content-center rounded-md text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200">
          <app-dp-icon name="close" size="w-4 h-4"></app-dp-icon>
        </button>
      </header>

      <form id="share-transfer-form" [formGroup]="form" (ngSubmit)="submit()" novalidate class="overflow-y-auto px-6 py-5">
        <app-sf-field [label]="isTransfer ? 'New owner' : 'Employees'" [control]="form.controls.employees">
          <app-sf-combobox formControlName="employees" [multiple]="!isTransfer" [options]="employeeOptions"
            [placeholder]="isTransfer ? 'Select an employee' : 'Select employees'"></app-sf-combobox>
        </app-sf-field>
        <p *ngIf="isTransfer" class="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
          If the employee is already in the shared list, remove them from it first.
        </p>
      </form>

      <footer class="flex items-center justify-end gap-2 border-t border-gray-100 bg-gray-50/70 px-6 py-3 dark:border-erp-border-dark dark:bg-black/20">
        <app-action-button variant="secondary" (click)="close()">Cancel</app-action-button>
        <app-action-button variant="primary" type="submit" form="share-transfer-form">{{ isTransfer ? 'Transfer' : 'Share' }}</app-action-button>
      </footer>
    </div>
  `,
  styles: [':host{display:block}'],
})
export class ShareTransferCustomerComponent implements OnInit {
  private fb = inject(FormBuilder);
  private modalRef = inject<ModalRef<ShareTransferModalResult>>(ModalRef);
  private employeeService = inject(EmployeeService);
  data = inject(MODAL_DATA, { optional: true }) as ShareTransferModalData | null;

  employeeOptions: SfOption[] = [];
  form = this.fb.group({ employees: [null as string | string[] | null, Validators.required] });

  get isTransfer(): boolean { return this.data?.type === 'Transfer'; }

  ngOnInit(): void {
    if (!this.isTransfer) this.form.controls.employees.setValue([]);
    this.employeeService.getEmployeesForCustomerTransfer(this.data!.customerId).subscribe((employees) => {
      this.employeeOptions = (employees || []).map((e) => ({ value: e._id, label: `${e.firstName} ${e.lastName}` }));
    });
  }

  close(): void {
    this.modalRef.close();
  }

  submit(): void {
    const value = this.form.controls.employees.value;
    const employees = (Array.isArray(value) ? value : value ? [value] : []) as string[];
    if (!employees.length) {
      this.form.markAllAsTouched();
      this.form.controls.employees.setErrors({ required: true });
      return;
    }
    this.modalRef.close({ employees, type: this.data!.type });
  }
}
