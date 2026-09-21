import { Component, HostListener, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, Validators } from '@angular/forms';
import { Observable } from 'rxjs';
import { MODAL_DATA, ModalRef } from '../../modal';
import { SmartFormModule } from '../../smart-form';
import { SfOption } from '../../smart-form/sf.model';
import { UploadFileComponent } from '../../upload-file/upload-file.component';
import { DetailTaskItem } from '../detail-panel.model';
import { DetailPanelIconComponent } from '../detail-panel-icon.component';
import { getEmployee } from 'src/app/shared/interfaces/employee.interface';

export interface EventCreateModalData {
  /** Record the event belongs to, shown as a chip in the header, e.g. a project or quotation name. */
  context?: string;
  /** When provided, "Create another" is offered: each event is passed here and the modal stays open. */
  onCreate?: (event: DetailTaskItem) => void;
  /** Shows the "Assigned To" field, populated from `employees`. */
  assignable?: boolean;
  /** Employee list for the "Assigned To" field; required when `assignable` is true. */
  employees?: Observable<getEmployee[]>;
  /** Shows the "Contact Person" field, populated from `contactPersons`. */
  contactPersonable?: boolean;
  /** Customer contact list for the "Contact Person" field; required when `contactPersonable` is true. */
  contactPersons?: SfOption[];
  /** Shows the file-attachment field. */
  attachable?: boolean;
  /** Makes the description field required and labels it "Summary" instead of "Description". */
  requireSummary?: boolean;
}

/** Result of a successful submit: the generic item plus fields callers need to persist it themselves. */
export interface EventModalResult extends DetailTaskItem {
  /** Selected employee id, present when the modal was opened with `assignable: true`. */
  employeeId?: string;
  /** Raw files to upload, present when the modal was opened with `attachable: true`. */
  files?: File[];
  /** Selected customer contact id, present when the modal was opened with `contactPersonable: true`. */
  contactPersonId?: string;
}

/**
 * Create-event modal for detail panel "Events" tabs, built on the smart-form controls.
 * Closes with the new DetailTaskItem (kind 'event'), or undefined on cancel.
 *
 *   modal.open<DetailTaskItem>(EventCreateModalComponent, { width: '560px', data: { context: row.name } })
 */
