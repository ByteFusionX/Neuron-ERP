import { CommonModule } from '@angular/common';
import { Component, DestroyRef, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { take } from 'rxjs';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { JobService } from 'src/app/core/services/job/job.service';
import { ProformaInvoice, ProformaInvoicePayload, ProformaInvoiceService, ProformaSummary } from 'src/app/core/services/proforma-invoice.service';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { SmartFormModule } from 'src/app/shared/components/smart-form';
import { allocateStatus, getJob } from 'src/app/shared/interfaces/job.interface';

const SUMMARY_KEYS = ['itemsCost', 'itemsPrice', 'supplierDiscount', 'customerDiscount', 'additionalCost', 'totalCost', 'totalPrice'] as const;

const round2 = (value: number) => Math.round((Number(value) || 0) * 100) / 100;

/** Cost summary of the deal: selected lines, supplier/customer discounts and every additional cost. Same maths as the deal sheet. */
export function piSummaryFromJob(job: getJob): ProformaSummary {
  const deal: any = (job.quotation as any)?.dealData ?? {};
  let itemsCost = 0;
  let itemsPrice = 0;
  for (const item of deal.updatedItems ?? []) {
    for (const d of item.itemDetails ?? []) {
      if (!d.dealSelected) continue;
      const qty = Number(d.quantity) || 0;
      itemsCost += (Number(d.unitCost) || 0) * qty;
      itemsPrice += (Number(d.unitSellingPrice) || 0) * qty;
    }
  }
  let supplierDiscount = 0;
  let customerDiscount = Number(deal.totalDiscount) || 0;
  let additionalCost = 0;
  for (const c of deal.additionalCosts ?? []) {
    const v = Number(c.value) || 0;
    if (c.type === 'Customer Discount') customerDiscount += v;
    else if (c.type === 'Supplier Discount') supplierDiscount += v;
    else additionalCost += v;
  }
  return {
    itemsCost: round2(itemsCost), itemsPrice: round2(itemsPrice), supplierDiscount: round2(supplierDiscount),
    customerDiscount: round2(customerDiscount), additionalCost: round2(additionalCost),
    totalCost: round2(itemsCost - supplierDiscount + additionalCost), totalPrice: round2(itemsPrice - customerDiscount),
  };
}

/** Values a job contributes to a new PI: client block, header fields and the deal sheet's selected lines. */
export function piDefaultsFromJob(job: getJob) {
  const anyJob: any = job;
  const quotation: any = job.quotation;
  const attention = anyJob.attention;
  return {
    client: { customerId: anyJob.clientDetails?._id as string | undefined, name: (anyJob.clientDetails?.companyName || '') as string },
    attention: [attention?.courtesyTitle, attention?.firstName, attention?.lastName].filter(Boolean).join(' '),
    paymentTerms: (quotation?.dealData?.paymentTerms || quotation?.paymentTerms || '') as string,
    shipTo: (quotation?.deliveryLocation || anyJob.clientDetails?.companyName || '') as string,
    lpoNo: (quotation?.customerAcceptance?.customerPoNumber || '') as string,
    subject: (quotation?.subject || '') as string,
    currency: (quotation?.currency || 'QAR') as string,
    quoteCompany: (quotation?.quoteCompany || '') as string,
    items: ((quotation?.dealData?.updatedItems ?? []) as any[]).flatMap((item) =>
      (item.itemDetails ?? [])
        .filter((d: any) => d.dealSelected)
        .map((d: any) => ({ description: d.detail || '', quantity: Number(d.quantity) || 0, unitPrice: Number(d.unitSellingPrice) || 0 })),
    ),
  };
}

@Component({
  selector: 'app-pi-form-drawer',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, SmartFormModule, ActionButtonComponent],
  templateUrl: './pi-form-drawer.component.html',
})
export class PiFormDrawerComponent implements OnInit, OnChanges {
  @Input() open = false;
  /** Pre-selects this job (Create PI from a row). Ignored when editing. */
  @Input() job: getJob | null = null;
  /** The PI being edited; null creates a new one. */
  @Input() pi: ProformaInvoice | null = null;
  @Output() saved = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();

  private readonly fb = inject(FormBuilder);
  private readonly jobService = inject(JobService);
  private readonly employeeService = inject(EmployeeService);
  private readonly piService = inject(ProformaInvoiceService);
  private readonly notificationService = inject(ToastrService);
  private readonly destroyRef = inject(DestroyRef);

