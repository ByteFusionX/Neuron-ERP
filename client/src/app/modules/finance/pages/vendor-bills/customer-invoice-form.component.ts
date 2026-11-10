import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { SmartFormModule } from 'src/app/shared/components/smart-form';
import { CustomerInvoiceService } from 'src/app/core/services/customer-invoice.service';
import { DeliveryNoteService } from 'src/app/core/services/delivery-note/delivery-note.service';
import { InvoiceItemEntryComponent, InvoiceLine } from './invoice-item-entry.component';

import { DEFAULT_CURRENCY } from '../../../../shared/constants/currency';
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
  /** When set (with `dn`), the form edits this existing invoice instead of creating one. */
  @Input() invoice: any;
  get editing(): boolean { return !!this.invoice?._id; }
  @Output() closed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<any>();
  private readonly service = inject(CustomerInvoiceService);
  private readonly fb = inject(FormBuilder);
  private readonly dnService = inject(DeliveryNoteService);
  private quote: any = {};
  private client: any = {};

  readonly paymentMethodOptions = ['PDC', 'Cash', 'Bank Transfer', 'Open Credit'].map(value => ({ label: value, value }));
  jobNo = '-';
  readonly stepLabels = ['Invoice details', 'Items'];
  step = 1;
  get totalQty(): number { return this.invoiceLines.reduce((sum, l) => sum + l.qty, 0); }
  next(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid || !this.form.controls.clientName.value.trim()) { this.error = 'Enter the client and invoice date.'; return; }
    this.error = '';
    this.step = 2;
  }
  goToStep(n: number): void { if (n === 2) this.next(); else this.step = 1; }

  private get source(): any { return this.dn || this.po || {}; }
  get currency(): string { return this.source.currency || DEFAULT_CURRENCY; }
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
    if (this.editing && this.dn?.items?.length) {
      // Every DN line is offered; the ones already on the invoice start ticked.
      const billed = (this.invoice.items || []).map((i: any) => `${i.description}|${Number(i.unitCost || 0)}|${Number(i.quantity || 0)}`);
      return this.dn.items.map((item: any, index: number) => {
        const qty = Math.max(0, Number(item.currentDeliveryQty || 0) - Number(item.rejectedQty || 0));
        const unitPrice = Number(item.unitSellingPrice || 0);
        return {
          description: item.description, partNo: item.partNo, qty, unitPrice, amount: round(qty * unitPrice), index,
          included: qty > 0 && billed.includes(`${item.description}|${unitPrice}|${qty}`),
        };
      });
    }
    if (this.editing) {
      return (this.invoice.items || []).map((item: any) => ({
        description: item.description, qty: Number(item.quantity || 0), unitPrice: Number(item.unitCost || 0), amount: Number(item.totalCost || 0),
      }));
    }
    if (this.dn) {
      return (this.dn.items || []).map((item: any, index: number) => {
        const qty = Math.max(0, Number(item.currentDeliveryQty || 0) - Number(item.rejectedQty || 0));
        const unitPrice = Number(item.unitSellingPrice || 0);
        return { description: item.description, partNo: item.partNo, qty, unitPrice, amount: round(qty * unitPrice), index, included: qty > 0 };
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
  /** Lines can be ticked whenever the invoice is raised from a delivery note. */
  get selectable(): boolean { return !!this.dn && this.invoiceLines.some(l => l.index !== undefined); }
  get dnPrice(): number {
    const billed = this.selectable ? this.invoiceLines.filter(l => l.included !== false) : this.invoiceLines;
    return Math.round(billed.reduce((sum, l) => sum + l.amount, 0) * 100) / 100;
  }
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
    this.loadJobItems();
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
    if (this.editing) {
      const inv = this.invoice;
      this.form.patchValue({
        clientName: inv.client?.name || this.form.controls.clientName.value,
        attention: inv.attention || '',
        invoiceDate: inv.invoiceDate ? String(inv.invoiceDate).slice(0, 10) : this.form.controls.invoiceDate.value,
        invoiceNo: inv.invoiceNo || '',
        lpoRef: inv.lpoRef || '',
        subject: inv.subject || '',
        paymentTerms: inv.paymentTerms || '',
        paymentMethod: inv.paymentMethod || '',
      });
    }
  }
  /** Lists every item of the job (like the DN drawer); the ones not on this DN are shown muted and can't be billed. */
  private loadJobItems(): void {
    const jobId = this.dn?.jobId?._id || this.dn?.jobId;
    if (!this.dn || !jobId || typeof jobId !== 'string') return;
    this.dnService.getDnItemsForJob(jobId, this.invoice?._id).subscribe({
      next: (res: any) => {
        const jobItems: any[] = res?.data || [];
        if (!jobItems.length) return;
        const dnLines = this.invoiceLines;
        const used = new Set<number>();
        const merged: InvoiceLine[] = jobItems.map(ji => {
          const pos = (this.dn.items || []).findIndex((di: any, i: number) => !used.has(i) && String(di.itemId) === String(ji._id));
          if (pos >= 0) {
            used.add(pos);
            const line = dnLines.find(l => l.index === pos) || dnLines[pos];
            if (ji.invoiced && !line.included) { line.muted = true; line.note = 'Already invoiced'; }
            return line;
          }
          const note = ji.invoiced ? 'Already invoiced' : !ji.isAvailable ? (ji.unavailableReason || 'Not received yet') : 'Received - not on this delivery note';
          const qty = Number(ji.orderedQty ?? ji.totalQuantity ?? 0);
          const unitPrice = Number(ji.unitSellingPrice || 0);
          return { description: ji.detail || '', partNo: ji.partNo?.partNo || ji.partNo, qty, unitPrice, amount: Math.round(qty * unitPrice * 100) / 100, included: false, outside: true, muted: !!ji.invoiced || !ji.isAvailable, note };
        });
        // Keep any DN line that didn't match a job item.
        dnLines.forEach(l => { if (!merged.includes(l)) merged.push(l); });
        this.invoiceLines = merged;
      },
    });
  }
  saving = false;
  error = '';
  save(): void {
    if (this.saving) return;
    if (this.step === 1) { this.next(); return; }
    this.form.markAllAsTouched();
    const v = this.form.getRawValue();
    if (this.form.invalid || !v.clientName.trim()) {
      this.error = 'Enter the client and invoice date.';
      return;
    }
    const itemIndexes = this.selectable ? this.invoiceLines.filter(l => l.included !== false && l.qty > 0).map(l => l.index) : undefined;
    if (itemIndexes && !itemIndexes.length) { this.error = 'Select at least one item to invoice.'; return; }
    this.saving = true;
    this.error = '';
    const origin = this.dn ? { deliveryNote: this.dn._id } : { purchaseOrder: this.po._id };
    const payload = { ...v, ...origin, ...(itemIndexes ? { itemIndexes } : {}), client: { name: v.clientName, customerId: this.client._id } };
    const request = this.editing ? this.service.update(this.invoice._id, payload) : this.service.create(payload);
    request.subscribe({
      next: response => this.saved.emit(response.data),
      error: error => {
        this.error = error.error?.message || (this.editing ? 'Failed to update invoice' : 'Failed to create invoice');
        this.saving = false;
      },
    });
  }
}
