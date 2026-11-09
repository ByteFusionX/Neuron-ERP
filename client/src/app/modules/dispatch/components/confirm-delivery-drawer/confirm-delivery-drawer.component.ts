import { Component, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Observable, of, switchMap } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { DeliveryNoteService } from 'src/app/core/services/delivery-note/delivery-note.service';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { SfOption, SmartFormModule } from 'src/app/shared/components/smart-form';
import { SupplierFormStepperComponent } from 'src/app/modules/suppliers/components/form-stepper/form-stepper.component';
import { PodItemEntryComponent } from '../pod-item-entry/pod-item-entry.component';

/**
 * Closes a dispatched DN. Records who delivered and when, plus the customer's acceptance per line:
 * everything accepted -> Delivered; some refused -> Partially Rejected; everything refused -> Rejected.
 * Refused stock returns to quarantine server-side.
 */
@Component({
  selector: 'app-confirm-delivery-drawer',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, SmartFormModule, ActionButtonComponent, PodItemEntryComponent, SupplierFormStepperComponent],
  template: `
    <app-sf-drawer [open]="true" title="Proof of delivery" [subtitle]="subtitle" width="720px" [dirty]="form.dirty" (closed)="!saving && closed.emit()">
      <app-supplier-form-stepper [steps]="steps" [current]="step" [isStepValid]="isStepValid.bind(this)"
        (stepClick)="goToStep($event)"></app-supplier-form-stepper>
      <form id="confirm-delivery-form" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <app-sf-section *ngIf="step === 1" title="Delivery" columns="2">
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

        <hr *ngIf="step === 1" class="my-5 border-gray-200 dark:border-gray-700" />

        <section *ngIf="step === 1" class="mb-5">
          <div class="mb-2">
            <h3 class="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">Items</h3>
          </div>
          <p *ngIf="loading" class="text-sm text-gray-500">Loading items…</p>
          <app-pod-item-entry *ngIf="!loading" [items]="linesArray" [title]="'DN ' + dnNo"></app-pod-item-entry>
        </section>

        <app-sf-section *ngIf="step === 2" title="Notes & proof" columns="1">
          <app-sf-field *ngIf="rejectedQty > 0" label="Rejection reason" required hint="Applies to rejected lines without their own reason." [control]="form.controls.rejectReason" [messages]="{ required: 'Say why the customer rejected it' }">
            <app-sf-textarea formControlName="rejectReason" [rows]="2" placeholder="e.g. Damaged on arrival, wrong model"></app-sf-textarea>
          </app-sf-field>
          <app-sf-field label="Note" optional>
            <app-sf-textarea formControlName="remarks" [rows]="3" [maxlength]="1000" autoresize placeholder="Delivery note (optional)"></app-sf-textarea>
          </app-sf-field>
          <app-sf-field label="Proof of delivery" optional hint="Signed DN, photos or any other documents.">
            <app-sf-file formControlName="files"></app-sf-file>
          </app-sf-field>
        </app-sf-section>
      </form>
      <ng-container sfDrawerFooter>
        <app-action-button *ngIf="step === 1" variant="secondary" (click)="closed.emit()" [disabled]="saving">Cancel</app-action-button>
        <app-action-button *ngIf="step === 2" variant="secondary" (click)="step = 1" [disabled]="saving">Back</app-action-button>
        <app-action-button *ngIf="step === 1" variant="primary" (click)="goToStep(2)" [disabled]="loading">Next</app-action-button>
        <app-action-button *ngIf="step === 2" variant="primary" type="submit" form="confirm-delivery-form" [disabled]="saving || loading">
          {{ saving ? 'Submitting...' : 'Submit POD' }}
        </app-action-button>
      </ng-container>
    </app-sf-drawer>
  `,
})
export class ConfirmDeliveryDrawerComponent implements OnInit {
  @Input({ required: true }) id!: string;
  @Input() dnNo = '';
  @Input() clientName?: string;
  @Output() closed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<void>();

  private readonly fb = inject(FormBuilder);
  private readonly dnService = inject(DeliveryNoteService);
  private readonly employeeService = inject(EmployeeService);
  private readonly toaster = inject(ToastrService);