  readonly saving = signal(false);
  readonly jobs = signal<getJob[]>([]);
  readonly jobOptions = computed(() => this.jobs().map((j) => ({ label: `${j.jobId} · ${(j as any).clientDetails?.companyName || '-'}`, value: j._id })));
  readonly currency = signal('QAR');
  /** True while the form is patched from code, so the job handler doesn't overwrite what was just loaded. */
  private patching = false;
  /** Sum of the hidden item lines; the PI amount the PDF prints. */
  private itemsTotal = 0;
  private customerId: string | undefined;
  private quoteCompany = '';

  readonly form: FormGroup = this.fb.group({
    piNo: [''],
    job: [null as string | null, [Validators.required]],
    clientName: ['', [Validators.required]],
    attention: [''],
    paymentTerms: ['', [Validators.required]],
    shipTo: [''],
    lpoNo: [''],
    subject: [''],
    items: this.fb.array([]),
    itemsCost: [{ value: 0, disabled: true }],
    itemsPrice: [{ value: 0, disabled: true }],
    supplierDiscount: [{ value: 0, disabled: true }],
    customerDiscount: [{ value: 0, disabled: true }],
    additionalCost: [{ value: 0, disabled: true }],
    totalCost: [{ value: 0, disabled: true }],
    totalPrice: [{ value: 0, disabled: true }],
    expectedAmount: [0, [Validators.required, Validators.min(0)]],
    expectedDate: ['', [Validators.required]],
  });

  /** Read-only deal cost figures shown in the banner above the form. */
  summaryStats(): { label: string; value: number; strong?: boolean }[] {
    const v = this.form.getRawValue();
    return [
      { label: 'Items Cost', value: v.itemsCost },
      { label: 'Items Selling Price', value: v.itemsPrice },
      { label: 'Additional Costs', value: v.additionalCost },
      { label: 'Supplier Discount', value: v.supplierDiscount },
      { label: 'Customer Discount', value: v.customerDiscount },
      { label: 'Total Cost', value: v.totalCost, strong: true },
      { label: 'Total Price', value: v.totalPrice, strong: true },
    ];
  }

  get f() { return this.form.controls; }
  get items() { return this.form.get('items') as FormArray; }
  get drawerTitle(): string { return this.pi ? `Edit ${this.pi.piNo}` : 'Create Proforma Invoice'; }
  get drawerSubtitle(): string {
    return this.pi ? 'Saving keeps the current status' : 'Saving creates it as Pending';
  }

  ngOnInit(): void {
    this.f['job'].valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((id) => {
      if (this.patching || !id) return;
      const job = this.jobs().find((j) => j._id === id);
      if (job) this.applyJob(job);
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['open'] || !this.open) return;
    this.reset();
    if (this.pi) this.loadPi(this.pi);
    else {
      this.loadJobs();
      this.piService.nextNumber().pipe(take(1)).subscribe({
        next: (res) => this.f['piNo'].setValue(res.data?.piNo ?? '', { emitEvent: false }),
        error: () => undefined,
      });
      if (this.job) this.selectJob(this.job);
    }
  }

  cancel(): void {
    this.closed.emit();
  }

  addItem(item: { description?: string; quantity?: number; unitPrice?: number } = {}): void {
    const group = this.fb.group({
      description: [item.description ?? '', [Validators.required]],
      quantity: [item.quantity ?? 1, [Validators.required, Validators.min(0.0001)]],
      unitPrice: [item.unitPrice ?? 0, [Validators.required, Validators.min(0)]],
      amount: [{ value: 0, disabled: true }],
    });
    group.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.recalculate());
    this.items.push(group);
    this.recalculate();
  }

  removeItem(index: number): void {
    this.items.removeAt(index);
    this.items.markAsDirty();
    this.recalculate();
  }

  private recalculate(): void {
    let total = 0;
    this.items.controls.forEach((group) => {
      const amount = round2((Number(group.get('quantity')?.value) || 0) * (Number(group.get('unitPrice')?.value) || 0));
      group.get('amount')?.setValue(amount, { emitEvent: false });
      total += amount;
    });
    this.itemsTotal = round2(total);
  }

  private reset(): void {
    this.patching = true;
    try {
      this.form.reset({ piNo: '', job: null, clientName: '', attention: '', paymentTerms: '', shipTo: '', lpoNo: '', subject: '', itemsCost: 0, itemsPrice: 0, supplierDiscount: 0, customerDiscount: 0, additionalCost: 0, totalCost: 0, totalPrice: 0, expectedAmount: 0, expectedDate: '' });
      this.items.clear();
      this.currency.set('QAR');
      this.customerId = undefined;
      this.quoteCompany = '';
      this.f['job'].enable({ emitEvent: false });
      this.form.markAsPristine();
    } finally {
      this.patching = false;
    }
  }

