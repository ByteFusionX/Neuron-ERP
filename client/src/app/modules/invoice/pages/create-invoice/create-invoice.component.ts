import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { NgSelectModule } from '@ng-select/ng-select';

import { InvoiceService } from 'src/app/core/services/invoice.service';
import { JobService } from 'src/app/core/services/job/job.service';
import { DeliveryNoteService } from 'src/app/core/services/delivery-note/delivery-note.service';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { FormFieldComponent } from 'src/app/shared/components/forms/form-field/form-field.component';
import { ButtonComponent } from 'src/app/shared/components/button/button.component';
import { SelectDropdownComponent } from 'src/app/shared/components/forms/select-dropdown/select-dropdown.component';
import { Invoice } from 'src/app/shared/interfaces/invoice.interface';
import { getJob } from 'src/app/shared/interfaces/job.interface';
import { DeliveryNote } from 'src/app/shared/interfaces/delivery-note.interface';
import { convertNumberToWords } from 'src/app/shared/utils/number.utils';

@Component({
  selector: 'app-create-invoice',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterModule,
    SelectDropdownComponent,
    FormFieldComponent,
    ButtonComponent
  ],
  templateUrl: './create-invoice.component.html',
  styleUrl: './create-invoice.component.css'
})
export class CreateInvoiceComponent implements OnInit {
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private invoiceService = inject(InvoiceService);
  private jobService = inject(JobService);
  private dnService = inject(DeliveryNoteService);
  private notificationService = inject(ToastrService);
  private route = inject(ActivatedRoute);
  private employeeService = inject(EmployeeService);

  // Signals
  isLoading = signal<boolean>(false);
  isSubmitted = signal<boolean>(false);
  isEditMode = signal<boolean>(false);
  isReissueMode = signal<boolean>(false);
  editInvoiceId = signal<string | null>(null);
  editInvoiceCustomerId = signal<string | null>(null);
  jobs = signal<getJob[]>([]);
  deliveryNotes = signal<DeliveryNote[]>([]);
  selectedJob: any = null;
  pendingDeliveryItems: any[] = [];
  dnInvoiceSummary: Record<string, { deliveredQty: number; invoicedQty: number; balanceQty: number }> = {};

  invoiceForm: FormGroup = this.fb.group({
    date: [new Date().toISOString().split('T')[0], [Validators.required]],
    invoiceNo: [{ value: '', disabled: true }, [Validators.required]],
    jobId: [null, [Validators.required]],
    dnNos: [[], [Validators.required]],
    itemSource: ['delivery-note', [Validators.required]],
    customerName: [{ value: '', disabled: true }, [Validators.required]],
    customerLpo: [{ value: '', disabled: true }],
    paymentTerms: ['', [Validators.required]],
    items: this.fb.array([]),
    amountWords: [{ value: '', disabled: true }],
    amountFigures: [{ value: 0, disabled: true }]
  });

  customerData: any = null; // Store full customer object if needed for submission

  // Store all fetched DNs to filter locally
  allDeliveryNotes = signal<DeliveryNote[]>([]);
  itemInvoicedTotals: Record<string, number> = {};
  reissueInvoiceNo: string | null = null;
  currency = signal<string>('QAR');

  ngOnInit(): void {
    this.employeeService.employeeData$.subscribe(emp => {
      if (emp && emp.category && emp.category.privileges) {
        if (!emp.category.privileges.invoice?.createInvoice) {
          this.notificationService.error('You do not have permission to create or edit Invoices');
          this.router.navigate(['/invoice/invoice-register']);
          return;
        }
      }
    });

    const routePath = this.route.snapshot.routeConfig?.path || '';
    const id = this.route.snapshot.paramMap.get('id');

    if (routePath.includes('edit') && id) {
      this.isEditMode.set(true);
      this.editInvoiceId.set(id);
      this.loadInvoiceForEdit(id);
    } else if (routePath.includes('reissue') && id) {
      this.isReissueMode.set(true);
      this.editInvoiceId.set(id);
      const nav = this.router.getCurrentNavigation();
      const reissueNo = nav?.extras?.state?.['reissueInvoiceNo'];
      if (reissueNo) {
        this.reissueInvoiceNo = reissueNo;
      }
      this.loadInvoiceForEdit(id);
    } else {
      this.generateInvoiceNumber();
      this.loadDeliveryNotes();
    }
  }

