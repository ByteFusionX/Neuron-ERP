import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SmartFormModule } from 'src/app/shared/components/smart-form';
import { ToastrService } from 'ngx-toastr';
import { FormModalShellComponent, MODAL_DATA, ModalRef } from 'src/app/shared/components/modal';
import { EnquiryService } from 'src/app/core/services/enquiry/enquiry.service';

export interface ResetWorkflowModalData {
  /** Mongo id of the job being reset. */
  jobId: string;
  /** Enquiry id, shown as a chip in the header. */
  context?: string;
  /** Stages that can get another chance (Super Admin is not listed: it always stays). */
  stages: { id: string; label: string }[];
}

/**
 * Super Admin restarts one job's assignment workflow. Ticked stages get another chance; unticked stages are
 * skipped for this job only. Closes with true after a successful reset, or undefined on cancel.
 */
@Component({
  selector: 'app-reset-workflow',
  standalone: true,
  imports: [CommonModule, FormsModule, SmartFormModule, FormModalShellComponent],
  template: `
    <app-form-modal-shell
      icon="refresh" tone="amber" title="Reset workflow"
      contextLabel="Enquiry" [context]="data?.context" contextEmptyText="Restart this job's assignment workflow."
      formId="reset-workflow-form" [saving]="saving"
      submitLabel="Reset workflow" savingLabel="Resetting..." submitIcon="refresh" submitShortcutVerb="reset"
      (closed)="close()">
      <form id="reset-workflow-form" (ngSubmit)="submit()" novalidate>
        <p class="mb-4 text-sm text-gray-500 dark:text-gray-400">
          Tick the stages that get another chance to assign this job. Unticked stages are skipped for this job only.
        </p>

        <!-- Same stepper as Settings → Workflow: Super Admin on top, the bottom stage acts first -->
        <div class="flex items-stretch gap-2.5">
          <div class="flex flex-col items-center">
            <span class="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600 ring-4 ring-amber-50 dark:bg-amber-500/20 dark:text-amber-300 dark:ring-amber-500/5">
              <span class="material-icons text-[16px]">supervisor_account</span>
            </span>
            <span class="my-1 w-0.5 flex-1 rounded bg-gray-200 dark:bg-gray-700"></span>
          </div>
          <div class="min-w-0 flex-1 pb-3 pt-1">
            <div class="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-2.5 dark:border-amber-500/30 dark:bg-amber-500/10">
              <span class="min-w-0">
                <span class="block text-[13px] font-medium text-gray-900 dark:text-gray-100">Super Admin</span>
                <span class="block text-[11px] text-gray-500 dark:text-gray-400">Final authority · always stays</span>
              </span>
              <app-sf-checkbox [disabled]="true" [ngModel]="true" [ngModelOptions]="{ standalone: true }"></app-sf-checkbox>
            </div>
          </div>
        </div>

        <div *ngFor="let st of shown; let i = index; let last = last" class="flex items-stretch gap-2.5">
          <div class="flex flex-col items-center">
            <span class="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-600 text-[11px] font-semibold text-white ring-4 ring-violet-50 dark:ring-violet-500/10">
              {{ initials(st.label) }}
              <span class="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-white text-[9px] font-bold text-violet-700 ring-1 ring-violet-200 dark:bg-gray-900 dark:text-violet-300 dark:ring-violet-500/40">{{ shown.length - i + 1 }}</span>
            </span>
            <span *ngIf="!last" class="my-1 w-0.5 flex-1 rounded bg-gray-200 dark:bg-gray-700"></span>
          </div>
          <div class="min-w-0 flex-1 pt-1" [class.pb-3]="!last">
            <div class="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-3.5 shadow-sm dark:border-erp-border-dark dark:bg-gray-800/60">
              <span class="min-w-0">
                <span class="block truncate text-[13px] font-medium text-gray-900 dark:text-gray-100">{{ st.label }}</span>
                <span class="block text-[11px] text-gray-500 dark:text-gray-400">Stage {{ shown.length - i + 1 }}{{ last ? ' · acts first' : '' }}</span>
              </span>
              <app-sf-checkbox [ngModel]="selected.has(st.id)" (ngModelChange)="toggle(st.id)" [ngModelOptions]="{ standalone: true }"></app-sf-checkbox>
            </div>
          </div>
        </div>
      </form>
    </app-form-modal-shell>
  `,
  styles: [':host{display:block}'],
})
export class ResetWorkflowComponent {
  private dialogRef = inject<ModalRef<boolean>>(ModalRef);
  private enquiryService = inject(EnquiryService);
  private toast = inject(ToastrService);
  data = inject(MODAL_DATA, { optional: true }) as ResetWorkflowModalData | null;

  saving = false;
  /** Top row is the highest stage, the bottom row acts first (same order as Settings → Workflow). */
  shown = [...(this.data?.stages ?? [])].reverse();
  selected = new Set<string>((this.data?.stages ?? []).map((st) => st.id));

  initials(name: string): string {
    const parts = (name || '?').trim().split(/\s+/);
    return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
  }

  toggle(id: string): void {
    if (!this.selected.delete(id)) this.selected.add(id);
  }

  close(): void {
    this.dialogRef.close();
  }

  submit(): void {
    if (this.saving || !this.data) return;
    this.saving = true;
    this.enquiryService.restartAssignmentWorkflow(this.data.jobId, [...this.selected]).subscribe({
      next: (res) => {
        this.toast.success(res.message);
        this.dialogRef.close(true);
      },
      error: (err) => {
        this.saving = false;
        this.toast.warning(err?.error?.message || 'Could not reset the workflow. Please try again.');
      },
    });
  }
}
