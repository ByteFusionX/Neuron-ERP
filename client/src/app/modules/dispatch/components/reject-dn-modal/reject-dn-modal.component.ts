import { Component, Inject, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { ToastrService } from 'ngx-toastr';
import { DeliveryNoteService } from 'src/app/core/services/delivery-note/delivery-note.service';
import { ModalFooterButton, ModalLayoutComponent } from 'src/app/shared/components/modal-layout/modal-layout.component';
import { SmartFormModule } from 'src/app/shared/components/smart-form';

export interface RejectDnData {
  id: string;
  dnNo: string;
  clientName?: string;
}

/**
 * Customer rejection of a dispatched or delivered DN. Each line takes a qty up to what's still
 * rejectable; rejected stock goes back to quarantine server-side and the DN becomes Rejected or Partially Rejected.
 */
@Component({
  selector: 'app-reject-dn-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ModalLayoutComponent, SmartFormModule],
  template: `
    <app-modal-layout title="Reject delivery" [subtitle]="data.dnNo + (data.clientName ? ' · ' + data.clientName : '')"
      [onClose]="cancel.bind(this)" [footerButtons]="footerButtons">
      <form [formGroup]="form" class="flex flex-col gap-4 p-4" novalidate>
        <p *ngIf="loading" class="text-sm text-gray-500">Loading lines…</p>
        <div *ngIf="!loading" class="flex items-center justify-between">
          <p class="text-xs text-gray-500">Enter the quantity the customer refused on each line.</p>
          <button type="button" (click)="rejectAll()" class="text-xs font-medium text-red-600 hover:underline">Reject everything</button>
        </div>

        <div *ngIf="!loading" class="divide-y divide-gray-100 rounded-xl border border-gray-200 dark:divide-erp-border-dark dark:border-erp-border-dark" formArrayName="lines">
          <div *ngFor="let line of lines; let i = index" [formGroupName]="i" class="flex items-center gap-3 px-3 py-2">
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm text-gray-900 dark:text-gray-100" [title]="line.value.description">{{ line.value.description || '-' }}</p>
              <p class="text-[11px] text-gray-500">
                Delivered {{ line.value.delivered }}<span *ngIf="line.value.alreadyRejected"> · {{ line.value.alreadyRejected }} already rejected</span>
              </p>
            </div>
            <app-sf-number class="w-28" formControlName="qty" [min]="0" [max]="line.value.max" [stepper]="false" placeholder="0"
              [attr.aria-label]="'Reject qty for ' + line.value.description"></app-sf-number>
          </div>
        </div>
        <p *ngIf="submitted && !hasQty" class="text-xs text-red-600">Enter a reject qty on at least one line.</p>

        <app-sf-field label="Reason" required [control]="form.controls.reason" [messages]="{ required: 'Say why the customer rejected it' }">
          <app-sf-textarea formControlName="reason" placeholder="e.g. Damaged on arrival, wrong model"></app-sf-textarea>
        </app-sf-field>
      </form>
    </app-modal-layout>
  `,
})
export class RejectDnModalComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly dnService = inject(DeliveryNoteService);
  private readonly toaster = inject(ToastrService);

  loading = true;
  saving = false;
  submitted = false;

  form = this.fb.group({
    lines: this.fb.array<FormGroup>([]),
    reason: ['', Validators.required],
  });

  constructor(
    private dialogRef: MatDialogRef<RejectDnModalComponent, boolean>,
    @Inject(MAT_DIALOG_DATA) public data: RejectDnData,
  ) {}

  get lines(): FormGroup[] {
    return (this.form.controls.lines as FormArray).controls as FormGroup[];
  }

  get hasQty(): boolean {
    return this.lines.some((l) => Number(l.value.qty) > 0);
  }

  ngOnInit(): void {
    this.dnService.getDnById(this.data.id).subscribe({
      next: (res: any) => {
        const dn = res?.data || res;
        const arr = this.form.controls.lines as FormArray;
        (dn?.items || []).forEach((item: any) => {
          const delivered = Number(item.currentDeliveryQty || item.deliveredQty || 0);
          const alreadyRejected = Number(item.rejectedQty || 0);
          const max = Math.max(0, delivered - alreadyRejected);
          arr.push(this.fb.group({
            itemId: [item._id || item.itemId],
            description: [item.description],
            delivered: [delivered],
            alreadyRejected: [alreadyRejected],
            max: [max],
            qty: [0, [Validators.min(0), Validators.max(max)]],
          }));
        });
        this.loading = false;
      },
      error: () => {
        this.toaster.error('Failed to load the delivery note');
        this.dialogRef.close(false);
      },
    });
  }

  get footerButtons(): ModalFooterButton[] {
    return [
      { label: 'Cancel', theme: 'cancel', onClick: () => this.cancel(), disabled: this.saving },
      { label: 'Reject', theme: 'danger', onClick: () => this.confirm(), loading: this.saving, disabled: this.loading },
    ] as ModalFooterButton[];
  }

  rejectAll(): void {
    this.lines.forEach((l) => l.patchValue({ qty: l.value.max }));
  }

  cancel(): void {
    this.dialogRef.close(false);
  }

  confirm(): void {
    if (this.saving) return;
    this.submitted = true;
    if (this.form.invalid || !this.hasQty) {
      this.form.markAllAsTouched();
      return;
    }
    const reason = this.form.value.reason!.trim();
    const items = this.lines
      .filter((l) => Number(l.value.qty) > 0)
      .map((l) => ({ itemId: l.value.itemId, rejectedQty: Number(l.value.qty) }));
    this.saving = true;
    this.dnService.rejectDnItems(this.data.id, { items, reason }).subscribe({
      next: (res) => {
        (res?.warnings || []).forEach((w: string) => this.toaster.warning(w));
        this.toaster.success(`${this.data.dnNo} rejection recorded`);
        this.dialogRef.close(true);
      },
      error: (err) => {
        this.toaster.error(err.error?.message || 'Failed to reject the delivery note');
        this.saving = false;
      },
    });
  }
}