  loadInvoiceForEdit(id: string) {
    this.isLoading.set(true);
    // ensure DNs are loaded to populate dropdowns correctly first
    this.dnService.getAllDeliveryNotes({ page: 1, row: 1000 }).subscribe({
      next: (res) => {
        const dns = res.dns || [];
        this.allDeliveryNotes.set(dns);

        const uniqueJobsMap = new Map<string, any>();
        dns.forEach((dn: DeliveryNote) => {
          if (dn.job && typeof dn.job === 'object') {
            uniqueJobsMap.set(dn.job._id, dn.job);
          } else if (dn.jobId && typeof dn.jobId === 'object') {
            uniqueJobsMap.set((dn.jobId as any)._id, dn.jobId);
          }
        });
        this.jobs.set(Array.from(uniqueJobsMap.values()));

        this.invoiceService.getInvoiceById(id).subscribe({
          next: (invRes) => {
            const invoice = invRes.data;
            const jobId = (invoice.jobId as any)?._id || invoice.jobId;
            const customerObj = invoice.customer as any;
            const customerName = customerObj?.companyName || customerObj?.clientName || '';

            if (customerObj && customerObj._id) {
              this.editInvoiceCustomerId.set(customerObj._id);
            }

            // Filter DNs for this Job to populate the DN dropdown
            const jobDns = this.allDeliveryNotes().filter(dn => {
              const dnJobId = (dn.job as any)?._id || (dn.jobId as any)?._id || dn.jobId;
              return dnJobId === jobId;
            });
            this.deliveryNotes.set(jobDns);

            const job = this.jobs().find(j => j._id === jobId);
            let customerLpo = '';
            if (jobDns.length > 0) {
              customerLpo = jobDns[0].customerLpoNumber || '';
            }
            if (!customerLpo && job) {
              customerLpo = (job as any).purchaseNo || (job as any).lpoNumber || '';
            }

            const selectedDnIds = [
              ...new Set(
                invoice.items
                  .flatMap((i: any) => {
                    if (Array.isArray(i.dnRefs) && i.dnRefs.length > 0) {
                      return i.dnRefs.map((r: any) => r.dnId).filter(Boolean);
                    }
                    return i.dnId ? [i.dnId] : [];
                  })
                  .filter(Boolean)
              )
            ];

            this.invoiceForm.patchValue({
              date: new Date(invoice.date).toISOString().split('T')[0],
              invoiceNo: invoice.invoiceNo,
              jobId: jobId,
              dnNos: selectedDnIds,
              itemSource: 'delivery-note',
              customerName: customerName,
              customerLpo: customerLpo,
              paymentTerms: invoice.paymentTerms || '',
              amountFigures: invoice.amount,
              amountWords: convertNumberToWords(invoice.amount) + ` ${this.currency()} Only`
            });

            this.jobService.getOneJob(jobId as string).subscribe({
              next: (jobData: any) => {
                const fullJob = Array.isArray(jobData) ? jobData[0] : jobData;
                const c = fullJob?.quotation?.currency;
                this.currency.set(c || 'QAR');
              },
              error: () => this.currency.set('QAR')
            });

            if (this.isReissueMode()) {
              const newNo = this.reissueInvoiceNo || `${invoice.invoiceNo}R`;
              this.invoiceForm.patchValue({ invoiceNo: newNo });
            }

            this.loadItemInvoicedTotals(jobId as string, invoice._id).then(() => {
              this.itemsFormArray.clear();
              invoice.items.forEach((item: any) => {
                const qty = item.quantity || 0;
                const total = item.amount || 0;
                const unitPrice = qty ? Math.round((total / qty) * 100) / 100 : 0;

                const dnRefs = Array.isArray(item.dnRefs) && item.dnRefs.length > 0
                  ? item.dnRefs
                  : (item.dnId
                    ? [{ dnId: item.dnId, quantity: qty }]
                    : []);

                let orderedQty = 0;
                const dnInfoParts: string[] = [];

                dnRefs.forEach((ref: any) => {
                  const dn = this.allDeliveryNotes().find((d: any) => d._id === ref.dnId);
                  if (!dn || !dn.items) {
                    return;
                  }
                  const dnItem = dn.items.find((di: any) => {
                    if (item.itemId && di.itemId) {
                      return di.itemId === item.itemId;
                    }
                    return di.description === item.description;
                  });
                  if (!dnItem) {
                    return;
                  }
                  const dnOrdered = dnItem.orderedQty || 0;
                  if (dnOrdered > orderedQty) {
                    orderedQty = dnOrdered;
                  }
                  const dnNo = dn.dnNo || '';
                  const slNo = dnItem.slNo || '';
                  const refQty = ref.quantity || 0;
                  const partLabel = [dnNo, slNo ? `(Sl ${slNo}` : '', refQty ? (slNo ? `, Qty ${refQty})` : `(Qty ${refQty})`) : (slNo ? ')' : '')]
                    .filter(p => p)
                    .join(' ');
                  dnInfoParts.push(partLabel);
                });

              const key = item.itemId || item.description;
              const alreadyInvoiced = this.itemInvoicedTotals[key] || 0;
              const balanceQty = Math.max(0, orderedQty - alreadyInvoiced);
              const isSelectable = balanceQty > 0;
              const safeQty = isSelectable ? Math.min(qty, balanceQty) : 0;
              const safeTotal = safeQty * unitPrice;
              const dnInfo = dnInfoParts.join(', ');

              const formGroup = this.fb.group({
                selected: [{ value: isSelectable, disabled: !isSelectable }],
                dnId: [dnRefs.length === 1 ? dnRefs[0].dnId : item.dnId || null],
                dnRefs: [dnRefs],
                itemId: [item.itemId || null],
                description: [item.description || '', Validators.required],
                totalQuantity: [{ value: orderedQty, disabled: true }],
                invoicedQuantity: [{ value: alreadyInvoiced, disabled: true }],
                balanceQuantity: [{ value: balanceQty, disabled: true }],
                quantity: [safeQty, [Validators.required, Validators.min(0), Validators.max(balanceQty)]],
                unitPrice: [unitPrice, [Validators.required, Validators.min(0)]],
                totalPrice: [{ value: safeTotal, disabled: true }],
                dnInfo: [{ value: dnInfo, disabled: true }]
              });

                formGroup.valueChanges.subscribe(() => {
                  this.updateRowTotal(formGroup);
                  this.calculateTotals();
                });

                this.itemsFormArray.push(formGroup);
              });

              this.isLoading.set(false);
            });

          },
          error: () => {
            this.notificationService.error('Failed to load invoice for editing');
            this.isLoading.set(false);
            this.router.navigate(['/invoice/invoice-register']);
          }
        });
      },
      error: () => {
        this.notificationService.error('Failed to load requisite data');
        this.isLoading.set(false);
      }
    });

  }