  readonly now = this.localDateTime(new Date());
  employeeOptions: SfOption<string>[] = [];
  loading = true;
  saving = false;
  step = 1;
  readonly steps = [{ n: 1, label: 'Delivery & items' }, { n: 2, label: 'Notes & proof' }];

  form = this.fb.group({
    receivedDate: [this.now, Validators.required],
    deliveredBy: ['', Validators.required],
    receivedBy: [''],
    remarks: [''],
    rejectReason: [''],
    files: [[] as File[]],
    lines: this.fb.array<FormGroup>([]),
  });

  get subtitle(): string {
    return this.dnNo + (this.clientName ? ' · ' + this.clientName : '');
  }

  get linesArray(): FormArray {
    return this.form.controls.lines as FormArray;
  }

  get lines(): FormGroup[] {
    return (this.form.controls.lines as FormArray).controls as FormGroup[];
  }

  get totalQty(): number {
    return this.lines.reduce((sum, l) => sum + Number(l.value.total || 0), 0);
  }

  get rejectedQty(): number {
    return this.lines.reduce((sum, l) => sum + Number(l.value.rejected || 0), 0);
  }

  get outcome(): string {
    if (this.rejectedQty <= 0) return 'Fully delivered';
    return this.rejectedQty >= this.totalQty ? 'Rejected' : 'Partially delivered and rejected';
  }

  accepted(line: FormGroup): number {
    return Math.max(0, Number(line.value.total || 0) - Number(line.value.rejected || 0));
  }

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
    this.dnService.getDnById(this.id).subscribe({
      next: (res: any) => {
        const dn = res?.data || res;
        const arr = this.form.controls.lines as FormArray;
        (dn?.items || []).forEach((item: any) => {
          const total = Number(item.currentDeliveryQty || item.deliveredQty || 0);
          arr.push(this.fb.group({
            itemId: [item._id || item.itemId],
            partNo: [item.partNo],
            description: [item.description],
            total: [total],
            rejected: [0, [Validators.min(0), Validators.max(total)]],
            reason: [''],
          }));
        });
        this.loading = false;
      },
      error: () => {
        this.toaster.error('Failed to load the delivery note');
        this.closed.emit();
      },
    });
  }

  isStepValid(n: number): boolean {
    if (n === 1) {
      const c = this.form.controls;
      return c.receivedDate.valid && c.deliveredBy.valid && this.linesArray.valid;
    }
    return true;
  }

  goToStep(n: number): void {
    if (n > 1 && !this.isStepValid(1)) {
      this.form.markAllAsTouched();
      this.toaster.warning('Complete the delivery details and item quantities first');
      this.step = 1;
      return;
    }
    this.step = n;
  }

  submit(): void {
    if (this.saving) return;
    if (this.step === 1) {
      this.goToStep(2);
      return;
    }
    const needsReason = this.rejectedQty > 0 && !this.form.value.rejectReason?.trim();
    if (this.form.invalid || needsReason) {
      this.form.controls.rejectReason.setErrors(needsReason ? { required: true } : null);
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const rejections = this.lines
      .filter((l) => Number(l.value.rejected) > 0)
      .map((l) => ({ itemId: l.value.itemId, rejectedQty: Number(l.value.rejected), reason: l.value.reason?.trim() || undefined }));

    this.saving = true;
    const reject$: Observable<any> = rejections.length
      ? this.dnService.rejectDnItems(this.id, { items: rejections, reason: v.rejectReason!.trim() })
      : of(null);
    this.dnService.confirmDelivery(this.id, {
      receivedDate: new Date(v.receivedDate!).toISOString(),
      deliveredBy: v.deliveredBy!,
      receivedBy: v.receivedBy?.trim() || undefined,
      remarks: v.remarks?.trim() || undefined,
    }, v.files || []).pipe(switchMap(() => reject$)).subscribe({
      next: (res) => {
        (res?.warnings || []).forEach((w: string) => this.toaster.warning(w));
        this.toaster.success(`${this.dnNo} ${this.outcome.toLowerCase()}`);
        this.saved.emit();
      },
      error: (err) => {
        this.toaster.error(err.error?.message || 'Failed to record the delivery');
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
