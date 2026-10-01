import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, ValidationErrors, Validators } from '@angular/forms';
import { FormModalShellComponent, MODAL_DATA, ModalRef } from '../../modal';
import { SfOption, SmartFormModule } from '../../smart-form';
import { DetailTaskItem } from '../detail-panel.model';

export interface TaskCreateModalData {
  /** Record the task belongs to, shown as a chip in the header, e.g. a project or quotation name. */
  context?: string;
  /** People the task can be assigned to / who can watch it. */
  people?: string[];
  /** When provided, "Create another" is offered: each task is passed here and the modal stays open. */
  onCreate?: (task: DetailTaskItem) => void;
}

type Priority = NonNullable<DetailTaskItem['priority']>;
type Status = NonNullable<DetailTaskItem['status']>;

const dueNotBeforeStart = (g: AbstractControl): ValidationErrors | null => {
  const { startDate, dueDate } = g.value;
  return startDate && dueDate && dueDate < startDate ? { dueBeforeStart: true } : null;
};

const isoDay = (offsetDays: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * Create-task modal for detail panel "Tasks" tabs, built on the smart-form controls.
 * Closes with the new DetailTaskItem, or undefined on cancel.
 *
 *   modal.open<DetailTaskItem>(TaskCreateModalComponent, { width: '640px', data: { context: row.name, people } })
 */
@Component({
  selector: 'app-task-create-modal',
  standalone: true,
  imports: [CommonModule, SmartFormModule, FormModalShellComponent],
  template: `
    <app-form-modal-shell
      icon="tasks" tone="violet" title="New task"
      [context]="data?.context" contextEmptyText="Capture the work, who owns it and when it's due."
      formId="task-create-form" [invalid]="form.invalid && submitted"
      submitLabel="Create task" submitShortcutVerb="create"
      (closed)="close()">
      <form id="task-create-form" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <app-sf-section title="What needs to be done" columns="1">
          <app-sf-field label="Title" [control]="form.controls.title">
            <app-sf-input formControlName="title" placeholder="e.g. Follow up with supplier on delivery date" [maxlength]="120" clearable></app-sf-input>
          </app-sf-field>
          <app-sf-field label="Description" optional [control]="form.controls.description">
            <app-sf-textarea formControlName="description" [rows]="3" [maxlength]="1000" autoresize
              placeholder="Context, acceptance criteria, links…"></app-sf-textarea>
          </app-sf-field>
        </app-sf-section>

        <app-sf-section title="Status & priority" columns="2">
          <app-sf-field label="Status">
            <app-sf-radio-group formControlName="status" variant="segmented" [options]="statusOptions"></app-sf-radio-group>
          </app-sf-field>
          <app-sf-field label="Priority">
            <app-sf-radio-group formControlName="priority" variant="segmented" [options]="priorityOptions"></app-sf-radio-group>
          </app-sf-field>
        </app-sf-section>

        <app-sf-section title="Ownership" columns="2">
          <app-sf-field label="Assignee" hint="Who is responsible" [control]="form.controls.assignee">
            <app-sf-combobox formControlName="assignee" [options]="peopleOptions" placeholder="Select a person"></app-sf-combobox>
          </app-sf-field>
          <app-sf-field label="Watchers" optional hint="Notified on updates">
            <app-sf-combobox formControlName="watchers" [options]="peopleOptions" multiple placeholder="Add people"></app-sf-combobox>
          </app-sf-field>
        </app-sf-section>

        <app-sf-section title="Schedule" columns="2">
          <app-sf-field label="Start date" optional>
            <app-sf-date formControlName="startDate" [min]="today"></app-sf-date>
          </app-sf-field>
          <app-sf-field label="Due date" [control]="form.controls.dueDate">
            <app-sf-date formControlName="dueDate" [min]="form.controls.startDate.value || today"></app-sf-date>
            <div class="mt-1.5 flex flex-wrap gap-1">
              <button *ngFor="let q of dueShortcuts" type="button" (click)="setDue(q.days)"
                class="rounded-full border px-2 py-0.5 text-[11px] transition"
                [ngClass]="form.controls.dueDate.value === isoDay(q.days)
                  ? 'border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-erp-border-dark dark:text-gray-400 dark:hover:bg-gray-800'">{{ q.label }}</button>
            </div>
          </app-sf-field>
          <p *ngIf="form.hasError('dueBeforeStart') && form.controls.dueDate.touched" class="-mt-2 text-xs text-red-600 sm:col-span-2 dark:text-red-400" role="alert">
            Due date can't be before the start date.
          </p>
          <app-sf-field label="Estimated effort" optional [control]="form.controls.estimateHours">
            <app-sf-number formControlName="estimateHours" suffix="hrs" [min]="0" [max]="999" [stepSize]="0.5" placeholder="0"></app-sf-number>
          </app-sf-field>
          <app-sf-field label="Reminder" optional>
            <app-sf-select formControlName="reminder" [options]="reminderOptions" placeholder="No reminder"
              [class.pointer-events-none]="!form.controls.dueDate.value" [class.opacity-60]="!form.controls.dueDate.value"></app-sf-select>
          </app-sf-field>
        </app-sf-section>

        <app-sf-section title="More" columns="1">
          <app-sf-field label="Tags" optional hint="Press Enter to add">
            <app-sf-tags formControlName="tags" placeholder="e.g. site-visit, procurement" [max]="8"></app-sf-tags>
          </app-sf-field>
          <app-sf-field label="Attachments" optional>
            <app-sf-file formControlName="attachments" accept=".pdf,.docx,.xlsx,.png,.jpg" [maxSizeMb]="10"></app-sf-file>
          </app-sf-field>
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
export class TaskCreateModalComponent {
  get today(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  private fb = inject(FormBuilder);
  private dialogRef = inject<ModalRef<DetailTaskItem>>(ModalRef);
  data = inject(MODAL_DATA, { optional: true }) as TaskCreateModalData | null;

  submitted = false;
  createAnother = false;
  readonly isoDay = isoDay;

  readonly peopleOptions: SfOption<string>[] = (this.data?.people ?? []).map((p) => ({ label: p, value: p }));
  readonly statusOptions: SfOption<Status>[] = (['To do', 'In progress', 'Blocked'] as Status[]).map((s) => ({ label: s, value: s }));
  readonly priorityOptions: SfOption<Priority>[] = (['Low', 'Medium', 'High', 'Urgent'] as Priority[]).map((p) => ({ label: p, value: p }));
  readonly reminderOptions: SfOption<string>[] = [
    { label: 'On the due date', value: '0d' },
    { label: '1 day before', value: '1d' },
    { label: '2 days before', value: '2d' },
    { label: '1 week before', value: '7d' },
  ];
  readonly dueShortcuts = [
    { label: 'Today', days: 0 },
    { label: 'Tomorrow', days: 1 },
    { label: 'Next week', days: 7 },
  ];

  form = this.fb.group({
    title: ['', [Validators.required, Validators.maxLength(120)]],
    description: ['', Validators.maxLength(1000)],
    status: ['To do' as Status],
    priority: ['Medium' as Priority],
    assignee: [null as string | null, Validators.required],
    watchers: [[] as string[]],
    startDate: [null as string | null],
    dueDate: [null as string | null, Validators.required],
    estimateHours: [null as number | null, [Validators.min(0), Validators.max(999)]],
    reminder: [null as string | null],
    tags: [[] as string[]],
    attachments: [[] as File[]],
  }, { validators: dueNotBeforeStart });

  setDue(days: number): void {
    this.form.controls.dueDate.setValue(isoDay(days));
    this.form.controls.dueDate.markAsTouched();
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
    const task: DetailTaskItem = {
      id: `task-${Date.now()}`,
      kind: 'task',
      title: v.title!.trim(),
      description: v.description?.trim() || undefined,
      status: v.status ?? 'To do',
      priority: v.priority ?? 'Medium',
      assignee: v.assignee ?? undefined,
      watchers: v.watchers?.length ? v.watchers : undefined,
      startDate: v.startDate ?? undefined,
      date: v.dueDate ?? undefined,
      estimateHours: v.estimateHours ?? undefined,
      reminder: v.dueDate ? v.reminder ?? undefined : undefined,
      tags: v.tags?.length ? v.tags : undefined,
      attachments: v.attachments?.length ? v.attachments.map((f, i) => ({ id: `att-${Date.now()}-${i}`, name: f.name })) : undefined,
      done: false,
      deletable: true,
    };

    if (this.createAnother && this.data?.onCreate) {
      this.data.onCreate(task);
      // Keep who/when context so a batch of related tasks is quick to enter.
      this.form.reset({ ...this.form.getRawValue(), title: '', description: '', tags: [], attachments: [], estimateHours: null });
      this.submitted = false;
      return;
    }
    this.dialogRef.close(task);
  }
}
