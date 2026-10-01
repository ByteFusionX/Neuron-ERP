import { Component, HostListener, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, Validators } from '@angular/forms';
import { MODAL_DATA, ModalRef } from 'src/app/shared/components/modal';
import { SmartFormModule } from 'src/app/shared/components/smart-form';
import { SfOption } from 'src/app/shared/components/smart-form/sf.model';
import { DetailPanelIconComponent } from 'src/app/shared/components/detail-panel/detail-panel-icon.component';

export interface AddApprovalLimitData {
  /** Employees that do not have a limit yet; `role` is shown once one is picked. */
  employees: { _id: string; label: string; role: string }[];
}

export interface AddApprovalLimitResult {
  employeeId: string;
  maxAmount: number | null;
  maxDiscountPercent: number | null;
}

/** Add-limit modal, styled like the enquiry create-event modal. */
@Component({
  selector: 'app-add-approval-limit-modal',
  standalone: true,
  imports: [CommonModule, SmartFormModule, DetailPanelIconComponent],
  template: `
    <div class="flex max-h-[90vh] flex-col bg-white text-gray-900 dark:bg-erp-surface-dark dark:text-gray-100">
      <header class="flex items-start gap-3 border-b border-gray-100 px-6 py-4 dark:border-erp-border-dark">
        <span class="grid h-9 w-9 shrink-0 place-content-center rounded-lg bg-sky-50 text-sky-600 ring-1 ring-inset ring-sky-100 dark:bg-sky-950/40 dark:text-sky-400 dark:ring-sky-900">
          <app-dp-icon name="user" size="w-5 h-5"></app-dp-icon>
        </span>
        <div class="min-w-0 flex-1">
          <h2 class="text-base font-semibold leading-6">Add employee limit</h2>
          <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">Set the most this person may approve.</p>
        </div>
        <button type="button" (click)="close()" aria-label="Close"
          class="grid h-8 w-8 place-content-center rounded-md text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200">
          <app-dp-icon name="close" size="w-4 h-4"></app-dp-icon>
        </button>
      </header>

      <form id="approval-limit-form" [formGroup]="form" (ngSubmit)="submit()" novalidate class="flex-1 overflow-y-auto px-6 py-5">
        <app-sf-section title="Employee" columns="1">
          <app-sf-field label="Employee" [control]="form.controls.employeeId">
            <app-sf-select formControlName="employeeId" [options]="options" placeholder="Select employee"></app-sf-select>
          </app-sf-field>
          <p *ngIf="role" class="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            Role
            <span class="rounded-md bg-gray-100 px-1.5 py-0.5 font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300">{{ role }}</span>
          </p>
        </app-sf-section>

        <app-sf-section title="Limits" columns="2">
          <app-sf-field label="Max amount" optional hint="Leave empty for no limit" [control]="form.controls.maxAmount">
            <app-sf-number formControlName="maxAmount" [min]="0" [stepper]="false" placeholder="No limit"></app-sf-number>
          </app-sf-field>
          <app-sf-field label="Max discount %" optional hint="0 to 100. Empty for no limit" [control]="form.controls.maxDiscountPercent">
            <app-sf-number formControlName="maxDiscountPercent" [min]="0" [max]="100" [stepper]="false" placeholder="No limit"></app-sf-number>
          </app-sf-field>
        </app-sf-section>
      </form>

      <footer class="flex flex-wrap items-center gap-3 border-t border-gray-100 bg-gray-50/70 px-6 py-3 dark:border-erp-border-dark dark:bg-black/20">
        <span *ngIf="submitted && noLimit" class="text-xs text-red-600 dark:text-red-400">Enter a max amount or a max discount</span>
        <span *ngIf="form.invalid && submitted" class="text-xs text-red-600 dark:text-red-400">Fix the highlighted fields</span>
        <span class="ml-auto hidden text-[11px] text-gray-400 sm:inline">
          <kbd class="rounded border border-gray-200 bg-white px-1 font-sans dark:border-erp-border-dark dark:bg-gray-800">Ctrl</kbd>
          + <kbd class="rounded border border-gray-200 bg-white px-1 font-sans dark:border-erp-border-dark dark:bg-gray-800">Enter</kbd> to add
        </span>
        <div class="flex gap-2 max-sm:ml-auto">
          <button type="button" (click)="close()"
            class="rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-[13px] font-medium text-gray-700 transition hover:bg-gray-50 dark:border-erp-border-dark dark:bg-erp-surface-dark dark:text-gray-200 dark:hover:bg-gray-800">Cancel</button>
          <button type="submit" form="approval-limit-form"
            class="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3.5 py-2 text-[13px] font-medium text-white shadow-sm transition hover:bg-violet-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600">
            <app-dp-icon name="plus" size="w-3.5 h-3.5"></app-dp-icon>Add limit
          </button>
        </div>
      </footer>
    </div>
  `,
  styles: [':host{display:block}'],
})
export class AddApprovalLimitModalComponent {
  private fb = inject(FormBuilder);
  private ref = inject<ModalRef<AddApprovalLimitResult>>(ModalRef);
  private data = inject<AddApprovalLimitData>(MODAL_DATA);

  submitted = false;

  form = this.fb.group({
    employeeId: [null as string | null, Validators.required],
    maxAmount: [null as number | null, Validators.min(0)],
    maxDiscountPercent: [null as number | null, [Validators.min(0), Validators.max(100)]],
  });

  readonly options: SfOption<string>[] = this.data.employees.map((e) => ({ label: e.label, value: e._id }));

  get role(): string {
    return this.data.employees.find((e) => e._id === this.form.controls.employeeId.value)?.role ?? '';
  }

  /** A row with both fields empty means "no limit", which is the same as not being listed. */
  get noLimit(): boolean {
    const v = this.form.getRawValue();
    return v.maxAmount == null && v.maxDiscountPercent == null;
  }

  @HostListener('keydown', ['$event'])
  onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      this.submit();
    }
  }

  close(): void {
    this.ref.close();
  }

  submit(): void {
    this.submitted = true;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    if (this.noLimit) return;
    const v = this.form.getRawValue();
    this.ref.close({ employeeId: v.employeeId as string, maxAmount: v.maxAmount ?? null, maxDiscountPercent: v.maxDiscountPercent ?? null });
  }
}
