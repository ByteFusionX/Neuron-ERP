import { Component, HostListener, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, Validators } from '@angular/forms';
import { MODAL_DATA, ModalRef } from '../../modal';
import { SmartFormModule } from '../../smart-form';
import { DetailPanelIconComponent } from '../detail-panel-icon.component';

export interface FollowUpCreateModalData {
  /** Record the follow-up belongs to, shown as a chip in the header, e.g. an enquiry or quotation number. */
  context?: string;
  /** Pre-fills the "Next follow-up" date, typically the row's existing nextFollowUpDate. */
  nextFollowUpDate?: string | null;
  /** Set when this modal is correcting a prior follow-up entry rather than logging a new one. */
  correcting?: { id: string; outcome: string } | null;
}

export interface FollowUpModalResult {
  date: string;
  outcome: string;
  note: string;
  nextFollowUpDate: string | null;
  /** Id of the follow-up entry this one corrects, if any. The original entry is kept, never edited or removed. */
  correctionOf?: string | null;
}

/**
 * Create-follow-up modal for detail panel "Follow-ups" tabs, built on the smart-form controls.
 * Closes with the new FollowUpModalResult, or undefined on cancel.
 *
 *   modal.open<FollowUpModalResult>(FollowUpCreateModalComponent, { width: '520px', data: { context: row.enquiryId } })
 */
@Component({
  selector: 'app-follow-up-create-modal',
  standalone: true,
  imports: [CommonModule, SmartFormModule, DetailPanelIconComponent],
  template: `
    <div class="flex max-h-[90vh] flex-col bg-white text-gray-900 dark:bg-erp-surface-dark dark:text-gray-100">
      <!-- Header -->
      <header class="flex items-start gap-3 border-b border-gray-100 px-6 py-4 dark:border-erp-border-dark">
        <span class="grid h-9 w-9 shrink-0 place-content-center rounded-lg bg-emerald-50 text-emerald-600 ring-1 ring-inset ring-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-400 dark:ring-emerald-900">
          <app-dp-icon name="clock" size="w-5 h-5"></app-dp-icon>
        </span>
        <div class="min-w-0 flex-1">
          <h2 class="text-base font-semibold leading-6">{{ data?.correcting ? 'Correct follow-up' : 'Add follow-up' }}</h2>
          <p class="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
            <ng-container *ngIf="data?.context; else noCtx">
              Adding to
              <span class="inline-flex max-w-[16rem] items-center truncate rounded-md bg-gray-100 px-1.5 py-0.5 font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300">{{ data?.context }}</span>
            </ng-container>
            <ng-template #noCtx>Log a call, visit or update.</ng-template>
          </p>
        </div>
        <button type="button" (click)="close()" aria-label="Close"
          class="grid h-8 w-8 place-content-center rounded-md text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200">
          <app-dp-icon name="close" size="w-4 h-4"></app-dp-icon>
        </button>
      </header>

      <!-- Body -->
      <form id="follow-up-create-form" [formGroup]="form" (ngSubmit)="submit()" novalidate class="flex-1 overflow-y-auto px-6 py-5">
        <div *ngIf="data?.correcting" class="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          <app-dp-icon name="info" size="w-4 h-4" class="mt-0.5 shrink-0"></app-dp-icon>
          <span>This adds a new entry marked as a correction of "<strong>{{ data?.correcting?.outcome }}</strong>". The original entry stays in the log — it won't be edited or removed.</span>
        </div>
        <app-sf-section title="When" columns="2">
          <app-sf-field label="Follow-up date" [control]="form.controls.date">
            <app-sf-date formControlName="date"></app-sf-date>
          </app-sf-field>
          <app-sf-field label="Next follow-up" optional [control]="form.controls.nextFollowUpDate">
            <app-sf-date formControlName="nextFollowUpDate"></app-sf-date>
          </app-sf-field>
        </app-sf-section>

        <app-sf-section title="Details" columns="1">
          <app-sf-field label="Outcome" [control]="form.controls.outcome">
            <app-sf-input formControlName="outcome" placeholder="Called customer, waiting for BOQ, site visit done..." [maxlength]="200" clearable></app-sf-input>
          </app-sf-field>
          <app-sf-field label="Notes" optional [control]="form.controls.note">
            <app-sf-textarea formControlName="note" [rows]="3" [maxlength]="1000" autoresize placeholder="Additional notes…"></app-sf-textarea>
          </app-sf-field>
        </app-sf-section>
      </form>

      <!-- Footer -->
      <footer class="flex flex-wrap items-center gap-3 border-t border-gray-100 bg-gray-50/70 px-6 py-3 dark:border-erp-border-dark dark:bg-black/20">
        <span *ngIf="form.invalid && submitted" class="text-xs text-red-600 dark:text-red-400">Fix the highlighted fields</span>
        <div class="ml-auto flex gap-2">
          <button type="button" (click)="close()"
            class="rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-[13px] font-medium text-gray-700 transition hover:bg-gray-50 dark:border-erp-border-dark dark:bg-erp-surface-dark dark:text-gray-200 dark:hover:bg-gray-800">Cancel</button>
          <button type="submit" form="follow-up-create-form" [disabled]="saving"
            class="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3.5 py-2 text-[13px] font-medium text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600">
            <app-dp-icon name="plus" size="w-3.5 h-3.5"></app-dp-icon>{{ saving ? 'Saving...' : 'Save follow-up' }}
          </button>
        </div>
      </footer>
    </div>
  `,
  styles: [':host{display:block}'],
})
export class FollowUpCreateModalComponent {
  private fb = inject(FormBuilder);
  private dialogRef = inject<ModalRef<FollowUpModalResult>>(ModalRef);
  data = inject(MODAL_DATA, { optional: true }) as FollowUpCreateModalData | null;

  submitted = false;
  saving = false;

  form = this.fb.group({
    date: [new Date().toISOString().slice(0, 10), Validators.required],
    outcome: ['', [Validators.required, Validators.maxLength(200)]],
    note: ['', Validators.maxLength(1000)],
    nextFollowUpDate: [this.data?.nextFollowUpDate ?? null as string | null],
  });

  @HostListener('keydown', ['$event'])
  onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      this.submit();
    }
  }

  close(): void {
    this.dialogRef.close();
  }

  submit(): void {
    this.submitted = true;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    this.dialogRef.close({
      date: v.date || new Date().toISOString().slice(0, 10),
      outcome: v.outcome!.trim(),
      note: v.note?.trim() || '',
      nextFollowUpDate: v.nextFollowUpDate || null,
      correctionOf: this.data?.correcting?.id || null,
    });
  }
}
