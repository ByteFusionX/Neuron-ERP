import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, Validators } from '@angular/forms';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { FormModalShellComponent, MODAL_DATA, ModalRef } from 'src/app/shared/components/modal';
import { SmartFormModule } from 'src/app/shared/components/smart-form';
import { SfOption } from 'src/app/shared/components/smart-form/sf.model';
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
  allocationType: allocateType;
  procurementPerson?: string;
}

/** Picks how a pending job will be delivered. Closes with the choice, or undefined on cancel. */
@Component({
  selector: 'app-allocate-type-modal',
  standalone: true,
  imports: [CommonModule, SmartFormModule, FormModalShellComponent],
  template: `
    <app-form-modal-shell
      icon="refresh" tone="sky" title="Allocate job"
      contextLabel="Job" [context]="data?.jobId"
      formId="allocate-job-form" [invalid]="form.invalid && submitted"
      submitLabel="Allocate" submitIcon="check" submitShortcutVerb="allocate"
      (closed)="close()">
      <form id="allocate-job-form" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <app-sf-section title="Allocation" columns="1">
          <app-sf-field label="Allocation type" [control]="form.controls.allocationType">
            <app-sf-radio-group formControlName="allocationType" [options]="allocationTypes"></app-sf-radio-group>
          </app-sf-field>
          <app-sf-field *ngIf="needsProcurement" label="Procurement person" [control]="form.controls.procurementPerson">
            <app-sf-combobox formControlName="procurementPerson" [options]="employeeOptions" placeholder="Select procurement person"></app-sf-combobox>
          </app-sf-field>
        </app-sf-section>
      </form>
    </app-form-modal-shell>
  `,
  styles: [':host{display:block}'],
})
export class AllocateTypeModalComponent implements OnInit {
  private fb = inject(FormBuilder);
  private dialogRef = inject<ModalRef<AllocateTypeResult>>(ModalRef);
  private employeeService = inject(EmployeeService);
  data = inject(MODAL_DATA, { optional: true }) as getJob | null;

  readonly allocationTypes: SfOption[] = [
    { value: allocateType.SupplyOnly, label: 'Supply Only', description: 'Material supply without installation' },
    { value: allocateType.ProjectWithSupply, label: 'Project With Supply', description: 'Complete project with material supply' },
    { value: allocateType.ProjectsWithOutSupply, label: 'Projects Without Supply', description: 'Project execution without material supply' },
    { value: allocateType.AMC, label: 'AMC', description: 'Annual Maintenance Contract' },
  ];

  employeeOptions: SfOption[] = [];
  submitted = false;
  form = this.fb.group({
    allocationType: [null as allocateType | null, Validators.required],
    procurementPerson: [null as string | null],
  });

  get needsProcurement(): boolean {
    const t = this.form.controls.allocationType.value;
    return t === allocateType.SupplyOnly || t === allocateType.ProjectWithSupply;
  }

  ngOnInit(): void {
    this.employeeService.getProcurementEmployees().subscribe({
      next: (employees) => (this.employeeOptions = employees.map((e) => ({ value: e._id || '', label: `${e.firstName} ${e.lastName}` }))),
      error: (error) => console.error('Error loading employees:', error),
    });
    this.form.controls.allocationType.valueChanges.subscribe(() => {
      const person = this.form.controls.procurementPerson;
      person.setValidators(this.needsProcurement ? Validators.required : null);
      if (!this.needsProcurement) person.setValue(null);
      person.updateValueAndValidity();
    });
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
    const { allocationType, procurementPerson } = this.form.getRawValue();
    this.dialogRef.close({
      id: this.data._id,
      jobId: this.data.jobId,
      allocationType: allocationType as allocateType,
      ...(this.needsProcurement && procurementPerson ? { procurementPerson } : {}),
    });
  }
}
