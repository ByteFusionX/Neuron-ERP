import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { SmartFormModule } from 'src/app/shared/components/smart-form';
import { CustomerInvoiceService } from 'src/app/core/services/customer-invoice.service';
import { InvoiceItemEntryComponent, InvoiceLine } from './invoice-item-entry.component';

@Component({
  selector: 'app-customer-invoice-form', standalone: true,
  imports: [CommonModule, ReactiveFormsModule, SmartFormModule, ActionButtonComponent, InvoiceItemEntryComponent],
  templateUrl: './customer-invoice-form.component.html',
})
export class CustomerInvoiceFormComponent implements OnInit {
  /** Billed from an approved purchase order (finance's Customer Bills page). */
  @Input() po: any;
  /** Billed from a delivery note (prepared by GET /customer-invoice/delivery-note/:id). */
  @Input() dn: any;
  @Output() closed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<any>();
  private readonly service = inject(CustomerInvoiceService);
  private readonly fb = inject(FormBuilder);
  private quote: any = {};
  private client: any = {};

  readonly paymentMethodOptions = ['PDC', 'Cash', 'Bank Transfer', 'Open Credit'].map(value => ({ label: value, value }));
  jobNo = '-';

  private get source(): any { return this.dn || this.po || {}; }
  get currency(): string { return this.source.currency || 'QAR'; }
  get lineCount(): number { return (this.source.items || []).length; }
  get sourceLabel(): string { return this.dn ? 'delivery note' : 'purchase order'; }
  get drawerSubtitle(): string {
    const ref = this.dn ? this.dn.dnNo : this.po.poNo;
    return [ref, this.po?.supplierId?.supplierName, 'Job ' + this.jobNo].filter(Boolean).join(' · ');
  }
  /** Billable lines: a DN bills what was accepted; a PO bills its ordered lines. */
  invoiceLines: InvoiceLine[] = [];
  private buildLines(): InvoiceLine[] {
    const round = (n: number) => Math.round(n * 100) / 100;
    if (this.dn) {
      return (this.dn.items || []).map((item: any) => {
        const qty = Math.max(0, Number(item.currentDeliveryQty || 0) - Number(item.rejectedQty || 0));
        const unitPrice = Number(item.unitSellingPrice || 0);
        return { description: item.description, partNo: item.partNo, qty, unitPrice, amount: round(qty * unitPrice) };
      });
    }
    return (this.po?.items || []).map((item: any) => ({
      description: item.description || item.detail,
      partNo: item.partNo,
      qty: Number(item.quantity || 0),
      unitPrice: Number(item.unitCost || 0),
      amount: Number(item.totalCost || 0),
    }));
  }
  /** Job totals (deal price and customer discount) are only known for a delivery note. */
  get jobTotals(): { price: number; discount: number } | null { return this.dn?.jobTotals || null; }
  get dnPrice(): number { return Math.round(this.invoiceLines.reduce((sum, l) => sum + l.amount, 0) * 100) / 100; }
  /** The DN's share of the job discount, in proportion to its share of the job price. */
  get dnDiscount(): number {
    const job = this.jobTotals;
    if (!job || !job.price) return 0;
    return Math.round(Math.min(job.discount * this.dnPrice / job.price, job.discount) * 100) / 100;
  }
  get jobNet(): number { return Math.round(((this.jobTotals?.price || 0) - (this.jobTotals?.discount || 0)) * 100) / 100; }
  get dnNet(): number { return Math.round((this.dnPrice - this.dnDiscount) * 100) / 100; }
  readonly form =this.fb.nonNullable.group({
    clientName: ['', Validators.required],
    attention: [''],
    invoiceDate: [new Date().toLocaleDateString('en-CA'), Validators.required],
    invoiceNo: [''], jobNo: [''], dnNo: [''],
    lpoRef: [''],
    subject: [''],
    paymentTerms: [''],
    paymentMethod: [''],
  });
  ngOnInit(): void {
    const src = this.source;
    this.invoiceLines = this.buildLines();
    this.quote = src.jobId?.quoteId || src.purchaseId?.jobId?.quoteId || src.quoteId || {};
    this.client = this.quote.client || {};
    const attention = this.quote.attention || {};
    this.jobNo = src.jobId?.jobId || src.purchaseId?.jobId?.jobId || '-';
    this.form.patchValue({
      clientName: this.client.companyName || src.clientName || '',
      attention: [attention.courtesyTitle, attention.firstName, attention.lastName].filter(Boolean).join(' '),
      invoiceNo: src.nextInvoiceNo || '',
      jobNo: this.jobNo,
      dnNo: this.dn?.dnNo || '',
      lpoRef: this.quote.customerAcceptance?.customerPoNumber || src.customerLpoNumber || '',
      subject: this.quote.subject || src.subject || '',
      paymentTerms: this.quote.dealData?.paymentTerms || this.quote.paymentTerms || src.paymentTerms || '',
    });
  }
  saving = false;
  error = '';
  save(): void {
    if (this.saving) return;
    this.form.markAllAsTouched();
    const v = this.form.getRawValue();
    if (this.form.invalid || !v.clientName.trim()) {
      this.error = 'Enter the client and invoice date.';
      return;
    }
    this.saving = true;
    this.error = '';
    const origin = this.dn ? { deliveryNote: this.dn._id } : { purchaseOrder: this.po._id };
    this.service.create({ ...v, ...origin, client: { name: v.clientName, customerId: this.client._id } }).subscribe({
      next: response => this.saved.emit(response.data),
      error: error => {
        this.error = error.error?.message || 'Failed to create invoice';
        this.saving = false;
      },
    });
  }
}
