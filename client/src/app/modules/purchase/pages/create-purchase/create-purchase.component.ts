import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ResizableComponent } from '../../../../shared/components/resizable/resizable.component';
import { NgOptionComponent, NgSelectComponent } from '@ng-select/ng-select';
import { Router } from '@angular/router';
import { PurchaseService } from 'src/app/core/services/purchase/purchase.service';
import { MatDialog } from '@angular/material/dialog';
import { MrRequestComponent } from '../mr-request/mr-request.component';
import { FormFieldComponent } from 'src/app/shared/components/forms/form-field/form-field.component';
import { SelectDropdownComponent } from 'src/app/shared/components/forms/select-dropdown/select-dropdown.component';
import { getJob } from 'src/app/shared/interfaces/job.interface';
import { JobService } from 'src/app/core/services/job/job.service';
import { NumberFormatterPipe } from 'src/app/shared/pipes/numFormatter.pipe';

@Component({
  selector: 'app-create-purchase',
  imports: [
    ReactiveFormsModule,
    FormsModule,
    CommonModule,
    ResizableComponent,
    NgSelectComponent,
    NgOptionComponent,
    FormFieldComponent,
    SelectDropdownComponent,
    NumberFormatterPipe
  ],
  templateUrl: './create-purchase.component.html',
  styleUrl: './create-purchase.component.css',
})
export class CreatePurchaseComponent implements OnInit {
  private fb = inject(FormBuilder);
  private _dialog = inject(MatDialog)
  private router = inject(Router)

  private purchaseService = inject(PurchaseService)
  private jobService = inject(JobService)

  generatedPRId: string = '';
  prSequence: string = '0001'

  purchaseJobData!: any;

  itemsList = signal<any[]>([])
  isSubmitted = signal<boolean>(false);
  jobSheets = signal<getJob[]>([]);
  selectedJobSheet!: getJob;
  requestedJobId = signal<string>('')

  purchaseForm: FormGroup = this.fb.group({
    customer: ['', [Validators.required]],
    salesManager: ['', [Validators.required]],
    prNo: ['', [Validators.required]],
    jobId: ['', [Validators.required]],
    dealSheetId: ['', [Validators.required]],
    items: this.fb.array([this.createQuoteItemGroup()]),
    totalLpo: ['', [Validators.required]]
  })


  ngOnInit(): void {
    this.purchaseForm.reset()
    this.generatedPRId = this.generateId()
    this.purchaseService.selectedJob$.subscribe((job) => {
      if (job) {
        this.selectedJobSheet = job
        this.requestedJobId.set(job._id)
        this.patchValues(job)
      }
    })

    this.purchaseService.purchaseFormData$.subscribe((data) => {
      if (data) {
        this.itemsList.set(data.items)
        this.purchaseForm.patchValue({
          customer: data.customer,
          salesManager: data.salesManager,
          prNo: data.prNo,
          jobId: data.jobId,
          dealSheetId: data.dealSheetId,
          items: data.items,
          totalLpo: data.totalLpo,
        })
      }
    })
    this.deelSheets()
  }

  createQuoteItemDetailGroup(): FormGroup {
    return this.fb.group({
      detail: ['', Validators.required],
      quantity: [0, [Validators.required, Validators.min(1)]],
      unitCost: [0, [Validators.required, Validators.min(0)]],
      profit: [0, [Validators.required, Validators.min(0)]],
      availability: ['', Validators.required],
      supplierName: [''],
      email: ['', [Validators.email]],
      phoneNo: [''],
      dealSelected: [false],
    });
  }

  createQuoteItemGroup(): FormGroup {
    return this.fb.group({
      itemName: ['', Validators.required],
      itemDetails: this.fb.array([
        this.createQuoteItemDetailGroup()
      ])
    });
  }

  patchValues(job: getJob) {
    this.selectedJobSheet = job
    this.purchaseForm.patchValue({
      customer: job?.clientDetails?.companyName,
      salesManager: `${job?.salesPersonDetails?.[0]?.firstName || ''} ${job?.salesPersonDetails?.[0]?.lastName || ''}`.trim(),
      prNo: this.generateId(),
      dealSheetId: job?.quotation?.dealData?.dealId,
      jobId: job.jobId
    })

    this.itemsList.set(job.quotation?.dealData?.updatedItems)
    const itemsFormArray = this.purchaseForm.get('items') as FormArray;
    itemsFormArray.clear();
    const updatedItems = job?.quotation?.dealData?.updatedItems || [];
    updatedItems.forEach(item => {
      itemsFormArray.push(this.createItemGroup(item));
    });
  }

  createItemGroup(item: any): FormGroup {
    return this.fb.group({
      itemName: [item?.itemName || '', Validators.required],
      itemDetails: this.fb.array(
        (item?.itemDetails || []).map((detail: any) => this.createItemDetailsGroup(detail))
      )
    });
  }

  createItemDetailsGroup(item: any): FormGroup {
    return this.fb.group({
      detail: [item.detail || '', Validators.required],
      quantity: [item.quantity || 0, Validators.required],
      unitCost: [item.unitCost || 0, Validators.required],
      profit: [item.profit || 0, Validators.required],
      availability: [item.availability || '', Validators.required],
      supplierName: [item.supplierName || ''],
      email: [item.email || ''],
      phoneNo: [item.phoneNo || ''],
      dealSelected: [item.dealSelected || false],
    });
  }

  purchaseItems(items: any) {
    return items.map((item: any) => item)
  }

  generateId(): string {
    const now = new Date();
    const year = now.getFullYear().toString().slice(-2);
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    return `NRN/PR-${year}-${month}-${this.prSequence}`;
  }

  onSupplierClicks() {
    if (this.selectedJobSheet) {
      this.purchaseService.setPurchaseJob(this.purchaseForm.value)
      this.router.navigate(['/purchase/supplier-discount'])
    }
  }

  onMrRequestClicks() {
    this._dialog.open(MrRequestComponent, {
      width: '550px',
      data: { job: this.selectedJobSheet || this.jobSheets() }
    })
  }

  deelSheets() {
    this.jobService.getJobids().subscribe({
      next: (res: any) => {
        this.jobSheets.set(res.jobs)
      }, error: (err) => {
        console.error(err)
      }
    })
  }

  onJobSelected(selected: string | string[]) {
    this.purchaseForm.reset()
    const job = <getJob>this.jobSheets().find(job => job._id === selected);
    this.patchValues(job);
  }

  onSubmit(): void {

  }

  get f() {
    return this.purchaseForm.controls;
  }
}