  get f() { return this.invoiceForm.controls; }
  get itemsFormArray() { return this.invoiceForm.get('items') as FormArray; }
  get itemSource() { return this.invoiceForm.get('itemSource')?.value; }

  generateInvoiceNumber() {
    this.invoiceService.generateInvoiceNumber().subscribe({
      next: (res) => {
        if (res.success) {
          this.invoiceForm.patchValue({ invoiceNo: res.invoiceNo });
        }
      },
      error: () => this.notificationService.error('Failed to generate Invoice Number')
    });
  }

  loadDeliveryNotes() {
    // Fetch all Delivery Notes first
    // Params might need adjustment based on API capability to fetch 'all pending'
    this.dnService.getAllDeliveryNotes({ page: 1, row: 1000 }).subscribe({
      next: (res) => {
        const dns = res.dns || [];
        this.allDeliveryNotes.set(dns);

        // Extract Unique Jobs from DNs
        // Assuming DN has populated 'job' field or jobId
        // We will create a list of unique jobs found in these DNs
        const uniqueJobsMap = new Map<string, any>();
        dns.forEach((dn: DeliveryNote) => {
          if (dn.job && typeof dn.job === 'object') {
            uniqueJobsMap.set(dn.job._id, dn.job); // Assuming dn.job is populated
          } else if (dn.jobId && typeof dn.jobId === 'object') {
            uniqueJobsMap.set((dn.jobId as any)._id, dn.jobId);
          }
          // Fallback if not populated? We might need to fetch jobs separately if DN only has ID.
          // Service getAllDeliveryNotes usually populates job.
        });

        this.jobs.set(Array.from(uniqueJobsMap.values()));
      },
      error: (err) => {
        console.error('Error loading DNs', err);
        this.notificationService.error('Failed to load Delivery Notes');
      }
    });
  }

