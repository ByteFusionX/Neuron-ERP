import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { NgSelectModule } from '@ng-select/ng-select';

import { InvoiceService } from 'src/app/core/services/invoice.service';
import { JobService } from 'src/app/core/services/job/job.service';
import { DeliveryNoteService } from 'src/app/core/services/delivery-note/delivery-note.service';
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

  // Signals
  isLoading = signal<boolean>(false);
  isSubmitted = signal<boolean>(false);
  isEditMode = signal<boolean>(false);
  editInvoiceId = signal<string | null>(null);
  editInvoiceCustomerId = signal<string | null>(null);
  jobs = signal<getJob[]>([]);
  deliveryNotes = signal<DeliveryNote[]>([]);

  invoiceForm: FormGroup = this.fb.group({
    date: [new Date().toISOString().split('T')[0], [Validators.required]],
    invoiceNo: [{ value: '', disabled: true }, [Validators.required]],
    jobId: [null, [Validators.required]],
    dnNos: [[], [Validators.required]], // Multi-select
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

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.isEditMode.set(true);
      this.editInvoiceId.set(id);
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

            // Assuming invoice.items contains dnId to reselect DNs
            const selectedDnIds = [...new Set(invoice.items.map((i: any) => i.dnId).filter(Boolean))];

            this.invoiceForm.patchValue({
              date: new Date(invoice.date).toISOString().split('T')[0],
              invoiceNo: invoice.invoiceNo,
              jobId: jobId,
              dnNos: selectedDnIds,
              customerName: customerName,
              paymentTerms: invoice.paymentTerms || '',
              amountFigures: invoice.amount,
              amountWords: convertNumberToWords(invoice.amount) + ' QAR Only'
            });

            // Populate items
            this.itemsFormArray.clear();
            invoice.items.forEach((item: any) => {
              const qty = item.quantity || 0;
              const total = item.amount || 0;
              const unitPrice = qty ? total / qty : 0; // Reverse engineer unit price if not explicitly stored

              let orderedQty = 0;
              let deliveredQty = 0;
              if (item.dnId) {
                const dn = this.allDeliveryNotes().find((d: any) => d._id === item.dnId);
                if (dn && dn.items) {
                  const dnItem = dn.items.find(di => di.description === item.description);
                  if (dnItem) {
                    orderedQty = dnItem.orderedQty || 0;
                    deliveredQty = dnItem.deliveredQty || 0;
                  }
                }
              }

              const formGroup = this.fb.group({
                dnId: [item.dnId], // Track source DN
                description: [item.description || '', Validators.required],
                totalQuantity: [{ value: orderedQty, disabled: true }],
                balanceQuantity: [{ value: orderedQty - deliveredQty, disabled: true }],
                quantity: [qty, [Validators.required, Validators.min(0)]],
                unitPrice: [unitPrice, [Validators.required, Validators.min(0)]],
                totalPrice: [{ value: total, disabled: true }]
              });

              formGroup.valueChanges.subscribe(() => {
                this.updateRowTotal(formGroup);
                this.calculateTotals();
              });

              this.itemsFormArray.push(formGroup);
            });

            this.isLoading.set(false);
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

  onDnSelect(selectedDns: DeliveryNote[]) {
    this.itemsFormArray.clear();

    if (!selectedDns || selectedDns.length === 0) {
      this.calculateTotals();
      return;
    }

    // Aggregate items from selected DNs
    selectedDns.forEach(dn => {
      if (dn.items) {
        dn.items.forEach(item => {

          const unitSellingPrice = (item as any).unitSellingPrice ?? 0;
          const qty = item.currentDeliveryQty || 0;
          const orderedQty = item.orderedQty || 0;
          const deliveredQty = item.deliveredQty || 0;

          const formGroup = this.fb.group({
            dnId: [dn._id], // Track source DN
            description: [item.description || '', Validators.required],
            totalQuantity: [{ value: orderedQty, disabled: true }],
            balanceQuantity: [{ value: orderedQty - deliveredQty, disabled: true }],
            quantity: [qty, [Validators.required, Validators.min(0)]],
            unitPrice: [unitSellingPrice, [Validators.required, Validators.min(0)]],
            totalPrice: [{ value: qty * unitSellingPrice, disabled: true }]
          });

          // Listen to changes for calculation
          formGroup.valueChanges.subscribe(() => {
            this.updateRowTotal(formGroup);
            this.calculateTotals();
          });

          this.itemsFormArray.push(formGroup);
        });
      }
    });

    // Initialize grand total immediately after loading items
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
      grandTotal += control.get('totalPrice')?.value || 0;
    });

    this.invoiceForm.patchValue({
      amountFigures: grandTotal,
      amountWords: convertNumberToWords(grandTotal) + ' QAR Only'
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
      status: this.isEditMode() ? undefined : 'Unpaid',
      items: formVal.items.map((item: any) => ({
        dnId: item.dnId,
        description: item.description,
        amount: item.totalPrice,
        quantity: item.quantity
      })),
      paymentTerms: this.invoiceForm.get('paymentTerms')?.value
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
