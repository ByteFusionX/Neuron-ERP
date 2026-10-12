import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, Validators } from '@angular/forms';
import { Subscription, take } from 'rxjs';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { EnquiryService } from 'src/app/core/services/enquiry/enquiry.service';
import { FormModalShellComponent, MODAL_DATA, ModalRef } from 'src/app/shared/components/modal';
import { SmartFormModule } from 'src/app/shared/components/smart-form';
import { SfOption } from 'src/app/shared/components/smart-form/sf.model';

export interface AssignEmployeeModalData {
  enquiryId: string;
  /** Enquiry number shown as a chip in the header. */
  context?: string;
  mode?: 'assign' | 'reassign';
  canAssign?: boolean;
}

/** Closes with `{ message }` once the job is assigned, or undefined on cancel. */
@Component({
  selector: 'app-assign-employee',
  standalone: true,
  imports: [CommonModule, SmartFormModule, FormModalShellComponent],
  template: `
    <app-form-modal-shell
      icon="transfer" tone="sky" [title]="isReassign ? 'Reassign job' : 'Assign job'"
      contextLabel="Enquiry" [context]="data?.context"
      [contextEmptyText]="isReassign ? 'Pick another presale engineer for this rejected job.' : 'Pick the presale engineer who will work on this job.'"
      formId="assign-employee-form" [invalid]="form.invalid && submitted" [saving]="saving"
      submitLabel="Submit" submitIcon="check" savingLabel="Submitting..." submitShortcutVerb="submit"
      (closed)="close()">
      <form id="assign-employee-form" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <app-sf-section title="Assignment" columns="1">
          <app-sf-field label="Employee" [control]="form.controls.employee">
            <app-sf-combobox formControlName="employee" [options]="employeeOptions" placeholder="Select employee"></app-sf-combobox>
          </app-sf-field>
          <app-sf-field label="Comment" [control]="form.controls.comment">
            <app-sf-textarea formControlName="comment" [rows]="3" [maxlength]="1000" autoresize
              placeholder="Add a comment for the presale engineer"></app-sf-textarea>
          </app-sf-field>
        </app-sf-section>
      </form>
    </app-form-modal-shell>
  `,
  styles: [':host{display:block}'],
})
export class AssignEmployeeComponent implements OnInit, OnDestroy {
  private fb = inject(FormBuilder);
  private dialogRef = inject<ModalRef<{ message: string }>>(ModalRef);
  private _employeeService = inject(EmployeeService);
  private _enquiryService = inject(EnquiryService);
  data = inject(MODAL_DATA, { optional: true }) as AssignEmployeeModalData | null;

  employeeOptions: SfOption[] = [];
  submitted = false;
  saving = false;
  form = this.fb.group({
    employee: ['', Validators.required],
    comment: ['', Validators.maxLength(1000)],
  });
  private selfId?: string;
  private subscriptions = new Subscription();

  get isReassign(): boolean {
    return this.data?.mode === 'reassign';
  }

  ngOnInit() {
    const selfMode = !!this.data?.canAssign;
    this.subscriptions.add(
      this._employeeService.employeeData$.pipe(take(1)).subscribe((me: any) => {
        if (selfMode && me?._id) this.selfId = me._id;
        this._employeeService.getPresaleEngineers().subscribe((employees) => {
          const options: SfOption[] = employees
            .filter((e) => !(selfMode && e._id === this.selfId))
            .map((e) => ({ value: e._id, label: `${e.firstName} ${e.lastName}` }));
          if (selfMode && this.selfId) {
            options.unshift({ value: this.selfId, label: `${me.firstName} ${me.lastName} (Self assign)` });
          }
          this.employeeOptions = options;
        });
      })
    );
  }

  close(): void {
    this.dialogRef.close();
  }

  submit(): void {
    this.submitted = true;
    if (this.form.invalid || this.saving || !this.data) {
      this.form.markAllAsTouched();
      return;
    }
    const { employee, comment } = this.form.getRawValue();
    const enquiryId = this.data.enquiryId;
    this.saving = true;
    const fail = () => (this.saving = false);

    if (this.selfId && employee === this.selfId) {
      this.subscriptions.add(
        this._enquiryService.selfAssignJob(enquiryId).subscribe({
          next: (res) => (res.success ? this.dialogRef.close({ message: res.message }) : fail()),
          error: fail,
        })
      );
      return;
    }
    if (this.data.mode === 'assign') {
      const formData = new FormData();
      formData.append('presaleData', JSON.stringify({ presalePerson: employee, comment }));
      this.subscriptions.add(
        this._enquiryService.assignPresale(formData, enquiryId).subscribe({
          next: (res) => (res.success ? this.dialogRef.close({ message: 'Job assigned successfully' }) : fail()),
          error: fail,
        })
      );
      return;
    }
    this.subscriptions.add(
      this._enquiryService.reassignjob({ enquiryId, employeeId: employee as string, comment: comment ?? '' }).subscribe({
        next: (res) => (res.message ? this.dialogRef.close({ message: res.message }) : fail()),
        error: fail,
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }
}
