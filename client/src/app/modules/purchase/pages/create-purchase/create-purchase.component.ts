import { CommonModule } from '@angular/common';
import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { AbstractControl, FormArray, FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
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
import { ToastrService } from 'ngx-toastr';
import { Subscription } from 'rxjs';
import { NgIcon } from '@ng-icons/core';
import { MatTooltip } from '@angular/material/tooltip';
import { MrDetails, QuoteItem, QuoteItemDetails } from 'src/app/shared/interfaces/purchase.interface';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';

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
    NumberFormatterPipe,
    NgIcon,
    MatTooltip,
  ],
  templateUrl: './create-purchase.component.html',
  styleUrl: './create-purchase.component.css',
})
export class CreatePurchaseComponent implements OnInit, OnDestroy {
  private fb = inject(FormBuilder);
  private _dialog = inject(MatDialog)
  private router = inject(Router)
  private toaster = inject(ToastrService)
  private purchaseService = inject(PurchaseService)
  private jobService = inject(JobService)
  private employeeService = inject(EmployeeService)
  private subscriptions = new Subscription()

  generatedPRId: string = '';
  prSequence: string = '0001'
  purchaseJobData!: any;
  isAddingItem: boolean = false;

  itemsList = signal<any[]>([])
  isSubmitted = signal<boolean>(false);
  jobSheets = signal<getJob[]>([]);
  selectedJobSheet!: getJob;
  requestedJobId = signal<string>('')
  tokenData!: { id: string, employeeId: string };

  purchaseForm: FormGroup = this.fb.group({
    customer: ['', [Validators.required]],
    salesManager: ['', [Validators.required]],
    purchaseNo: ['', [Validators.required]],
    jobId: ['', [Validators.required]],
    job: [''],
    dealSheetId: ['', [Validators.required]],
    items: this.fb.array([this.createQuoteItemGroup()]),
    totalLpo: [null, [Validators.required]],
    status: [''],
    createdBy: [''],
  })

  ngOnInit(): void {
    this.tokenData = this.employeeService.employeeToken();
    this.deelSheets()
    this.purchaseForm.reset()
    this.generatedPRId = this.generateId()
    this.subscriptions.add(
      this.purchaseService.selectedJob$.subscribe((job) => {
        if (job) {
          this.requestedJobId.set(job._id)
          this.patchValues(job)
        }
      })
    )

    this.subscriptions.add(
      this.purchaseService.purchaseFormData$.subscribe((data) => {
        if (data) {
          this.purchaseForm.patchValue(data)
          if (data.items) {
            this.itemsList.set(data.items)
            this.patchItemsValues(data.items)
          }
          if (data.mrRequest) this.patchMrValues(data.mrRequest)
        }
      })
    )

    this.subscriptions.add(
      this.purchaseService.supplierDiscount$.subscribe((data) => {
        if (data?.suppliers) {
          if (!this.purchaseForm.get('supplierDiscounts')) {
            this.purchaseForm.addControl('supplierDiscounts', this.createSupplierGroup());
          }
          const supplierForm = this.purchaseForm.get('supplierDiscounts') as FormGroup;
          const supplierArray = supplierForm.get('suppliers') as FormArray;
          data.suppliers.forEach((supplier: any) => {
            supplierArray.push(this.fb.group({
              supplierId: [supplier.supplierId],
              discount: [supplier.discount],
              // discountType: [supplier.discountType]
            }));
          });
          supplierForm.patchValue({
            totalDiscount: data.totalDiscount
          });
        }
      })
    )
  }

  onSubmit(): void {
    this.purchaseForm.get('status')?.setValue('Pending')
    this.sendToService()
  }

  onDraftClicks() {
    this.purchaseForm.get('status')?.setValue('Drafted')
    this.sendToService()
  }

  sendToService() {
    this.purchaseForm.removeControl('job')
    this.purchaseForm.get('createdBy')?.setValue(this.tokenData.id)
    this.purchaseService.createPurchase(this.purchaseForm.value).subscribe({
      next: (res) => {
        console.log(res)
      },
      error: (error) => {
        console.log(error)
      }
    })
  }

  onDiscardClicks() {
    this.router.navigate(['/purchase/pendings'])
  }

  createSupplierGroup(): FormGroup {
    return this.fb.group({
      suppliers: this.fb.array([]),
      totalDiscount: ['']
    });
  }

