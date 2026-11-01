import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { DeliveryNoteService } from 'src/app/core/services/delivery-note/delivery-note.service';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { FormModalShellComponent, MODAL_DATA, ModalRef } from 'src/app/shared/components/modal';
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
  imports: [CommonModule, ReactiveFormsModule, SmartFormModule, FormModalShellComponent],
  template: `
    <app-form-modal-shell
      icon="check" tone="emerald" title="Proof of delivery"
      [context]="contextText" contextLabel="Delivering" contextEmptyText="Record the hand-over of this delivery."
      formId="confirm-delivery-form" [invalid]="form.invalid && submitted" [saving]="saving"
      submitLabel="Submit POD" submitIcon="check" submitShortcutVerb="submit"
      (closed)="cancel()">
      <form id="confirm-delivery-form" [formGroup]="form" (ngSubmit)="confirm()" novalidate>
        <app-sf-section title="Delivery" columns="2">
          <app-sf-field label="Delivered on" required [control]="form.controls.receivedDate" [messages]="{ required: 'Pick the delivery date and time' }">
            <app-sf-date formControlName="receivedDate" type="datetime-local" [max]="now"></app-sf-date>
          </app-sf-field>
          <app-sf-field label="Delivered by" required [control]="form.controls.deliveredBy" [messages]="{ required: 'Pick who delivered it' }">
            <app-sf-combobox formControlName="deliveredBy" [options]="employeeOptions" placeholder="Select employee"
              emptyText="No employees found"></app-sf-combobox>
          </app-sf-field>
          <div class="col-span-2">
            <app-sf-field label="Accepted by" optional hint="Name of the person who received the goods.">
              <app-sf-input formControlName="receivedBy" placeholder="Receiver name" clearable></app-sf-input>
            </app-sf-field>
          </div>
        </app-sf-section>
        <app-sf-section title="Notes & proof" columns="1">
          <app-sf-field label="Note" optional>
            <app-sf-textarea formControlName="remarks" [rows]="3" [maxlength]="1000" autoresize placeholder="Delivery note (optional)"></app-sf-textarea>
          </app-sf-field>
          <app-sf-field label="Proof of delivery" optional hint="Signed DN, photos or any other documents.">
            <app-sf-file formControlName="files"></app-sf-file>
          </app-sf-field>
        </app-sf-section>
      </form>
    </app-form-modal-shell>
  `,
  styles: [':host{display:block}'],
})
export class ConfirmDeliveryModalComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly dnService = inject(DeliveryNoteService);
  private readonly employeeService = inject(EmployeeService);
  private readonly toaster = inject(ToastrService);

  readonly now = this.localDateTime(new Date());
  employeeOptions: SfOption<string>[] = [];
  saving = false;
  submitted = false;

  private dialogRef = inject<ModalRef<boolean>>(ModalRef);
  data = inject(MODAL_DATA) as ConfirmDeliveryData;

  get contextText(): string {
    return this.data.dnNo + (this.data.clientName ? ' · ' + this.data.clientName : '');
  }

  form = this.fb.group({
    receivedDate: [this.now, Validators.required],
    deliveredBy: ['', Validators.required],
    receivedBy: [''],
    remarks: [''],
    files: [[] as File[]],
  });


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

  cancel(): void {
    this.dialogRef.close(false);
  }

  confirm(): void {
    if (this.saving) return;
    this.submitted = true;
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
