import { Component, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { DeliveryNoteService } from 'src/app/core/services/delivery-note/delivery-note.service';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { SmartFormModule } from 'src/app/shared/components/smart-form';
import { PodItemEntryComponent } from '../pod-item-entry/pod-item-entry.component';

/**
 * Returns goods from a delivered DN, fully or partially. Lists the DN's lines; the user enters a rejected qty
 * (and a reason) per line. Returned stock goes to quarantine server-side and the DN becomes Rejected or Partially Rejected.
 */
@Component({
  selector: 'app-return-dn-drawer',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, SmartFormModule, ActionButtonComponent, PodItemEntryComponent],
  template: `
    <app-sf-drawer [open]="true" title="Return delivery" [subtitle]="subtitle" width="min(1400px, 96vw)" [dirty]="form.dirty" (closed)="!saving && closed.emit()">
      <form id="return-dn-form" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <div *ngIf="dn" class="mb-5 rounded-xl border border-gray-200 bg-white p-3 dark:border-erp-border-dark dark:bg-erp-surface-dark">
          <div class="mb-2 flex items-center justify-between gap-2">
            <span class="text-sm font-semibold text-gray-900 dark:text-gray-100">{{ dn.dnNo }}</span>
            <span *ngIf="dn.status" class="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-200">{{ dn.status }}</span>
          </div>
          <dl class="grid grid-cols-3 gap-x-4 gap-y-2 text-xs">
            <ng-container *ngFor="let d of details">
              <div class="min-w-0">
                <dt class="text-gray-500">{{ d.label }}</dt>
                <dd class="truncate font-medium text-gray-900 dark:text-gray-100" [title]="d.value">{{ d.value }}</dd>
              </div>
            </ng-container>
          </dl>
        </div>

        <section class="mb-5">
          <div class="mb-2">
            <h3 class="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">Items</h3>
          </div>
          <p *ngIf="loading" class="text-sm text-gray-500">Loading items…</p>
          <p *ngIf="!loading" class="mb-2 text-xs text-gray-500">Total is the quantity still returnable; enter the quantity being sent back on each line.</p>
          <app-pod-item-entry *ngIf="!loading" [items]="linesArray" [title]="'DN ' + dnNo"></app-pod-item-entry>
          <p *ngIf="submitted && !returnedQty" class="mt-2 text-xs text-red-600">Enter a rejected qty on at least one line.</p>
          <p *ngIf="submitted && needsReason" class="mt-2 text-xs text-red-600">Enter a reason on every returned line.</p>
        </section>
      </form>
      <ng-container sfDrawerFooter>
        <app-action-button variant="secondary" (click)="closed.emit()" [disabled]="saving">Cancel</app-action-button>
        <app-action-button variant="primary" type="submit" form="return-dn-form" [disabled]="saving || loading">
          {{ saving ? 'Returning...' : 'Return' + (returnedQty ? ' ' + returnedQty + ' item' + (returnedQty === 1 ? '' : 's') : '') }}
        </app-action-button>
      </ng-container>
    </app-sf-drawer>
  `,
})
export class ReturnDnDrawerComponent implements OnInit {
  @Input({ required: true }) id!: string;
  @Input() dnNo = '';
  @Input() clientName?: string;
  @Output() closed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<void>();

  private readonly fb = inject(FormBuilder);
  private readonly dnService = inject(DeliveryNoteService);
  private readonly toaster = inject(ToastrService);

  loading = true;
  saving = false;
  submitted = false;

  form = this.fb.group({
    lines: this.fb.array<FormGroup>([]),
  });

  dn: any = null;

  /** Label/value pairs for the details banner; empty values are skipped. */
  get details(): { label: string; value: string; wide?: boolean }[] {
    const dn = this.dn;
    if (!dn) return [];
    const fmt = (d: any) => (d ? new Date(d).toLocaleDateString('en-GB') : '');
    const rows = [
      { label: 'Client', value: dn.clientName, wide: true },
      { label: 'Job No', value: dn.jobId?.jobId || dn.job?.jobId },
      { label: 'Invoice No', value: dn.invoiceNo },
      { label: 'DN Date', value: fmt(dn.dnDate) },
      { label: 'Customer LPO', value: dn.customerLpoNumber },
      { label: 'Dispatched', value: fmt(dn.dispatchedAt) },
      { label: 'Delivered', value: fmt(dn.pod?.receivedDate) },
      { label: 'Received by', value: dn.pod?.receivedBy },
      { label: 'Subject', value: dn.subject, wide: true },
    ];
    return rows.filter((r) => !!r.value) as { label: string; value: string; wide?: boolean }[];
  }

  get subtitle(): string {
    return this.dnNo + (this.clientName ? ' · ' + this.clientName : '');
  }

  get linesArray(): FormArray {
    return this.form.controls.lines as FormArray;
  }

  get lines(): FormGroup[] {
    return this.linesArray.controls as FormGroup[];
  }

  get returnedQty(): number {
    return this.lines.reduce((sum, l) => sum + Number(l.value.rejected || 0), 0);
  }

  /** Every returned line needs its own reason (the server requires one per item). */
  get needsReason(): boolean {
    return this.lines.some((l) => Number(l.value.rejected) > 0 && !String(l.value.reason || '').trim());
  }

  ngOnInit(): void {
    this.dnService.getDnById(this.id).subscribe({
      next: (res: any) => {
        const dn = res?.data || res;
        this.dn = dn;
        (dn?.items || []).forEach((item: any) => {
          const delivered = Number(item.currentDeliveryQty || item.deliveredQty || 0);
          const returnable = Math.max(0, delivered - Number(item.rejectedQty || 0));
          const group = this.fb.group({
            itemId: [item._id || item.itemId],
            partNo: [item.partNo],
            description: [item.description],
            total: [returnable],
            rejected: [0, [Validators.min(0), Validators.max(returnable)]],
            reason: [''],
          });
          // A reason is required as soon as a rejected qty is entered.
          group.controls.rejected.valueChanges.subscribe((qty) => {
            const reason = group.controls.reason;
            if (Number(qty) > 0) reason.addValidators(Validators.required);
            else reason.removeValidators(Validators.required);
            reason.updateValueAndValidity({ emitEvent: false });
          });
          this.linesArray.push(group);
        });
        this.loading = false;
      },
      error: () => {
        this.toaster.error('Failed to load the delivery note');
        this.closed.emit();
      },
    });
  }

  submit(): void {
    if (this.saving) return;
    this.submitted = true;
    if (this.form.invalid || !this.returnedQty || this.needsReason) {
      this.form.markAllAsTouched();
      return;
    }
    const items = this.lines
      .filter((l) => Number(l.value.rejected) > 0)
      .map((l) => ({ itemId: l.value.itemId, rejectedQty: Number(l.value.rejected), reason: l.value.reason?.trim() || undefined }));
    this.saving = true;
    this.dnService.rejectDnItems(this.id, { items }).subscribe({
      next: (res) => {
        (res?.warnings || []).forEach((w: string) => this.toaster.warning(w));
        this.toaster.success(`${this.dnNo} return recorded; stock moved to quarantine`);
        this.saved.emit();
      },
      error: (err) => {
        this.toaster.error(err.error?.message || 'Failed to record the return');
        this.saving = false;
      },
    });
  }
}
