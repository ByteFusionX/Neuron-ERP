import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { Component, OnInit, inject } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { FormModalShellComponent, MODAL_DATA, ModalRef } from 'src/app/shared/components/modal';
import { SmartFormModule } from 'src/app/shared/components/smart-form';
import { SfOption } from 'src/app/shared/components/smart-form/sf.model';
import { ALLOCATE_SCOPES } from '../allocate-type-modal/allocate-type-modal.component';

export interface TransferProcurementPersonData {
  jobId: string;
  jobLabel?: string;
  currentProcurementPerson?: any;
  /** The job's current scope, shown pre-ticked. */
  allocateType?: string;
  productDistribution?: boolean;
  projectInstallation?: boolean;
  amc?: boolean;
  /** The job's current deadline, pre-filled. */
  deadline?: string;
}

export interface TransferProcurementPersonResult {
  procurementPersonId?: string;
  deadline?: string;
  productDistribution: boolean;
  projectInstallation: boolean;
  amc: boolean;
}

type ScopeKey = 'productDistribution' | 'projectInstallation' | 'amc';

@Component({
    selector: 'app-transfer-procurement-person',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule, SmartFormModule, FormModalShellComponent],
    templateUrl: './transfer-procurement-person.component.html',
    styleUrls: ['./transfer-procurement-person.component.css']
})
export class TransferProcurementPersonComponent implements OnInit {
  private fb = inject(FormBuilder);
  private dialogRef = inject<ModalRef<TransferProcurementPersonResult>>(ModalRef);
  private employeeService = inject(EmployeeService);
  data = inject(MODAL_DATA, { optional: true }) as TransferProcurementPersonData | null;

  readonly scopes = ALLOCATE_SCOPES;
  readonly today = new Date().toISOString().slice(0, 10);
  employeeOptions: SfOption[] = [];
  submitted = false;
  form = this.fb.nonNullable.group({
    productDistribution: false,
    projectInstallation: false,
    amc: false,
    procurementPerson: [''],
    deadline: [''],
  }, { validators: (g) => (g.value.productDistribution || g.value.projectInstallation || g.value.amc ? null : { scopeRequired: true }) });

  ngOnInit(): void {
    this.form.patchValue({
      ...this.currentScope(),
      procurementPerson: this.currentId ?? '',
      deadline: this.data?.deadline ? String(this.data.deadline).slice(0, 10) : '',
    });
    // A buyer and deadline are only needed while product distribution is ticked.
    const sync = (on: boolean) => {
      for (const control of [this.form.controls.procurementPerson, this.form.controls.deadline]) {
        control.setValidators(on ? [Validators.required] : []);
        control.updateValueAndValidity();
      }
    };
    sync(this.form.controls.productDistribution.value);
    this.form.controls.productDistribution.valueChanges.subscribe(sync);
    this.employeeService.getPurchaseBuyers().subscribe({
      next: (res) => {
        this.employeeOptions = (res?.data ?? []).map((employee) => ({
          value: employee._id || '',
          label: `${employee.firstName} ${employee.lastName}`,
        }));
      },
      error: (error) => console.error('Error loading employees:', error),
    });
  }

  /** Uses the stored scope flags, else derives them from the legacy allocate type. */
  private currentScope(): Record<ScopeKey, boolean> {
    const d = this.data;
    if (d && (d.productDistribution !== undefined || d.projectInstallation !== undefined || d.amc !== undefined)) {
      return { productDistribution: !!d.productDistribution, projectInstallation: !!d.projectInstallation, amc: !!d.amc };
    }
    const t = d?.allocateType;
    return {
      productDistribution: t === 'Supply Only' || t === 'Project With Supply',
      projectInstallation: t === 'Project With Supply' || t === 'Projects With Out Supply',
      amc: t === 'AMC',
    };
  }

  toggle(key: ScopeKey): void {
    const control = this.form.controls[key];
    control.setValue(!control.value);
    control.markAsDirty();
    this.form.markAllAsTouched();
  }

  close(): void {
    this.dialogRef.close();
  }

  get currentId(): string | undefined {
    return this.data?.currentProcurementPerson?._id;
  }

  get currentProcurementPersonName(): string {
    const person = this.data?.currentProcurementPerson;
    return person ? `${person.firstName || ''} ${person.lastName || ''}`.trim() : '';
  }

  submit(): void {
    this.submitted = true;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { productDistribution, projectInstallation, amc, procurementPerson, deadline } = this.form.getRawValue();
    this.dialogRef.close({
      productDistribution, projectInstallation, amc,
      ...(productDistribution ? { procurementPersonId: procurementPerson, deadline } : {}),
    });
  }
}
