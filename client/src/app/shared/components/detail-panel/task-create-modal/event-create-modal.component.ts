import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, Validators } from '@angular/forms';
import { FormModalShellComponent, MODAL_DATA, ModalRef } from '../../modal';
import { SfOption, SmartFormModule } from '../../smart-form';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { UploadFileComponent } from '../../upload-file/upload-file.component';
import { DetailTaskItem } from '../detail-panel.model';

export interface EventCreateModalData {
  /** Record the event belongs to, shown as a chip in the header, e.g. a project or quotation name. */
  context?: string;
  /** When provided, "Create another" is offered: each event is passed here and the modal stays open. */
  onCreate?: (event: DetailTaskItem) => void;
  /** Shows the file-attachment field. */
  attachable?: boolean;
  /** Makes the description field required and labels it "Summary" instead of "Description". */
  requireSummary?: boolean;
  /** Shows the "Add to Outlook calendar" option (with Teams meeting and attendees). */
  outlookSync?: boolean;
}

/** Result of a successful submit: the generic item plus fields callers need to persist it themselves. */
export interface EventModalResult extends DetailTaskItem {
  /** Raw files to upload, present when the modal was opened with `attachable: true`. */
  files?: File[];
  syncToOutlook?: boolean;
  onlineMeeting?: boolean;
  attendees?: string[];
  /** ISO end timestamp; only set when the modal shows the time fields. */
  endDate?: string;
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
  imports: [CommonModule, SmartFormModule, FormModalShellComponent, UploadFileComponent],
  template: `
    <app-form-modal-shell
      icon="calendar" tone="sky" title="New event"
      [context]="data?.context" contextEmptyText="Schedule a meeting, visit or milestone."
      formId="event-create-form" [invalid]="form.invalid && submitted"
      submitLabel="Create event" submitShortcutVerb="create"
      (closed)="close()">
      <form id="event-create-form" [formGroup]="form" (ngSubmit)="submit()" novalidate>
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
            <app-sf-date formControlName="date" [min]="today"></app-sf-date>
          </app-sf-field>
          <app-sf-field *ngIf="data?.outlookSync" label="Time" [control]="form.controls.startTime">
            <app-sf-date type="time" formControlName="startTime"></app-sf-date>
          </app-sf-field>
          <div class="col-span-2">
            <app-sf-field label="Location" optional [control]="form.controls.location">
              <app-sf-input formControlName="location" placeholder="e.g. Main building" clearable></app-sf-input>
            </app-sf-field>
          </div>
        </app-sf-section>

        <app-sf-section *ngIf="data?.outlookSync" title="Outlook calendar" columns="1">
          <label class="inline-flex cursor-pointer select-none items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input type="checkbox" class="h-4 w-4 rounded border-gray-300 accent-violet-600" [checked]="syncToOutlook" (change)="syncToOutlook = !syncToOutlook" />
            Add to Outlook calendar
          </label>
          <ng-container *ngIf="syncToOutlook">
            <label class="inline-flex cursor-pointer select-none items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input type="checkbox" class="h-4 w-4 rounded border-gray-300 accent-violet-600" [checked]="onlineMeeting" (change)="onlineMeeting = !onlineMeeting" />
              Teams meeting
            </label>
            <app-sf-field label="Attendees" optional [control]="form.controls.attendees">
              <app-sf-combobox formControlName="attendees" [options]="employeeOptions" multiple placeholder="Search active employees…"></app-sf-combobox>
            </app-sf-field>
          </ng-container>
        </app-sf-section>

        <app-sf-section *ngIf="data?.attachable" title="Attachments" columns="1">
          <app-upload-file [selectedFiles]="files" (fileUpload)="files = $event"></app-upload-file>
        </app-sf-section>
      </form>

      <label footerExtra *ngIf="data?.onCreate" class="inline-flex cursor-pointer select-none items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
        <input type="checkbox" class="h-3.5 w-3.5 rounded border-gray-300 accent-violet-600" [checked]="createAnother" (change)="createAnother = !createAnother" />
        Create another
      </label>
    </app-form-modal-shell>
  `,
  styles: [':host{display:block}'],
})
export class EventCreateModalComponent implements OnInit {
  get today(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  private fb = inject(FormBuilder);
  private employees = inject(EmployeeService);
  private dialogRef = inject<ModalRef<EventModalResult>>(ModalRef);
  data = inject(MODAL_DATA, { optional: true }) as EventCreateModalData | null;

  submitted = false;
  createAnother = false;
  files: File[] = [];
  syncToOutlook = false;
  onlineMeeting = false;

  employeeOptions: SfOption[] = [];

  form = this.fb.group({
    attendees: [[] as string[]],
    title: ['', [Validators.required, Validators.maxLength(120)]],
    description: ['', Validators.maxLength(1000)],
    date: [null as string | null, Validators.required],
    startTime: ['09:00'],
    location: ['', Validators.maxLength(120)],
  });

  ngOnInit(): void {
    if (this.data?.outlookSync) {
      this.form.controls.startTime.addValidators(Validators.required);
      // /employee already excludes deleted and blocked staff; attendees also need a mailbox.
      this.employees.getAllEmployees().subscribe({
        next: (list) => {
          this.employeeOptions = (list || [])
            .filter((e) => !e.isBlocked && !!e.email)
            .map((e) => ({ label: `${e.firstName} ${e.lastName}`.trim(), value: e.email, description: e.email }));
        },
        error: () => { this.employeeOptions = []; },
      });
    }
    if (this.data?.requireSummary) {
      this.form.controls.description.addValidators(Validators.required);
      this.form.controls.description.updateValueAndValidity();
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
    const attendees = v.attendees || [];
    // With the time field shown, date becomes a full ISO timestamp built from the local date + time.
    let date: string | undefined = v.date ?? undefined;
    if (this.data?.outlookSync && v.date) {
      date = new Date(`${v.date}T${v.startTime}`).toISOString();
    }
    const event: EventModalResult = {
      syncToOutlook: this.syncToOutlook,
      onlineMeeting: this.syncToOutlook && this.onlineMeeting,
      attendees: this.syncToOutlook ? attendees : [],
      id: `event-${Date.now()}`,
      kind: 'event',
      title: v.title!.trim(),
      description: v.description?.trim() || undefined,
      date,
      location: v.location?.trim() || undefined,
      deletable: true,
      files: this.data?.attachable ? this.files : undefined,
    };

    if (this.createAnother && this.data?.onCreate) {
      this.data.onCreate(event);
      this.form.reset({ ...this.form.getRawValue(), title: '', description: '', location: '', attendees: [] });
      this.files = [];
      this.submitted = false;
      return;
    }
    this.dialogRef.close(event);
  }
}