  onJobSelect(jobId: string | string[]) {
    // app-select-dropdown emits ID(s). 
    if (!jobId || Array.isArray(jobId)) { // Single select expected
      // If array or empty, likely clear or invalid
      if (Array.isArray(jobId) && jobId.length === 0) {
        this.resetFormAfterJob();
        return;
      }
      // If valid string ID
      if (typeof jobId !== 'string') return;
    }

    const job = this.jobs().find(j => j._id === jobId);

    if (!job) {
      this.resetFormAfterJob();
      return;
    }

    // Filter DNs for this Job
    const jobDns = this.allDeliveryNotes().filter(dn => {
      const dnJobId = (dn.job as any)?._id || (dn.jobId as any)?._id || dn.jobId;
      return dnJobId === job._id;
    });

    this.deliveryNotes.set(jobDns);

    // Auto-patch Customer info from the First DN of this job
    if (jobDns.length > 0) {
      const firstDn = jobDns[0];
      this.invoiceForm.patchValue({
        customerName: (firstDn as any)?.companyName || firstDn?.clientName || '',
        customerLpo: firstDn.customerLpoNumber || '',
        dnNos: [], // Reset selection
        items: []
      });
    } else {
      const clientName = (job as any).quoteId?.clientName || (job as any).clientName || '';
      this.invoiceForm.patchValue({
        customerName: clientName,
        customerLpo: '',
        dnNos: [],
        items: []
      });
    }

    this.itemsFormArray.clear();
    this.loadItemInvoicedTotals(job._id as string, this.isEditMode() ? this.editInvoiceId() || undefined : undefined);
    this.jobService.getOneJob(job._id as string).subscribe({
      next: (jobData: any) => {
        const fullJob = Array.isArray(jobData) ? jobData[0] : jobData;
        const c = fullJob?.quotation?.currency;
        this.currency.set(c || 'QAR');
      },
      error: () => this.currency.set('QAR')
    });
  }

  mapDnIdsToObjects(dnIds: string | string[]): DeliveryNote[] {
    if (!dnIds) return [];
    const ids = Array.isArray(dnIds) ? dnIds : [dnIds];
    return this.deliveryNotes().filter(dn => ids.includes(dn._id));
  }


  resetFormAfterJob() {
    this.invoiceForm.patchValue({
      customerName: '',
      customerLpo: '',
      dnNos: [],
      items: [],
      amountWords: '',
      amountFigures: 0
    });
    this.itemsFormArray.clear();
    this.deliveryNotes.set([]);
  }

  private loadItemInvoicedTotals(jobId: string, excludeInvoiceId?: string): Promise<void> {
    return new Promise(resolve => {
      this.invoiceService.getJobItemInvoicedQty(jobId, excludeInvoiceId).subscribe({
        next: (res) => {
          const map: Record<string, number> = {};
          (res.data || []).forEach((row: any) => {
            const key = row.itemId || row.description;
            map[key] = row.totalInvoicedQty || 0;
          });
          this.itemInvoicedTotals = map;
          resolve();
        },
        error: () => {
          this.itemInvoicedTotals = {};
          resolve();
        }
      });
    });
  }

