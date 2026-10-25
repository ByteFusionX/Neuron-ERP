import { Component, Inject, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { ToastrService } from 'ngx-toastr';
import { DeliveryNoteService } from 'src/app/core/services/delivery-note/delivery-note.service';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { ModalFooterButton, ModalLayoutComponent } from 'src/app/shared/components/modal-layout/modal-layout.component';
import { SfOption, SmartFormModule } from 'src/app/shared/components/smart-form';

export interface ConfirmDeliveryData {
  id: string;
  dnNo: string;
  clientName?: string;
}

/** Closes a dispatched DN. Date/time and the delivering employee are required; the rest is optional proof. */
@Component({
  selector: 'app-confirm-delivery-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ModalLayoutComponent, SmartFormModule],
  template: `
    <app-modal-layout title="Deliver" [subtitle]="data.dnNo + (data.clientName ? ' · ' + data.clientName : '')"
      [onClose]="cancel.bind(this)" [footerButtons]="footerButtons">
      <form [formGroup]="form" class="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2" (ngSubmit)="confirm()" novalidate>
        <app-sf-field label="Delivered on" required [control]="form.controls.receivedDate" [messages]="{ required: 'Pick the delivery date and time' }">
          <app-sf-date formControlName="receivedDate" type="datetime-local" [max]="now"></app-sf-date>
        </app-sf-field>
        <app-sf-field label="Delivered by" required [control]="form.controls.deliveredBy" [messages]="{ required: 'Pick who delivered it' }">
          <app-sf-combobox formControlName="deliveredBy" [options]="employeeOptions" placeholder="Select employee"
            emptyText="No employees found"></app-sf-combobox>
        </app-sf-field>
        <app-sf-field label="Accepted by" optional full hint="Name of the person who received the goods.">
          <app-sf-input formControlName="receivedBy" placeholder="Receiver name"></app-sf-input>
        </app-sf-field>
        <app-sf-field label="Note" optional full>
          <app-sf-textarea formControlName="remarks" [rows]="2" placeholder="Delivery note (optional)"></app-sf-textarea>
        </app-sf-field>
        <app-sf-field label="Proof of delivery" optional full hint="Signed DN, photos or any other documents.">
          <app-sf-file formControlName="files"></app-sf-file>
        </app-sf-field>
        <button type="submit" class="hidden" aria-hidden="true" tabindex="-1"></button>
      </form>
    </app-modal-layout>
  `,
})
export class ConfirmDeliveryModalComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly dnService = inject(DeliveryNoteService);
  private readonly employeeService = inject(EmployeeService);
  private readonly toaster = inject(ToastrService);

  readonly now = this.localDateTime(new Date());
  employeeOptions: SfOption<string>[] = [];
  saving = false;

  form = this.fb.group({
    receivedDate: [this.now, Validators.required],
    deliveredBy: ['', Validators.required],
    receivedBy: [''],
    remarks: [''],
    files: [[] as File[]],
  });

  constructor(
    private dialogRef: MatDialogRef<ConfirmDeliveryModalComponent, boolean>,
    @Inject(MAT_DIALOG_DATA) public data: ConfirmDeliveryData,
  ) {}

  ngOnInit(): void {
    this.employeeService.getAllEmployees().subscribe({
      next: (employees) => {
        this.employeeOptions = (employees || []).map((e: any) => ({
          label: `${e.firstName || ''} ${e.lastName || ''}`.trim() || e.email || 'Unnamed',
          value: e._id,
          description: e.designation || undefined,
        }));
      },
      error: () => this.toaster.error('Failed to load employees'),
    });
  }

  get footerButtons(): ModalFooterButton[] {
    return [
      { label: 'Cancel', theme: 'cancel', onClick: () => this.cancel(), disabled: this.saving },
      { label: 'Deliver', theme: 'primary', onClick: () => this.confirm(), loading: this.saving },
    ];
  }

  cancel(): void {
    this.dialogRef.close(false);
  }

  confirm(): void {
    if (this.saving) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    this.saving = true;
    this.dnService.confirmDelivery(this.data.id, {
      receivedDate: new Date(v.receivedDate!).toISOString(),
      deliveredBy: v.deliveredBy!,
      receivedBy: v.receivedBy?.trim() || undefined,
      remarks: v.remarks?.trim() || undefined,
    }, v.files || []).subscribe({
      next: () => {
        this.toaster.success(`${this.data.dnNo} marked delivered`);
        this.dialogRef.close(true);
      },
      error: (err) => {
        this.toaster.error(err.error?.message || 'Failed to deliver');
        this.saving = false;
      },
    });
  }

  /** yyyy-MM-ddTHH:mm in local time, the shape datetime-local inputs use. */
  private localDateTime(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
}
