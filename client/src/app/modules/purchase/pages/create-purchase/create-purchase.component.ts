import { CommonModule } from '@angular/common';
import { Component, inject, OnDestroy, OnInit, signal, Type } from '@angular/core';
import { AbstractControl, FormArray, FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ResizableComponent } from '../../../../shared/components/resizable/resizable.component';
import { NgOptionComponent, NgSelectComponent } from '@ng-select/ng-select';
import { ActivatedRoute, Router } from '@angular/router';
import { PurchaseService } from 'src/app/core/services/purchase/purchase.service';
import { MatDialog } from '@angular/material/dialog';
import { MrRequestComponent } from '../mr-request/mr-request.component';
import { MaterialRequestModalComponent } from '../material-request-modal/material-request-modal.component';
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
import { TechnicalService } from 'src/app/core/services/technical.service';
import { e } from '@angular/cdk/portal-directives.d-BoG39gYN';

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
  private route = inject(ActivatedRoute)
  private toaster = inject(ToastrService)
  private purchaseService = inject(PurchaseService)
  private jobService = inject(JobService)
  private technicalService = inject(TechnicalService)
  private subscriptions = new Subscription()

  generatedPRId: string = '';
  prSequence: string = '0001'
  purchaseJobData!: any;
  purchaseNo!: string;
  isAddingItem: boolean = false;

  itemsList = signal<any[]>([])
  isSubmitted = signal<boolean>(false);
  jobSheets = signal<getJob[]>([]);
  selectedJobSheet!: getJob;
  requestedJobId = signal<string>('')
  isEditing: boolean = false;

  purchaseForm: FormGroup = this.fb.group({
    customerId: ['', [Validators.required]],
    salesManager: ['', [Validators.required]],
    purchaseNo: ['', [Validators.required]],
    jobId: ['', [Validators.required]],
    dealSheetId: ['', [Validators.required]],
    items: this.fb.array([this.createQuoteItemGroup()]),
    totalLpo: [0, [Validators.required]],
    status: [''],
    createdBy: [''],
    job: [''],
    customer: [''],
  })

  ngOnInit(): void {
    const url = this.route.snapshot.routeConfig?.path || '';
    this.isEditing = url.includes('edit');
    if (this.isEditing) {
      const purchaseId = <string>this.route.snapshot.paramMap.get('id');
      this.purchaseService.setEditingorNot(this.isEditing, purchaseId);

      this.checkPurchaseData()
    }

    this.deelSheets()
    this.purchaseForm.reset()
    if (!this.isEditing) {
      this.getPurchaseNo()
    }

    this.getMaterialRequests()

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
          this.purchaseForm.get('dealSheetId')?.setValue(data.dealSheetId)
          if (data.jobId.jobId) {
            this.purchaseForm.get('jobId')?.setValue(data.jobId.jobId)
          }

          if (this.isEditing) {
            this.patchEditValues(data)
          }
          if (data.items) {
            this.itemsList.set(data.items)
            this.patchItemsValues(data.items)
            this.updateTotalLpo()
          }
          if (data.mrRequest) this.patchMrValues(data.mrRequest)
          if (data.supplierDiscounts) this.patchSupplierDiscounts(data.supplierDiscounts)
        }
      })
    )

    this.subscriptions.add(
      this.purchaseService.supplierDiscount$.subscribe((data) => {
        if (data?.suppliers) {
          if (this.purchaseForm.get('supplierDiscounts')) {
            this.purchaseForm.removeControl('supplierDiscounts');
          }

          this.purchaseForm.addControl('supplierDiscounts', this.createSupplierGroup());
          const supplierForm = this.purchaseForm.get('supplierDiscounts') as FormGroup;
          const supplierArray = supplierForm.get('suppliers') as FormArray;

          data.suppliers.forEach((supplier: any) => {
            supplierArray.push(this.fb.group({
              supplierId: [supplier.supplierId._id],
              discount: [supplier.discount],
            }));
          });
          supplierForm.patchValue({
            totalDiscount: data.totalDiscount
          });
        }
      })
    );

    (this.purchaseForm.get('items') as FormArray).valueChanges.subscribe(() => {
      this.updateTotalLpo()
    });
  }

  onSubmit(): void {
    this.purchaseForm.get('status')?.setValue('Pending')
    if (this.isEditing) {
      this.onEditSubmits()
    } else {
      this.sendToService()
    }
  }

  onDraftClicks() {
    this.purchaseForm.get('status')?.setValue('Drafted')
    this.sendToService()
  }

  sendToService() {
    const job = this.purchaseForm.get('job')?.value;
    this.purchaseForm.get('jobId')?.setValue(job);
    this.purchaseForm.removeControl('job')
    this.purchaseService.createPurchase(this.purchaseForm.value).subscribe({
      next: (res) => {
        if (res.success) {
          this.toaster.success('Purchase Uploaded SuccessFully')
          this.purchaseForm.reset()
          this.itemsList.set([])
          this.deelSheets()
          this.router.navigate(['/purchase/pendings'])
        }
      },
      error: (error) => {
        console.log(error)
      }
    })
  }

  checkPurchaseData() {
    const purchaseId = <string>this.route.snapshot.paramMap.get('id');
    this.subscriptions.add(
      this.purchaseService.purchaseFormData$.subscribe((existingData) => {
        if (!existingData) {
          this.subscriptions.add(
            this.purchaseService.getPurchaseById(purchaseId).subscribe({
              next: (res) => {
                if (res.data) {
                  this.jobService.getOneJob(res.data.jobId._id as string).subscribe({
                    next: (res) => {
                      if (res) {
                        this.selectedJobSheet = res[0];
                        this.patchValues(this.selectedJobSheet)
                        this.purchaseService.setPurchaseJob(this.selectedJobSheet)
                      }
                    }
                  })
                  this.purchaseService.setPurchaseFormData(res.data)
                }
              },
              error: (error) => {
                console.error('Error fetching purchase data:', error)
                this.toaster.error('Failed to load purchase data')
              }
            })
          )
        }
      })
    )
  }

  getMaterialRequests() {
    const jobId = this.purchaseForm.get('jobId')?.value;
    if(jobId) {
    this.subscriptions.add(
      this.technicalService.getMaterialRequestByJobId(jobId).subscribe({
        next: (res) => {
          console.log(res, 'res')
        },
        error: (error) => {
          console.error('Error fetching material requests:', error)
          }
        })
      )
    }
  }

  onDiscardClicks() {
    this.purchaseForm.reset()
    this.itemsList.set([])
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
      quantity: ['', Validators.required],
      unitCost: ['', Validators.required],
      unitSellingPrice: [''],
      availability: [''],
      supplierName: [''],
      email: [''],
      phoneNo: [''],
      dealSelected: [false],
    });
  }

  createQuoteItemGroup(): FormGroup {
    return this.fb.group({
      itemName: [''],
      itemDetails: this.fb.array([
        this.createQuoteItemDetailGroup()
      ])
    });
  }

  patchValues(job: getJob) {
    this.selectedJobSheet = job
    this.purchaseForm.patchValue({
      customer: job?.clientDetails?.companyName,
      customerId: job?.clientDetails?._id,
      salesManager: `${job?.salesPersonDetails?.[0]?.firstName || ''} ${job?.salesPersonDetails?.[0]?.lastName || ''}`.trim(),
      dealSheetId: job?.quotation?.dealData?.dealId,
      jobId: job.jobId,
      job: job._id
    })

    if (!this.isEditing) {
      const updatedItems = job.quotation?.dealData?.updatedItems || [];
      const itemsWithComparisons = this.patchComparisonsData(updatedItems, job.quotation?.dealData);
      this.itemsList.set(itemsWithComparisons)
      this.patchItemsValues(this.itemsList())

      if (job.quotation?.dealData?.additionalCosts) {
        this.convertAdditionalCostsToSupplierDiscounts(job.quotation.dealData.additionalCosts)
      }
    }
  }

  patchComparisonsData(updatedItems: any[], dealData: any): any[] {
    return (updatedItems || []).map(item => ({
      ...item,
      itemDetails: (item.itemDetails || []).map((detail: any) => ({
        ...detail,
        comparison: true,
        comparisons: detail.supplierDetails || detail.supplierId ? [
          {
            paymentTerms: dealData?.paymentTerms || '',
            etaTerms: detail.availability || '',
            selected: detail.dealSelected || false,
            supplierId: detail.supplierDetails?._id || detail.supplierId || '',
            supplierName: detail.supplierDetails?.supplierName || detail.supplierName || '',
            totalCost: (detail.unitCost || 0) * (detail.quantity || 0),
            unitPrice: detail.unitCost || 0,
            quantity: detail.quantity || 0
          }
        ] : [],
      }))
    }));
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

  patchSupplierDiscounts(supplierDiscounts: any) {
    if (!supplierDiscounts) return;

    if (!this.purchaseForm.get('supplierDiscounts')) {
      this.purchaseForm.addControl('supplierDiscounts', this.fb.control(supplierDiscounts));
    } else {
      this.purchaseForm.get('supplierDiscounts')?.setValue(supplierDiscounts);
    }
  }

  patchEditValues(data: any) {
    this.purchaseForm.patchValue({
      dealSheetId: data.jobId?.quoteId?.dealData?.dealId || data.dealSheetId,
      customer: data.customerId?.companyName,
      salesManager: `${data.createdBy?.firstName || ''} ${data.createdBy?.lastName || ''}`.trim(),
      purchaseNo: data.purchaseNo,
      job: data.jobId?._id,
    })
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
    return this.fb.group({
      detail: [item.detail || '', Validators.required],
      quantity: [item.quantity || 0, Validators.required],
      unitSellingPrice: [item.unitSellingPrice || 0],
      unitCost: [item.unitCost || 0, Validators.required],
      availability: [item.availability || ''],
      supplierName: [item.supplierName || ''],
      email: [item.email || ''],
      phoneNo: [item.phoneNo || ''],
      dealSelected: [item.dealSelected || false],
      comparison: [(item as any).comparison || false],
      comparisons: [item.comparisons || []],
      paymentTerms: [(item as any).paymentTerms || ''],
      etaTerms: [(item as any).etaTerms || ''],
      selected: [(item as any).selected || false],
      supplierId: [(item as any).supplierId || ''],
      totalCost: [(item as any).totalCost || 0],
      unitPrice: [(item as any).unitPrice || 0]
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
      this.warningMessage('Please select any job from given list')
    }
  }

  onMrRequestClicks() {
    if (this.selectedJobSheet) {
      const dialogRef = this._dialog.open(MrRequestComponent, {
        width: '550px',
        disableClose: true,
        maxHeight: '90vh',
        autoFocus: false,
        data: { job: this.purchaseForm.value }
      })

      dialogRef.afterClosed().subscribe((data) => {
        if (data) {
          !data.engineer ?
            this.purchaseForm.removeControl('mrRequest') : this.patchMrValues(data)
        }
      })
    } else {
      this.warningMessage('Please select any job from given list')
    }
  }

  onGetMaterialRequestsClicks() {
    if (this.selectedJobSheet) {
      const dialogRef = this._dialog.open(MaterialRequestModalComponent, {
        width: '800px',
        disableClose: true,
        maxHeight: '90vh',
        autoFocus: false,
        data: {
          jobId: this.purchaseForm.get('job')?.value,
          existingItems: this.itemsList()
        }
      })

      dialogRef.afterClosed().subscribe((result) => {
        if (result && result.success && result.items) {
          this.addMaterialRequestsToItems(result.items)
        }
      })
    } else {
      this.warningMessage('Please select any job from given list')
    }
  }

  deelSheets() {
    this.subscriptions.add(
      this.jobService.getJobids().subscribe({
        next: (res: any) => {
          if (res.jobs) this.jobSheets.set(res.jobs);
        }, error: (err) => {
          console.error(err)
        }
      })
    )
  }

  onJobSelected(selected: string | string[]) {
    this.purchaseForm.reset()
    this.purchaseForm.get('purchaseNo')?.setValue(this.purchaseNo);
    this.jobService.getOneJob(selected as string).subscribe({
      next: (res) => {
        if (res && res.length > 0) {
          this.patchValues(res[0])
          this.purchaseService.setPurchaseJob(res[0])
        }
      }, error: (error) => {
        console.error(error)
      }
    })
  }

  onComparisonClicks(item: QuoteItemDetails) {
    if (this.purchaseForm.value) {
      item.comparison = true
      const comparisonData = {
        jobId: this.purchaseForm.value.jobId,
        purchaseNo: this.purchaseForm.value.purchaseNo,
        item: this.itemsList(),
        inventory: [],
        selectedItem: item._id
      }
      this.purchaseService.setComparisonData(comparisonData)
      this.purchaseService.setPurchaseFormData(this.purchaseForm.value)
      this.router.navigate(['/purchase/comparison-sheet'])
    } else {
      this.warningMessage('Please select any job from given list')
    }
  }

  onComparisonSummaryClicks() {
    if (!this.selectedJobSheet) {
      return this.warningMessage('Please select any job from given list')
    }

    const items = this.purchaseForm.value.items;
    const max = Math.max(
      ...items.map((item: any) =>
        item.itemDetails.reduce((sum: any, detail: any) => {
          return sum + (detail.comparisons?.length || 0);
        }, 0)
      )
    );

    if (max == 0 || items.length == 0) {
      return this.warningMessage('No comparisons found!')
    }

    this.purchaseService.setPurchaseFormData(this.purchaseForm.value)
    this.router.navigate(['/purchase/comparison-summary'])
  }

  getPurchaseNo() {
    this.purchaseService.getPurchaseNo().subscribe({
      next: (res: any) => {
        if (res.data) {
          this.purchaseForm.get('purchaseNo')?.setValue(res.data.purchaseNo)
          this.purchaseNo = res.data.purchaseNo
        }
      }, error: (error: Error) => {
        console.log(error)
      }
    })
  }

  warningMessage(message: string) {
    this.toaster.warning(message);
  }

  calculateTotalLpo(): number {
    const items = this.purchaseForm.get('items') as FormArray;
    return items.controls.reduce((total, itemGroup: AbstractControl) => {
      const itemDetailsArray = itemGroup.get('itemDetails') as FormArray;
      const itemTotal = itemDetailsArray.controls.reduce((subTotal, detailGroup: AbstractControl) => {
        const quantity = +detailGroup.get('quantity')?.value || 0;
        const unitSellingPrice = +detailGroup.get('unitCost')?.value || 0;
        return subTotal + (quantity * unitSellingPrice);
      }, 0);
      return total + itemTotal;
    }, 0);
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
      itemValue.itemDetails[0]?.detail &&
      itemValue.itemDetails[0]?.unitCost > 0 &&
      itemValue.itemDetails[0]?.quantity > 0;

    if (!hasRequiredValues) {
      this.toaster.warning('Please fill all required fields!');
      return;
    }

    this.itemsList.set([...(this.itemsList() || []), itemValue]);
    itemsArray.push(this.fb.group(itemValue));
    this.isAddingItem = false;
    this.purchaseForm.get('totalLpo')?.setValue(this.calculateTotalLpo(), { emitEvent: false });
  }

  checkMRExists(): boolean {
    return this.purchaseForm.contains('mrRequest');
  }

  checkSupplierExists(): boolean {
    return this.purchaseForm.contains('supplierDiscounts')
  }

  onFinalDasdboardClicks() {
    let purchaseFormValue = this.purchaseForm.value
    console.log(purchaseFormValue, 'purchaseFormValue')
    if (!this.isEditing) {
      purchaseFormValue = {
        ...this.purchaseForm.value,
        customerId: {
          _id: this.purchaseForm.get('customerId')?.value,
          companyName: this.purchaseForm.get('customer')?.value
        },
      }
    }
    purchaseFormValue.jobId = {
      jobId: this.purchaseForm.get('jobId')?.value,
      createdBy: this.selectedJobSheet.salesPersonDetails[0],
      quoteId: {
        dealData: {
          dealId: this.purchaseForm.get('dealSheetId')?.value
        }
      }
    }
    this.purchaseService.setPurchaseFormData(purchaseFormValue)
    this.router.navigate(['/purchase/view-purchase', 'none']);
  }

  onEditSubmits() {
    const job = this.purchaseForm.get('job')?.value;
    this.purchaseForm.get('jobId')?.setValue(job);
    this.purchaseForm.removeControl('job')
    const purchaseId = <string>this.route.snapshot.paramMap.get('id');
    this.subscriptions.add(
      this.purchaseService.updatePurchase(purchaseId, this.purchaseForm.value).subscribe({
        next: (res) => {
          if (res.success) {
            this.toaster.success('Purchase Updated Successfully')
            this.purchaseForm.reset()
            this.router.navigate(['/purchase/view-purchase', purchaseId]);
          }
        }, error: (error) => {
          console.error(error)
        }
      })
    )
  }

  convertAdditionalCostsToSupplierDiscounts(additionalCosts: any[]) {
    const supplierDiscounts = additionalCosts.filter(cost =>
      cost.type === 'Supplier Discount' && cost.supplierId
    );

    if (supplierDiscounts.length > 0) {
      if (this.purchaseForm.get('supplierDiscounts')) {
        this.purchaseForm.removeControl('supplierDiscounts');
      }

      this.purchaseForm.addControl('supplierDiscounts', this.createSupplierGroup());
      const supplierForm = this.purchaseForm.get('supplierDiscounts') as FormGroup;
      const supplierArray = supplierForm.get('suppliers') as FormArray;

      let totalDiscount = 0;

      supplierDiscounts.forEach((discount: any) => {
        supplierArray.push(this.fb.group({
          supplierId: [discount.supplierId],
          discount: [discount.value],
          discountType: ['amount']
        }));
        totalDiscount += discount.value || 0;
      });

      supplierForm.patchValue({
        totalDiscount: totalDiscount.toString()
      });
    }
  }

  addMaterialRequestsToItems(materialRequestItems: any[]) {
    const currentItems = this.itemsList();
    const newItems = [...currentItems, ...materialRequestItems];

    this.itemsList.set(newItems);
    this.patchItemsValues(newItems);
    this.updateTotalLpo();

    this.toaster.success(`${materialRequestItems.length} item(s) added from material requests`);
  }

  getPurchaseStatus(): string {
    return this.purchaseForm.get('status')?.value || 'Pending';
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }
}