  onDnSelect(selectedDns: DeliveryNote[]) {
    this.itemsFormArray.clear();

    if (!selectedDns || selectedDns.length === 0) {
      this.calculateTotals();
      return;
    }

    const aggregated = new Map<string, {
      description: string;
      orderedQty: number;
      deliveredQty: number;
      totalCurrentDeliveryQty: number;
      unitSellingPrice: number;
      itemId?: string;
      dnRefs: { dnId: string; dnNo?: string; slNo?: number; quantity: number }[];
    }>();

    selectedDns.forEach(dn => {
      if (!dn.items) {
        return;
      }
      dn.items.forEach(item => {
        const currentQty = item.currentDeliveryQty || 0;
        if (!currentQty) {
          return;
        }
        const key = item.itemId || `${item.partNo || ''}__${item.description || ''}`;
        const existing = aggregated.get(key);
        const unitSellingPrice = (item as any).unitSellingPrice ?? 0;
        const orderedQty = item.orderedQty || 0;
        const deliveredQty = item.deliveredQty || 0;
        if (!existing) {
          aggregated.set(key, {
            description: item.description || '',
            orderedQty,
            deliveredQty,
            totalCurrentDeliveryQty: currentQty,
            unitSellingPrice,
            itemId: item.itemId,
            dnRefs: [{
              dnId: dn._id,
              dnNo: dn.dnNo,
              slNo: item.slNo,
              quantity: currentQty
            }]
          });
        } else {
          if (orderedQty > existing.orderedQty) {
            existing.orderedQty = orderedQty;
          }
          if (deliveredQty > existing.deliveredQty) {
            existing.deliveredQty = deliveredQty;
          }
          existing.totalCurrentDeliveryQty += currentQty;
          if (unitSellingPrice) {
            existing.unitSellingPrice = unitSellingPrice;
          }
          existing.dnRefs.push({
            dnId: dn._id,
            dnNo: dn.dnNo,
            slNo: item.slNo,
            quantity: currentQty
          });
        }
      });
    });

    aggregated.forEach(value => {
      const qty = value.totalCurrentDeliveryQty;
      const key = value.itemId || value.description;
      const alreadyInvoiced = this.itemInvoicedTotals[key] || 0;
      const balance = Math.max(0, value.orderedQty - alreadyInvoiced);
      const isSelectable = balance > 0;
      const safeQty = isSelectable ? Math.min(qty, balance) : 0;
      const total = safeQty * value.unitSellingPrice;
      const dnInfo = value.dnRefs
        .map(ref => {
          const dnNo = ref.dnNo || '';
          const slNo = ref.slNo ? `Sl ${ref.slNo}` : '';
          const qtyLabel = ref.quantity ? `Qty ${ref.quantity}` : '';
          const details = [slNo, qtyLabel].filter(p => p).join(', ');
          return details ? `${dnNo} (${details})` : dnNo;
        })
        .filter(p => p)
        .join(', ');

      const formGroup = this.fb.group({
        selected: [{ value: isSelectable, disabled: !isSelectable }],
        dnId: [value.dnRefs.length === 1 ? value.dnRefs[0].dnId : null],
        dnRefs: [value.dnRefs.map(r => ({ dnId: r.dnId, quantity: r.quantity }))],
        itemId: [value.itemId || null],
        description: [value.description || '', Validators.required],
        totalQuantity: [{ value: value.orderedQty, disabled: true }],
        invoicedQuantity: [{ value: alreadyInvoiced, disabled: true }],
        balanceQuantity: [{ value: balance, disabled: true }],
        quantity: [safeQty, [Validators.required, Validators.min(0), Validators.max(balance)]],
        unitPrice: [value.unitSellingPrice, [Validators.required, Validators.min(0)]],
        totalPrice: [{ value: total, disabled: true }],
        dnInfo: [{ value: dnInfo, disabled: true }]
      });

      formGroup.valueChanges.subscribe(() => {
        this.updateRowTotal(formGroup);
        this.calculateTotals();
      });

      this.itemsFormArray.push(formGroup);
    });

    this.calculateTotals();
  }

  updateRowTotal(group: FormGroup) {
    const qty = group.get('quantity')?.value || 0;
    const price = group.get('unitPrice')?.value || 0;
    const total = qty * price;

    if (group.get('totalPrice')?.value !== total) {
      group.patchValue({ totalPrice: total }, { emitEvent: false });
    }
  }

