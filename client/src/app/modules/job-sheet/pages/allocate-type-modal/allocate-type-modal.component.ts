import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SmartFormModule } from 'src/app/shared/components/smart-form';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { FormModalShellComponent, MODAL_DATA, ModalRef } from 'src/app/shared/components/modal';
import { getJob } from 'src/app/shared/interfaces/job.interface';

export enum allocateType {
  SupplyOnly = 'Supply Only',
  ProjectWithSupply = 'Project With Supply',
  ProjectsWithOutSupply = 'Projects With Out Supply',
  AMC = 'AMC'
}

export interface AllocateTypeResult {
  id: string;
  jobId: string;
  productDistribution: boolean;
  projectInstallation: boolean;
  amc: boolean;
}

/** Picks what a pending job covers: product distribution, project installation, AMC, or any mix. Closes with the choice, or undefined on cancel. */
@Component({
  selector: 'app-allocate-type-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, SmartFormModule, FormModalShellComponent],
  template: `
    <app-form-modal-shell
      icon="refresh" tone="sky" title="Allocate job"
      contextLabel="Job" [context]="data?.jobId"
      formId="allocate-job-form" [invalid]="form.invalid && submitted"
      submitLabel="Allocate" submitIcon="check" submitShortcutVerb="allocate"
      (closed)="close()">
      <form id="allocate-job-form" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <app-sf-section title="Job scope" columns="1">
          <app-sf-field label="What does this job cover?" hint="Select any that apply." [control]="form" [messages]="{ scopeRequired: 'Select at least one.' }">
            <div class="space-y-3">
              @for (o of scopes; track o.key) {
                <div class="flex cursor-pointer items-center gap-3 rounded-lg border p-3.5 shadow-sm transition-colors"
                     [ngClass]="form.controls[o.key].value
                       ? o.card
                       : 'border-gray-200 bg-white hover:border-gray-300 dark:border-erp-border-dark dark:bg-gray-800/60'"
                     (click)="toggle(o.key)">
                  <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                        [ngClass]="form.controls[o.key].value
                          ? o.iconOn
                          : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300'">
                    <span class="material-icons text-[16px]">{{ o.icon }}</span>
                  </span>
                  <span class="min-w-0 flex-1">
                    <span class="block text-[13px] font-medium text-gray-900 dark:text-gray-100">{{ o.label }}</span>
                    <span class="block text-[11px] text-gray-500 dark:text-gray-400">{{ o.description }}</span>
                  </span>
                  <span (click)="$event.stopPropagation()">
                    <app-sf-checkbox [formControlName]="o.key"></app-sf-checkbox>
                  </span>
                </div>
              }
            </div>
          </app-sf-field>
        </app-sf-section>
      </form>
    </app-form-modal-shell>
  `,
  styles: [':host{display:block}'],
})
export class AllocateTypeModalComponent {
  private fb = inject(FormBuilder);
  private dialogRef = inject<ModalRef<AllocateTypeResult>>(ModalRef);
  data = inject(MODAL_DATA, { optional: true }) as getJob | null;

  readonly scopes = [
    { key: 'productDistribution' as const, label: 'Product distribution', icon: 'local_shipping', card: 'border-emerald-300 bg-emerald-50 dark:border-emerald-500/40 dark:bg-emerald-500/10', iconOn: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-300', description: 'Supply the materials to the customer' },
    { key: 'projectInstallation' as const, label: 'Project installation', icon: 'construction', card: 'border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10', iconOn: 'bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-300', description: 'Install and commission on site' },
    { key: 'amc' as const, label: 'AMC', icon: 'event_repeat', card: 'border-violet-300 bg-violet-50 dark:border-violet-500/40 dark:bg-violet-500/10', iconOn: 'bg-violet-100 text-violet-600 dark:bg-violet-500/20 dark:text-violet-300', description: 'Annual maintenance contract after handover' },
  ];

  submitted = false;
  form = this.fb.nonNullable.group({
    productDistribution: false,
    projectInstallation: false,
    amc: false,
  }, { validators: (g) => (g.value.productDistribution || g.value.projectInstallation || g.value.amc ? null : { scopeRequired: true }) });

  toggle(key: 'productDistribution' | 'projectInstallation' | 'amc'): void {
    const control = this.form.controls[key];
    control.setValue(!control.value);
    control.markAsDirty();
    this.form.markAllAsTouched();
  }

  close(): void {
    this.dialogRef.close();
  }

  submit(): void {
    this.submitted = true;
    if (this.form.invalid || !this.data) {
      this.form.markAllAsTouched();
      return;
    }
    const { productDistribution, projectInstallation, amc } = this.form.getRawValue();
    this.dialogRef.close({ id: this.data._id, jobId: this.data.jobId, productDistribution, projectInstallation, amc });
  }
}
