import { Component, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, inject } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subscription, combineLatest, map } from 'rxjs';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { SfOption, SmartFormModule } from 'src/app/shared/components/smart-form';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';

/** What the drawer hands back: the assignment, or `{ clear: true }` to remove the current one. */
export interface PresaleAssignment {
  presalePerson?: string;
  presalePersonName?: string;
  comment?: string;
  newPresaleFile?: File[];
  existingPresaleFiles?: any[];
  clear?: boolean;
}

/**
 * Assign-to-presale slide-over. The host binds `open` and `presale` (the enquiry's current
 * preSale block, if any) and reacts to `assigned` / `closed`.
 */
@Component({
  selector: 'app-assign-presale-drawer',
  standalone: true,
  templateUrl: './assign-presale-drawer.component.html',
  imports: [NgIf, NgFor, ReactiveFormsModule, SmartFormModule, ActionButtonComponent],
})
export class AssignPresaleDrawerComponent implements OnChanges, OnDestroy {
  @Input() open = false;
  /** Current assignment when re-assigning; drives the prefill and the Clear button. */
  @Input() presale: any = null;
  @Output() assigned = new EventEmitter<PresaleAssignment>();
  @Output() closed = new EventEmitter<void>();

  readonly acceptedFiles = '.jpg,.jpeg,.png,.pdf,.doc,.docx,.xlsx,.msg,.dwg';
  employeeOptions: SfOption[] = [];
  /** Files already stored on the enquiry; sent back so the server keeps them. */
  existingFiles: any[] = [];
  filesError = false;

  private fb = inject(FormBuilder);
  private employeeService = inject(EmployeeService);
  private employees: { _id: string; name: string }[] = [];
  private optionsLoaded = false;
  private subscriptions = new Subscription();

  form = this.fb.group({
    presalePerson: [null as string | null, Validators.required],
    comment: ['', Validators.required],
    files: [[] as File[]],
  });

  get isReassign(): boolean {
    return !!this.presale?.presalePerson;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.open || !(changes['open'] || changes['presale'])) return;
    this.ensureOptions();
    this.seed();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  private ensureOptions(): void {
    if (this.optionsLoaded) return;
    this.optionsLoaded = true;
    this.subscriptions.add(
      combineLatest([this.employeeService.getPresaleEngineers(), this.employeeService.getPresaleManagers()])
        .pipe(map(([engineers, managers]) => [...(engineers ?? []), ...(managers ?? [])]))
        .subscribe((list) => {
          // The requester can't estimate their own enquiry, and someone can hold both presale privileges.
          const requesterId = this.employeeService.employeeToken()?.id;
          const seen = new Set<string>();
          this.employees = list
            .filter((e) => e._id !== requesterId && !seen.has(e._id as string) && !!seen.add(e._id as string))
            .map((e) => ({ _id: e._id as string, name: `${e.firstName ?? ''} ${e.lastName ?? ''}`.trim() }));
          this.employeeOptions = this.employees.map((e) => ({ label: e.name, value: e._id }));
        })
    );
  }

  private seed(): void {
    this.filesError = false;
    this.existingFiles = [...(this.presale?.presaleFiles ?? [])];
    this.form.reset({
      presalePerson: this.presale?.presalePerson ?? null,
      comment: this.presale?.comment ?? '',
      files: [],
    });
  }

  removeExisting(i: number): void {
    this.existingFiles = this.existingFiles.filter((_, idx) => idx !== i);
    this.form.markAsDirty();
  }

  onDrawerClosed(): void {
    this.closed.emit();
  }

  clear(): void {
    this.assigned.emit({ clear: true });
  }

  submit(): void {
    const v = this.form.getRawValue();
    const newFiles = v.files ?? [];
    this.filesError = !newFiles.length && !this.existingFiles.length;
    if (this.form.invalid || this.filesError) {
      this.form.markAllAsTouched();
      return;
    }
    this.assigned.emit({
      presalePerson: v.presalePerson!,
      presalePersonName: this.employees.find((e) => e._id === v.presalePerson)?.name,
      comment: v.comment!,
      newPresaleFile: newFiles,
      existingPresaleFiles: this.existingFiles,
    });
  }
}