  createMrGroup(): FormGroup {
    return this.fb.group({
      engineer: ['', Validators.required],
      message: ['', Validators.required],
      createdDate: [new Date()]
    });
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
      purchaseNo: this.generateId(),
      dealSheetId: job?.quotation?.dealData?.dealId,
      jobId: job._id,
      job: job.jobId
    })

    this.itemsList.set(job.quotation?.dealData?.updatedItems)
    this.patchItemsValues(this.itemsList())
  }

  patchItemsValues(items: any[]) {
    const itemsFormArray = this.purchaseForm.get('items') as FormArray;
    itemsFormArray.clear();
    const updatedItems = items || [];
    updatedItems.forEach(item => {
      itemsFormArray.push(this.createItemGroup(item));
    });
  }

  patchMrValues(data: MrDetails) {
    if (!this.purchaseForm.get('mrRequest')) {
      this.purchaseForm.addControl('mrRequest', this.createMrGroup());
    }
    (this.purchaseForm.get('mrRequest') as FormGroup).patchValue(data);
  }


  createItemGroup(item: QuoteItem): FormGroup {
    return this.fb.group({
      itemName: [item?.itemName || '', Validators.required],
      itemDetails: this.fb.array(
        (item?.itemDetails || []).map((detail: any) => this.createItemDetailsGroup(detail))
      )
    });
  }

  createItemDetailsGroup(item: QuoteItemDetails): FormGroup {
    (this.purchaseForm.get('items') as FormArray).valueChanges.subscribe(() => {
      this.purchaseForm.get('totalLpo')?.reset()
      this.purchaseForm.get('totalLpo')?.setValue(this.calculateTotalLpo(), { emitEvent: false });
    });
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
    } else {
      this.warningMessage()
    }
  }

  onMrRequestClicks() {
    if (this.selectedJobSheet) {
      const dialogRef = this._dialog.open(MrRequestComponent, {
        width: '550px',
        data: { job: this.purchaseForm.value }
      })

      dialogRef.afterClosed().subscribe((data) => {
        if (data) {
          !data.engineer ?
            this.purchaseForm.removeControl('mrRequest') : this.patchMrValues(data)
        }
      })
    } else {
      this.warningMessage()
    }
  }

  deelSheets() {
    this.subscriptions.add(
      this.jobService.getJobids().subscribe({
        next: (res: any) => {
          this.jobSheets.set(res.jobs)
        }, error: (err) => {
          console.error(err)
        }
      })
    )
  }

  onJobSelected(selected: string | string[]) {
    this.purchaseForm.reset()
    const job = <getJob>this.jobSheets().find(job => job._id === selected);
    this.patchValues(job);
  }

  onComparisonClicks() {
    if (this.selectedJobSheet) {
      this.purchaseService.setPurchaseJob(this.purchaseForm.value)
      this.router.navigate(['/purchase/comparison-sheet'])
    } else {
      this.warningMessage()
    }
  }

  warningMessage() {
    this.toaster.warning('Please select any job from given list.');
  }

  calculateTotalLpo(): number {
    const items = this.purchaseForm.get('items') as FormArray;
    let total = 0;
    items.controls.forEach((itemGroup: AbstractControl) => {
      const itemDetailsArray = itemGroup.get('itemDetails') as FormArray;
      itemDetailsArray.controls.forEach((detailGroup: AbstractControl) => {
        const quantity = detailGroup.get('quantity')?.value || 0;
        const unitCost = detailGroup.get('unitCost')?.value || 0;
        total += quantity * unitCost;
      });
    });
    return total;
  }

  updateTotalLpo() {
    this.purchaseForm.get('totalLpo')?.setValue(this.calculateTotalLpo(), { emitEvent: false });
  }

  get f() {
    return this.purchaseForm.controls;
  }

  getNewItemGroup(): FormGroup {
    const itemsArray = this.purchaseForm.get('items') as FormArray;
    return itemsArray.at(itemsArray.length - 1) as FormGroup;
  }

  getNewItemDetailGroup(): FormGroup {
    return this.getNewItemGroup().get('itemDetails')?.get('0') as FormGroup;
  }

  onAddColumnClicks() {
    const itemsArray = this.purchaseForm.get('items') as FormArray;
    itemsArray.push(this.createQuoteItemGroup());
    this.isAddingItem = true;
  }

  onDiscardNewItem() {
    const itemsArray = this.purchaseForm.get('items') as FormArray;
    if (itemsArray.length > 0) {
      itemsArray.removeAt(itemsArray.length - 1);
      this.isAddingItem = false;
    }
  }

  onSaveNewItem() {
    const itemsArray = this.purchaseForm.get('items') as FormArray;
    const lastItem = itemsArray.at(itemsArray.length - 1) as FormGroup;
    const itemValue = lastItem.value;

    const hasRequiredValues =
      itemValue.itemName &&
      itemValue.itemDetails?.[0]?.detail &&
      itemValue.itemDetails?.[0]?.unitCost > 0 &&
      itemValue.itemDetails?.[0]?.quantity > 0;
    if (!hasRequiredValues) {
      this.toaster.warning('Please fill all required fields!');
    }else{
      this.itemsList.update((current) => [...current, lastItem.value]);
      this.purchaseForm.get('totalLpo')?.setValue(this.calculateTotalLpo(), { emitEvent: false });
      this.isAddingItem = false;
    }

  }


  checkMRExists(): boolean {
    return this.purchaseForm.contains('mrRequest');
  }

  checkSupplierExists(): boolean {
    return this.purchaseForm.contains('supplierDiscounts')
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe()
  }
}
