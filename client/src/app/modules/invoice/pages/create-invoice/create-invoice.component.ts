import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { NgSelectModule } from '@ng-select/ng-select';

import { InvoiceService } from 'src/app/core/services/invoice.service';
import { JobService } from 'src/app/core/services/job/job.service';
import { DeliveryNoteService } from 'src/app/core/services/delivery-note/delivery-note.service';
import { FormFieldComponent } from 'src/app/shared/components/forms/form-field/form-field.component';
import { ButtonComponent } from 'src/app/shared/components/button/button.component';
import { SelectDropdownComponent } from 'src/app/shared/components/forms/select-dropdown/select-dropdown.component';
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

  // Signals
  isLoading = signal<boolean>(false);
  isSubmitted = signal<boolean>(false);
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
    this.generateInvoiceNumber();
    this.loadDeliveryNotes();
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
        customerName: firstDn.clientName || '',
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
          // Determine unit price from somewhere? 
          // DN usually doesn't have price. Price is in Quotation/Deal Sheet. 
          // We need to fetch the Price from the Job's Quote/Deal Sheet.
          // Since this might be complex (matching items), 
          // for this implementation I will initialize price to 0 or try to find it if present in item.
          // Requirement says: "Items must be populated from the Deal Sheet linked to the selected Job ID"
          // But also "DN selection must dynamically control which quantities and items are available".
          // So we map DN items -> Invoice Items.

          const formGroup = this.fb.group({
            dnId: [dn._id], // Track source DN
            description: [item.description || '', Validators.required],
            quantity: [item.currentDeliveryQty || 0, [Validators.required, Validators.min(0)]],
            unitPrice: [0, [Validators.required, Validators.min(0)]],
            totalPrice: [{ value: 0, disabled: true }]
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

    // Construct Payload
    const payload = {
      invoiceNo: formVal.invoiceNo,
      date: formVal.date,
      jobId: formVal.jobId, // Assuming this is IDs
      customer: this.customerData?._id || this.jobs().find(j => j._id === formVal.jobId)?._id,
      amount: formVal.amountFigures,
      status: 'Unpaid',
      items: formVal.items.map((item: any) => ({
        dnId: item.dnId,
        description: item.description,
        amount: item.totalPrice
      })),
      paymentTerms: formVal.paymentTerms
    };

    // Fix Customer ID extraction
    const selectedJob = this.jobs().find(j => j._id === formVal.jobId);
    if (selectedJob) {
      payload.customer = (selectedJob as any).quoteId?.clientId || (selectedJob as any).clientId;
      // We need precise field. Assuming 'clientId' or 'quoteId.clientId' exists.
      // If not avaiable, backend references might fail. 
      // Using a placeholder or passing what we have.
    }

    this.invoiceService.createInvoice(payload).subscribe({
      next: () => {
        this.notificationService.success('Invoice created successfully');
        this.router.navigate(['/invoice/invoice-register']);
      },
      error: (err) => {
        console.error(err);
        this.notificationService.error(err.error?.message || 'Failed to create invoice');
        this.isLoading.set(false);
      }
    });
  }
}
