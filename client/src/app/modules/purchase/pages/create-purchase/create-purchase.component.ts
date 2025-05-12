import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
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
  itemsList: any;

  isSubmitted = signal<boolean>(false);
  jobSheets = signal<getJob[]>([]);
  selectedJobSheet!: getJob;
  requestedJobId = signal<string>('')

  purchaseForm: FormGroup = this.fb.group({
    customer: ['', [Validators.required]],
    salesManager: ['', [Validators.required]],
    prno: ['', [Validators.required]],
    jobId: ['', [Validators.required]],
    dealSheetId: ['', [Validators.required]],
    items: this.fb.array([this.createQuoteItemGroup()])
  })


  ngOnInit(): void {
    this.generatedPRId = this.generateId()
    this.purchaseService.selectedJob$.subscribe((job) => {
      if (job) {
        this.requestedJobId.set(job._id)
        this.patchValues(job)
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
    console.log(this.selectedJobSheet)
    this.purchaseForm.patchValue({
      customer: job?.clientDetails.companyName,
      salesManager: job?.salesPersonDetails[0].firstName + ' ' + job?.salesPersonDetails[0].lastName,
      prno: this.generateId(),
      dealSheetId: job?.quotation?.dealData?.dealId,
      items: job.quotation?.dealData?.updatedItems,
    })
    console.log(this.purchaseForm.value)
  }

  generateId(): string {
    const now = new Date();
    const year = now.getFullYear().toString().slice(-2);
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    return `NRN/PR-${year}-${month}-${this.prSequence}`;
  }

  onSupplierClicks() {
    this.router.navigate(['/purchase/supplier-discount'])
  }

  onMrRequestClicks() {
    this._dialog.open(MrRequestComponent, {
      width: '550px'
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
