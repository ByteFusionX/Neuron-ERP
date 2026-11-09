import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { CustomerInvoiceService } from 'src/app/core/services/customer-invoice.service';
import { PAYMENT_METHODS, ProformaInvoice } from 'src/app/core/services/proforma-invoice.service';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { InvoiceItemEntryComponent, InvoiceLine } from '../../vendor-bills/invoice-item-entry.component';
import { SmartFormModule } from 'src/app/shared/components/smart-form';
import { SfOption } from 'src/app/shared/components/smart-form/sf.model';

/**
 * Raises the invoice for a proforma whose payment is received, in the same drawer layout as Create PI.
 * Everything comes from the PI; the received date and method start from what was entered when it moved to Received.
 */
@Component({
  selector: 'app-pi-invoice-drawer',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, SmartFormModule, ActionButtonComponent, InvoiceItemEntryComponent],
  templateUrl: './pi-invoice-drawer.component.html',
})
export class PiInvoiceDrawerComponent implements OnChanges {
  @Input() open = false;
  @Input() pi: ProformaInvoice | null = null;
  @Output() saved = new EventEmitter<any>();
  @Output() closed = new EventEmitter<void>();

  private readonly fb = inject(FormBuilder);
  private readonly service = inject(CustomerInvoiceService);
  private readonly notificationService = inject(ToastrService);

  readonly saving = signal(false);
  readonly methodOptions: SfOption<string>[] = PAYMENT_METHODS.filter((m) => m !== ('PDF' as string)).map((m) => ({ label: m, value: m }));

  readonly form = this.fb.nonNullable.group({
    piNo: [''],
    jobId: [''],
    clientName: ['', Validators.required],
    attention: [''],
    paymentTerms: [''],
    shipTo: [''],
    lpoRef: [''],
    subject: [''],
    invoiceDate: ['', Validators.required],
    expectedAmount: [0],
    expectedDate: [''],
    receivedAmount: [0, [Validators.required, Validators.min(0)]],
    receivedDate: ['', Validators.required],
    paymentMethod: ['', Validators.required],
  });

  readonly stepLabels = ['Invoice details', 'Items'];
  step = 1;
  lines: InvoiceLine[] = [];

  next(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) { this.notificationService.error('Please fill all required fields'); return; }
    this.step = 2;
  }
  goToStep(n: number): void { if (n === 2) this.next(); else this.step = 1; }

  get f() { return this.form.controls; }
  get currency(): string { return this.pi?.currency || 'QAR'; }
  get discount(): number { return this.pi?.summary?.customerDiscount || 0; }
  get net(): number { return Math.max(0, (this.pi?.amount || 0) - this.discount); }

  /** Read-only figures shown in the summary banner below the items. */
  private statsCache: { key: string; stats: { label: string; value: number; right?: boolean }[] } | null = null;
  summaryStats(): { label: string; value: number; right?: boolean }[] {
    const total = Number(this.pi?.summary?.totalPrice ?? this.pi?.amount ?? 0);
    const discount = this.discount;
    const net = Math.max(0, total - discount);
    const received = Number(this.form.controls.receivedAmount.value) || 0;
    const key = `${total}|${discount}|${received}`;
    // Stable reference between change detections so the child input does not re-fire.
    if (this.statsCache?.key !== key) {
      this.statsCache = { key, stats: [
        { label: 'Total Price', value: total },
        { label: 'Discount', value: discount },
        { label: 'Net Total', value: net },
        { label: 'Received', value: received, right: true },
        { label: 'Balance', value: Math.round((net - received) * 100) / 100, right: true },
      ] };
    }
    return this.statsCache.stats;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['open'] || !this.open || !this.pi) return;
    const pi = this.pi;
    const paid = pi.payment;
    const today = new Date().toLocaleDateString('en-CA');
    this.form.reset({
      piNo: pi.piNo, jobId: pi.jobId, clientName: pi.client?.name || '', attention: pi.attention || '',
      paymentTerms: pi.paymentTerms || '', shipTo: pi.shipTo || '', lpoRef: pi.lpoNo || '', subject: pi.subject || '',
      invoiceDate: today,
      expectedAmount: pi.expectedAmount || this.net,
      expectedDate: pi.expectedDate ? String(pi.expectedDate).slice(0, 10) : '',
      receivedAmount: pi.expectedAmount || this.net,
      // Prefilled from the Received status update.
      receivedDate: paid?.receivedAt ? String(paid.receivedAt).slice(0, 10) : today,
      paymentMethod: paid?.method && paid.method !== 'PDF' ? paid.method : '',
    });
    this.lines = (pi.items || []).map((i: any) => ({
      description: i.description, partNo: i.partNo, qty: Number(i.quantity) || 0, unitPrice: Number(i.unitPrice) || 0,
      amount: i.amount ?? (Number(i.quantity) || 0) * (Number(i.unitPrice) || 0),
    }));
    this.saving.set(false);
    this.step = 1;
  }

  cancel(): void { this.closed.emit(); }

  onSubmit(): void {
    const pi = this.pi;
    if (!pi || this.saving()) return;
    if (this.step === 1) { this.next(); return; }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.notificationService.error('Please fill all required fields');
      return;
    }
    const v = this.form.getRawValue();
    this.saving.set(true);
    this.service.create({
      proformaInvoice: pi._id,
      client: { name: v.clientName, customerId: pi.client?.customerId },
      attention: v.attention, invoiceDate: v.invoiceDate, invoiceNo: '', dnNo: '',
      lpoRef: v.lpoRef, subject: v.subject, paymentTerms: v.paymentTerms, paymentMethod: v.paymentMethod,
      receivedAmount: Number(v.receivedAmount), receivedDate: v.receivedDate,
    }).subscribe({
      next: (res) => {
        this.saving.set(false);
        this.form.markAsPristine();
        this.saved.emit(res?.data);
      },
      error: (err) => {
        this.saving.set(false);
        this.notificationService.error(err?.error?.message || 'Failed to create the invoice');
      },
    });
  }
}
