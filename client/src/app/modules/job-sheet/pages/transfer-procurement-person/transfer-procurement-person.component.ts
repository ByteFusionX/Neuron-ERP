import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { FormModalShellComponent, MODAL_DATA, ModalRef } from 'src/app/shared/components/modal';
import { SmartFormModule } from 'src/app/shared/components/smart-form';
import { SfOption } from 'src/app/shared/components/smart-form/sf.model';

export interface TransferProcurementPersonData {
  jobId: string;
  jobLabel?: string;
  currentProcurementPerson?: any;
}

export interface TransferProcurementPersonResult {
  procurementPersonId: string;
}

@Component({
    selector: 'app-transfer-procurement-person',
    standalone: true,
    imports: [CommonModule, SmartFormModule, FormModalShellComponent],
    templateUrl: './transfer-procurement-person.component.html',
    styleUrls: ['./transfer-procurement-person.component.css']
})
export class TransferProcurementPersonComponent implements OnInit {
  private fb = inject(FormBuilder);
  private dialogRef = inject<ModalRef<TransferProcurementPersonResult>>(ModalRef);
  private employeeService = inject(EmployeeService);
  data = inject(MODAL_DATA, { optional: true }) as TransferProcurementPersonData | null;

  employeeOptions: SfOption[] = [];
  submitted = false;
  form = this.fb.group({
    procurementPerson: [null as string | null, Validators.required],
  });

  ngOnInit(): void {
    this.employeeService.getPurchaseBuyers().subscribe({
      next: (res) => {
        this.employeeOptions = (res?.data ?? []).map((employee) => ({
          value: employee._id || '',
          label: `${employee.firstName} ${employee.lastName}`,
          disabled: employee._id === this.currentId,
        }));
      },
      error: (error) => console.error('Error loading employees:', error),
    });
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

    const procurementPersonId = this.form.controls.procurementPerson.value;
    if (!procurementPersonId) return;
    this.dialogRef.close({ procurementPersonId });
  }
}