@Component({
  selector: 'app-event-create-modal',
  standalone: true,
  imports: [CommonModule, SmartFormModule, DetailPanelIconComponent, UploadFileComponent],
  template: `
    <div class="flex max-h-[90vh] flex-col bg-white text-gray-900 dark:bg-erp-surface-dark dark:text-gray-100">
      <!-- Header -->
      <header class="flex items-start gap-3 border-b border-gray-100 px-6 py-4 dark:border-erp-border-dark">
        <span class="grid h-9 w-9 shrink-0 place-content-center rounded-lg bg-sky-50 text-sky-600 ring-1 ring-inset ring-sky-100 dark:bg-sky-950/40 dark:text-sky-400 dark:ring-sky-900">
          <app-dp-icon name="calendar" size="w-5 h-5"></app-dp-icon>
        </span>
        <div class="min-w-0 flex-1">
          <h2 class="text-base font-semibold leading-6">New event</h2>
          <p class="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
            <ng-container *ngIf="data?.context; else noCtx">
              Adding to
              <span class="inline-flex max-w-[16rem] items-center truncate rounded-md bg-gray-100 px-1.5 py-0.5 font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300">{{ data?.context }}</span>
            </ng-container>
            <ng-template #noCtx>Schedule a meeting, visit or milestone.</ng-template>
          </p>
        </div>
        <button type="button" (click)="close()" aria-label="Close"
          class="grid h-8 w-8 place-content-center rounded-md text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200">
          <app-dp-icon name="close" size="w-4 h-4"></app-dp-icon>
        </button>
      </header>

      <!-- Body -->
      <form id="event-create-form" [formGroup]="form" (ngSubmit)="submit()" novalidate class="flex-1 overflow-y-auto px-6 py-5">
        <app-sf-section title="What's happening" columns="1">
          <app-sf-field label="Title" [control]="form.controls.title">
            <app-sf-input formControlName="title" placeholder="e.g. Site inspection" [maxlength]="120" clearable></app-sf-input>
          </app-sf-field>
          <app-sf-field [label]="data?.requireSummary ? 'Summary' : 'Description'" [optional]="!data?.requireSummary" [control]="form.controls.description">
            <app-sf-textarea formControlName="description" [rows]="3" [maxlength]="1000" autoresize
              [placeholder]="data?.requireSummary ? 'Write a summary…' : 'Agenda, attendees, notes…'"></app-sf-textarea>
          </app-sf-field>
        </app-sf-section>

        <app-sf-section title="When & where" columns="2">
          <app-sf-field label="Date" [control]="form.controls.date">
            <app-sf-date formControlName="date"></app-sf-date>
          </app-sf-field>
          <app-sf-field label="Location" optional [control]="form.controls.location">
            <app-sf-input formControlName="location" placeholder="e.g. Main building" clearable></app-sf-input>
          </app-sf-field>
        </app-sf-section>

        <app-sf-section *ngIf="data?.assignable || data?.contactPersonable" title="Ownership" columns="2">
          <app-sf-field *ngIf="data?.assignable" label="Assigned To" [control]="form.controls.employeeId">
            <app-sf-select formControlName="employeeId" [options]="employeeOptions" placeholder="Select employee"></app-sf-select>
          </app-sf-field>
          <app-sf-field *ngIf="data?.contactPersonable" label="Contact Person" optional [control]="form.controls.contactPersonId">
            <app-sf-select formControlName="contactPersonId" [options]="data?.contactPersons || []" placeholder="Select contact person"></app-sf-select>
          </app-sf-field>
        </app-sf-section>

        <app-sf-section *ngIf="data?.attachable" title="Attachments" columns="1">
          <app-upload-file [selectedFiles]="files" (fileUpload)="files = $event"></app-upload-file>
        </app-sf-section>
      </form>

      <!-- Footer -->
      <footer class="flex flex-wrap items-center gap-3 border-t border-gray-100 bg-gray-50/70 px-6 py-3 dark:border-erp-border-dark dark:bg-black/20">
        <label *ngIf="data?.onCreate" class="inline-flex cursor-pointer select-none items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
          <input type="checkbox" class="h-3.5 w-3.5 rounded border-gray-300 accent-violet-600" [checked]="createAnother" (change)="createAnother = !createAnother" />
          Create another
        </label>
        <span *ngIf="form.invalid && submitted" class="text-xs text-red-600 dark:text-red-400">Fix the highlighted fields</span>
        <span class="ml-auto hidden text-[11px] text-gray-400 sm:inline">
          <kbd class="rounded border border-gray-200 bg-white px-1 font-sans dark:border-erp-border-dark dark:bg-gray-800">Ctrl</kbd>
          + <kbd class="rounded border border-gray-200 bg-white px-1 font-sans dark:border-erp-border-dark dark:bg-gray-800">Enter</kbd> to create
        </span>
        <div class="flex gap-2 max-sm:ml-auto">
          <button type="button" (click)="close()"
            class="rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-[13px] font-medium text-gray-700 transition hover:bg-gray-50 dark:border-erp-border-dark dark:bg-erp-surface-dark dark:text-gray-200 dark:hover:bg-gray-800">Cancel</button>
          <button type="submit" form="event-create-form"
            class="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3.5 py-2 text-[13px] font-medium text-white shadow-sm transition hover:bg-violet-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600">
            <app-dp-icon name="plus" size="w-3.5 h-3.5"></app-dp-icon>Create event
          </button>
        </div>
      </footer>
    </div>
  `,
  styles: [':host{display:block}'],
})
export class EventCreateModalComponent implements OnInit {
  private fb = inject(FormBuilder);
  private dialogRef = inject<ModalRef<EventModalResult>>(ModalRef);
  data = inject(MODAL_DATA, { optional: true }) as EventCreateModalData | null;

  submitted = false;
  createAnother = false;
  files: File[] = [];
  employeeOptions: SfOption[] = [];

  form = this.fb.group({
    title: ['', [Validators.required, Validators.maxLength(120)]],
    description: ['', Validators.maxLength(1000)],
    date: [null as string | null, Validators.required],
    location: ['', Validators.maxLength(120)],
    employeeId: [null as string | null],
    contactPersonId: [null as string | null],
  });

  ngOnInit(): void {
    if (this.data?.assignable && this.data.employees) {
      this.data.employees.subscribe((employees) => {
        this.employeeOptions = (employees || []).map((e) => ({ value: e._id, label: `${e.firstName} ${e.lastName}` }));
      });
    }
    if (this.data?.requireSummary) {
      this.form.controls.description.addValidators(Validators.required);
      this.form.controls.description.updateValueAndValidity();
    }
  }

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
    const employeeName = this.employeeOptions.find((o) => o.value === v.employeeId)?.label;
    const event: EventModalResult = {
      id: `event-${Date.now()}`,
      kind: 'event',
      title: v.title!.trim(),
      description: v.description?.trim() || undefined,
      date: v.date ?? undefined,
      location: v.location?.trim() || undefined,
      deletable: true,
      assignee: employeeName,
      employeeId: v.employeeId ?? undefined,
      files: this.data?.attachable ? this.files : undefined,
      contactPersonId: v.contactPersonId ?? undefined,
    };

    if (this.createAnother && this.data?.onCreate) {
      this.data.onCreate(event);
      this.form.reset({ ...this.form.getRawValue(), title: '', description: '', location: '', employeeId: null, contactPersonId: null });
      this.files = [];
      this.submitted = false;
      return;
    }
    this.dialogRef.close(event);
  }
}