  private loadJobs(): void {
    this.employeeService.employeeData$.pipe(take(1)).subscribe((employee) => {
      this.jobService.getJobs({
        search: '', page: 1, row: 200, status: null,
        access: employee?.category?.privileges?.jobSheet?.viewReport,
        userId: employee?._id,
        allocateStatuses: [allocateStatus.Pending, allocateStatus.OpenToWork, allocateStatus.WorkInProgress, allocateStatus.OnHold],
      }).subscribe({
        next: (data) => {
          const list = data?.job ?? [];
          // Keep the preselected job in the options even if the list didn't include it.
          const selected = this.job;
          this.jobs.set(selected && !list.some((j) => j._id === selected._id) ? [selected, ...list] : list);
        },
        error: () => this.notificationService.error('Failed to load jobs'),
      });
    });
  }

  private selectJob(job: getJob): void {
    if (!this.jobs().some((j) => j._id === job._id)) this.jobs.set([job, ...this.jobs()]);
    this.patching = true;
    try { this.f['job'].setValue(job._id); } finally { this.patching = false; }
    this.applyJob(job);
  }

  private applyJob(job: getJob): void {
    const d = piDefaultsFromJob(job);
    this.customerId = d.client.customerId;
    this.currency.set(d.currency);
    this.quoteCompany = d.quoteCompany;
    this.patching = true;
    try {
      this.form.patchValue({ clientName: d.client.name, attention: d.attention, paymentTerms: d.paymentTerms, shipTo: d.shipTo, lpoNo: d.lpoNo, subject: d.subject });
      const summary = piSummaryFromJob(job);
      this.form.patchValue({ ...summary, expectedAmount: summary.totalPrice });
      this.items.clear();
      d.items.forEach((item) => this.addItem(item));
    } finally {
      this.patching = false;
    }
    this.form.markAsDirty();
  }

  private loadPi(pi: ProformaInvoice): void {
    this.patching = true;
    try {
      this.customerId = pi.client?.customerId;
      this.currency.set(pi.currency || 'QAR');
      this.quoteCompany = pi.quoteCompany || '';
      this.jobs.set([{ _id: pi.job, jobId: pi.jobId, clientDetails: { companyName: pi.client?.name } } as any]);
      this.form.patchValue({
        piNo: pi.piNo, job: pi.job, clientName: pi.client?.name, attention: pi.attention, paymentTerms: pi.paymentTerms,
        shipTo: pi.shipTo, lpoNo: pi.lpoNo, subject: pi.subject,
      });
      this.f['job'].disable({ emitEvent: false });
      const summary = pi.summary ?? { itemsCost: 0, itemsPrice: pi.amount, supplierDiscount: 0, customerDiscount: 0, additionalCost: 0, totalCost: 0, totalPrice: pi.amount };
      this.form.patchValue({ ...summary, expectedAmount: pi.expectedAmount ?? summary.totalPrice, expectedDate: pi.expectedDate ? String(pi.expectedDate).slice(0, 10) : '' });
      pi.items.forEach((item) => this.addItem(item));
    } finally {
      this.patching = false;
    }
    this.form.markAsPristine();
  }

  onSubmit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this.notificationService.error('Please fill all required fields');
      return;
    }
    if (!this.items.length) {
      this.notificationService.error('This job has no deal sheet lines to bill');
      return;
    }
    const v = this.form.getRawValue();
    const payload: ProformaInvoicePayload = {
      job: v.job,
      client: { customerId: this.customerId, name: v.clientName },
      attention: v.attention, paymentTerms: v.paymentTerms, shipTo: v.shipTo, lpoNo: v.lpoNo, subject: v.subject,
      currency: this.currency(),
      quoteCompany: this.quoteCompany,
      summary: Object.fromEntries(SUMMARY_KEYS.map((k) => [k, Number(v[k]) || 0])) as unknown as ProformaSummary,
      expectedAmount: Number(v.expectedAmount) || 0,
      expectedDate: v.expectedDate,
      items: v.items.map((i: any) => ({ description: i.description, quantity: Number(i.quantity), unitPrice: Number(i.unitPrice) })),
    };
    this.saving.set(true);
    const request = this.pi ? this.piService.update(this.pi._id, payload) : this.piService.create(payload);
    request.subscribe({
      next: (res) => {
        this.saving.set(false);
        this.notificationService.success(this.pi ? 'Proforma invoice updated' : `Proforma invoice ${res.data?.piNo || ''} created`);
        this.form.markAsPristine();
        this.saved.emit();
      },
      error: (err) => {
        this.saving.set(false);
        this.notificationService.error(err?.error?.message || 'Failed to save the proforma invoice');
      },
    });
  }
}