  calculateTotals() {
    let grandTotal = 0;
    this.itemsFormArray.controls.forEach(control => {
      if (control.get('selected')?.value) {
        grandTotal += control.get('totalPrice')?.value || 0;
      }
    });

    this.invoiceForm.patchValue({
      amountFigures: grandTotal,
      amountWords: convertNumberToWords(grandTotal) + ` ${this.currency()} Only`
    }, { emitEvent: false });
  }

  removeItem(index: number) {
    this.itemsFormArray.removeAt(index);
    this.calculateTotals();
  }

  onSubmit() {
    this.isSubmitted.set(true);
    if (this.invoiceForm.invalid) {
      this.notificationService.error('Please fill all required fields');
      return;
    }

    if (this.itemsFormArray.length === 0) {
      this.notificationService.error('Please add at least one item');
      return;
    }

    this.isLoading.set(true);
    const formVal = this.invoiceForm.getRawValue();
    const selectedItems = (formVal.items || []).filter((item: any) => item.selected);

    if (selectedItems.length === 0) {
      this.notificationService.error('Please select at least one item to invoice');
      this.isLoading.set(false);
      return;
    }

    // Extract Customer ID
    const selectedJob = this.jobs().find(j => j._id === formVal.jobId);
    let customerId = this.customerData?._id;
    if (!customerId && selectedJob) {
      customerId = (selectedJob as any).client || (selectedJob as any).quoteId?.client;
    }

    // Fallback to original customer ID if editing and no new job selection was processed
    if (!customerId && this.isEditMode()) {
      customerId = this.editInvoiceCustomerId();
    }

    // Construct Payload
    const payload = {
      invoiceNo: formVal.invoiceNo,
      date: formVal.date,
      jobId: formVal.jobId, // Assuming this is IDs
      customer: customerId,
      amount: formVal.amountFigures,
      items: selectedItems.map((item: any) => {
        const dnRefs = Array.isArray(item.dnRefs) ? item.dnRefs : [];
        // dnRefs[].quantity is captured from the DN's currentDeliveryQty when the
        // item was loaded, but the user can edit the invoiced "quantity" afterwards.
        // Re-scale each dnRef's quantity so the refs stay in sync with what's
        // actually being invoiced, instead of reporting the original DN snapshot.
        const invoicedQty = item.quantity || 0;
        const dnRefsTotal = dnRefs.reduce((sum: number, r: any) => sum + (r.quantity || 0), 0);
        let allocatedSoFar = 0;
        const normalizedDnRefs = dnRefs.map((r: any, idx: number) => {
          const isLast = idx === dnRefs.length - 1;
          let quantity: number;
          if (dnRefs.length === 1) {
            quantity = invoicedQty;
          } else if (dnRefsTotal > 0) {
            quantity = isLast
              ? invoicedQty - allocatedSoFar
              : Math.round((r.quantity / dnRefsTotal) * invoicedQty);
          } else {
            quantity = 0;
          }
          allocatedSoFar += quantity;
          return { dnId: r.dnId, quantity };
        });
        const singleDnId = item.dnId || (normalizedDnRefs.length === 1 ? normalizedDnRefs[0].dnId : undefined);
        return {
          dnId: singleDnId,
          dnRefs: normalizedDnRefs,
          itemId: item.itemId,
          description: item.description,
          amount: item.totalPrice,
          quantity: item.quantity
        };
      }),
      paymentTerms: this.invoiceForm.get('paymentTerms')?.value,
      parentInvoiceId: this.isReissueMode() ? this.editInvoiceId() || undefined : undefined
    } as Partial<Invoice>;

    const request$ = this.isEditMode()
      ? this.invoiceService.updateInvoice(this.editInvoiceId()!, payload)
      : this.invoiceService.createInvoice(payload);

    request$.subscribe({
      next: () => {
        this.notificationService.success(`Invoice ${this.isEditMode() ? 'updated' : 'created'} successfully`);
        this.router.navigate(['/invoice/invoice-register']);
      },
      error: (err) => {
        console.error(err);
        this.notificationService.error(err.error?.message || `Failed to ${this.isEditMode() ? 'update' : 'create'} invoice`);
        this.isLoading.set(false);
      }
    });
  }
}
