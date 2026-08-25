import { CommonModule } from '@angular/common';
import { Component, inject, OnDestroy, OnInit, signal, Type } from '@angular/core';
import { AbstractControl, FormArray, FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ResizableComponent } from '../../../../shared/components/resizable/resizable.component';
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
import { MrDetails, QuoteItem, QuoteItemDetails, ProductPartNumber } from 'src/app/shared/interfaces/purchase.interface';
import { ProductService, PartNumberOption } from 'src/app/core/services/product/product.service';
import { CreateProductComponent } from 'src/app/modules/inventory/pages/all-products/modals/create-product/create-product.component';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { SupplierService } from 'src/app/core/services/supplier.service';

interface PartNumberDropdownOption {
  label: string;
  value: string;
  data: PartNumberOption;
}

@Component({
  selector: 'app-create-purchase',
  imports: [
    ReactiveFormsModule,
    FormsModule,
    CommonModule,
    ResizableComponent,
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
  private productService = inject(ProductService)
  private employeeService = inject(EmployeeService)
  private supplierService = inject(SupplierService)
  private subscriptions = new Subscription()

  generatedPRId: string = '';
  prSequence: string = '0001'
  purchaseJobData!: any;
  purchaseNo!: string;
  isAddingItem: boolean = false;
  purchaseId: string | null = null;

  itemsList = signal<any[]>([])
  isSubmitted = signal<boolean>(false);
  jobSheets = signal<getJob[]>([]);
  selectedJobSheet!: getJob;
  requestedJobId = signal<string>('')
  isEditing: boolean = false;
  partNumberOptions = signal<PartNumberDropdownOption[]>([])
  currency = signal<string>('')
  isJobLess: boolean = false;
  currentEmployeeName = signal<string>('');
  editingItemKey: string | null = null;
  editBuffer: any = null;
  suppliersList = signal<any[]>([]);

  purchaseForm: FormGroup = this.fb.group({
    customerId: ['', [Validators.required]],
    supplierId: [''],
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

  toggleJobLess(isJobLess: boolean): void {
    this.isJobLess = isJobLess;
    this.selectedJobSheet = undefined as any;
    this.requestedJobId.set('');
    this.itemsList.set([]);
    this.purchaseForm.reset();
    this.purchaseForm.get('purchaseNo')?.setValue(this.purchaseNo);

    const jobIdControl = this.purchaseForm.get('jobId');
    const dealSheetIdControl = this.purchaseForm.get('dealSheetId');
    const customerIdControl = this.purchaseForm.get('customerId');

    if (isJobLess) {
      jobIdControl?.clearValidators();
      dealSheetIdControl?.clearValidators();
      customerIdControl?.clearValidators();
      this.loadCurrentEmployeeName();
    } else {
      jobIdControl?.setValidators([Validators.required]);
      dealSheetIdControl?.setValidators([Validators.required]);
      customerIdControl?.setValidators([Validators.required]);
    }

    if (isJobLess && this.itemsList().length === 0) {
      this.onAddColumnClicks();
    }
    jobIdControl?.updateValueAndValidity();
    dealSheetIdControl?.updateValueAndValidity();
    customerIdControl?.updateValueAndValidity();
  }

  loadSuppliers(): void {
    this.subscriptions.add(
      this.supplierService.supplierList().subscribe({
        next: (res) => {
          this.suppliersList.set(res.data || []);
        },
        error: (error) => {
          console.error('Failed to load suppliers', error);
        }
      })
    );
  }

  loadCurrentEmployeeName(): void {
    this.subscriptions.add(
      this.employeeService.employeeData$.subscribe((emp) => {
        if (emp) {
          const name = `${emp.firstName || ''} ${emp.lastName || ''}`.trim();
          this.currentEmployeeName.set(name);
          this.purchaseForm.patchValue({ salesManager: name });
        } else {
          this.employeeService.getEmployeeData();
        }
      })
    );
  }

  ngOnInit(): void {
    const url = this.route.snapshot.routeConfig?.path || '';
    this.isEditing = url.includes('edit');
    
    if (this.isEditing) {
      this.purchaseId = <string>this.route.snapshot.paramMap.get('id');
      this.loadPurchaseData();
    } else {
      this.purchaseForm.reset();
      this.getPurchaseNo();
      
      const jobId = this.route.snapshot.queryParamMap.get('jobId');
      if (jobId) {
        this.requestedJobId.set(jobId);
      }

      this.deelSheets(jobId);
    }

    this.generatedPRId = this.generateId();
    this.loadPartNumbers();
    this.loadSuppliers();

    (this.purchaseForm.get('items') as FormArray).valueChanges.subscribe(() => {
      this.updateTotalLpo();
    });
  }

  selectJobById(jobId: string): void {
    this.jobService.getOneJob(jobId).subscribe({
      next: (res) => {
        if (res && res.length > 0) {
          this.patchValues(res[0]);
        }
      },
      error: (error) => {
        console.error(error);
        this.toaster.error('Failed to load job details');
      }
    });
  }

  loadPurchaseData(): void {
    if (!this.purchaseId) return;

    this.subscriptions.add(
      this.purchaseService.getPurchaseById(this.purchaseId).subscribe({
        next: (res) => {
          if (res.data) {
            const purchase = res.data;
            this.isJobLess = purchase.sourceType === 'manual' || !purchase.jobId;

            if (this.isJobLess) {
              const jobIdControl = this.purchaseForm.get('jobId');
              const dealSheetIdControl = this.purchaseForm.get('dealSheetId');
              jobIdControl?.clearValidators();
              dealSheetIdControl?.clearValidators();
              jobIdControl?.updateValueAndValidity();
              dealSheetIdControl?.updateValueAndValidity();
            }

            this.purchaseForm.patchValue({
              customerId: purchase.customerId?._id || purchase.customerId,
              supplierId: purchase.supplierId?._id || purchase.supplierId || '',
              salesManager: `${purchase.createdBy?.firstName || ''} ${purchase.createdBy?.lastName || ''}`.trim(),
              purchaseNo: purchase.purchaseNo,
              jobId: purchase.jobId?.jobId || purchase.jobId,
              dealSheetId: purchase.jobId?.quoteId?.dealData?.dealId || purchase.dealSheetId,
              customer: purchase.customerId?.companyName || purchase.customer,
              status: purchase.status,
              totalLpo: purchase.totalLpo,
              job: purchase.jobId?._id || purchase.jobId
            });

            if (purchase.items) {
              this.itemsList.set(purchase.items);
              this.patchItemsValuesWithPartNoIds(purchase.items);
              this.updateTotalLpo();
            }

            if (purchase.currency) {
              this.currency.set(purchase.currency);
            }

            if (purchase.mrRequest?.engineer) {
              this.patchMrValues(purchase.mrRequest);
            }

            if (purchase.supplierDiscounts?.suppliers) {
              this.patchSupplierDiscounts(purchase.supplierDiscounts);
            }

            if (purchase.jobId?._id) {
              this.jobService.getOneJob(purchase.jobId._id).subscribe({
                next: (jobRes) => {
                  if (jobRes && jobRes.length > 0) {
                    this.selectedJobSheet = jobRes[0];
                  }
                },
                error: (error) => {
                  console.error(error);
                }
              });
            }
          }
        },
        error: (error) => {
          console.error('Error loading purchase data:', error);
          this.toaster.error('Failed to load purchase data');
        }
      })
    );
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
    if (this.purchaseId) {
      this.updatePurchaseDraft();
    } else {
      this.createPurchaseDraft();
    }
  }

  createPurchaseDraft(): void {
    const formValue = this.getFormValueForSave();
    formValue.status = 'Drafted';

    this.subscriptions.add(
      this.purchaseService.createPurchaseDraft(formValue).subscribe({
        next: (res) => {
          if (res.success && res.data?._id) {
            this.purchaseId = res.data._id;
            this.toaster.success('Purchase saved as draft');
            this.router.navigate(['/purchase/pendings'], this.isJobLess ? { queryParams: { sourceType: 'general' } } : {});
          }
        },
        error: (error) => {
          console.error(error);
          this.toaster.error('Failed to save draft');
        }
      })
    );
  }

  updatePurchaseDraft(): void {
    const formValue = this.getFormValueForSave();
    formValue.status = 'Drafted';

    this.subscriptions.add(
      this.purchaseService.updatePurchase(this.purchaseId!, formValue).subscribe({
        next: (res) => {
          if (res.success) {
            this.toaster.success('Purchase updated successfully');
            this.router.navigate(['/purchase/pendings'], this.isJobLess ? { queryParams: { sourceType: 'general' } } : {});
          }
        },
        error: (error) => {
          console.error(error);
          this.toaster.error('Failed to update purchase');
        }
      })
    );
  }

  sendToService() {
    if (this.purchaseId) {
      this.updatePurchase();
    } else {
      this.createPurchase();
    }
  }

  createPurchase(): void {
    const formValue = this.getFormValueForSave();
    formValue.status = 'Pending';

    this.subscriptions.add(
      this.purchaseService.createPurchase(formValue).subscribe({
        next: (res) => {
          if (res.success) {
            this.toaster.success('Purchase uploaded successfully');
            this.router.navigate(['/purchase/pendings'], this.isJobLess ? { queryParams: { sourceType: 'general' } } : {});
          }
        },
        error: (error) => {
          console.error(error);
          this.toaster.error('Failed to create purchase');
        }
      })
    );
  }

  updatePurchase(): void {
    const formValue = this.getFormValueForSave();
    formValue.status = 'Pending';

    this.subscriptions.add(
      this.purchaseService.updatePurchase(this.purchaseId!, formValue).subscribe({
        next: (res) => {
          if (res.success) {
            this.toaster.success('Purchase updated successfully');
            this.router.navigate(['/purchase/pendings'], this.isJobLess ? { queryParams: { sourceType: 'general' } } : {});
          }
        },
        error: (error) => {
          console.error(error);
          this.toaster.error('Failed to update purchase');
        }
      })
    );
  }

  getFormValueForSave(): any {
    const job = this.purchaseForm.get('job')?.value;
    const formValue = { ...this.purchaseForm.value };

    if (job) {
      formValue.jobId = job;
    }
    const itemsWithPartNoObjects = this.convertPartNoIdsToObjects(this.itemsList());
    formValue.items = itemsWithPartNoObjects;
    delete formValue.job;

    formValue.sourceType = this.isJobLess ? 'manual' : 'job';
    if (this.isJobLess) {
      delete formValue.jobId;
      delete formValue.dealSheetId;
    }

    return formValue;
  }



  onDiscardClicks() {
    const isJobLess = this.isJobLess;
    this.purchaseForm.reset()
    this.itemsList.set([])
    this.router.navigate(['/purchase/pendings'], isJobLess ? { queryParams: { sourceType: 'general' } } : {})
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
      partNo: [''],
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
    this.requestedJobId.set(job._id);
    this.purchaseForm.patchValue({
      customer: job?.clientDetails?.companyName,
      customerId: job?.clientDetails?._id,
      salesManager: `${job?.salesPersonDetails?.[0]?.firstName || ''} ${job?.salesPersonDetails?.[0]?.lastName || ''}`.trim(),
      dealSheetId: job?.quotation?.dealData?.dealId,
      jobId: job._id,
      job: job._id
    })

    const currency = (job?.quotation as any)?.currency || (job?.quotation as any)?.dealData?.currency || '';
    if (currency) {
      this.currency.set(currency);
    }

    if (!this.isEditing) {
      const updatedItems = job.quotation?.dealData?.updatedItems || [];
      const itemsWithComparisons = this.patchComparisonsData(updatedItems, job.quotation?.dealData);
      this.itemsList.set(itemsWithComparisons);
      this.patchItemsValuesWithPartNoIds(itemsWithComparisons);

      if (job.quotation?.dealData?.additionalCosts) {
        this.convertAdditionalCostsToSupplierDiscounts(job.quotation.dealData.additionalCosts);
      }
    }
  }

  patchComparisonsData(updatedItems: any[], dealData: any): any[] {
    return (updatedItems || []).map(item => ({
      ...item,
      itemDetails: (item.itemDetails || []).map((detail: any) => ({
        ...detail,
        unitSellingPrice: detail.unitSellingPrice !== undefined && detail.unitSellingPrice !== null 
          ? detail.unitSellingPrice 
          : (detail.unitCost || 0),
        unitCost: detail.unitCost || 0,
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

  patchItemsValuesWithPartNoIds(items: any[]) {
    const itemsFormArray = this.purchaseForm.get('items') as FormArray;
    itemsFormArray.clear();
    const updatedItems = items || [];
    updatedItems.forEach(item => {
      const itemGroup = this.createItemGroup(item);
      const itemDetailsArray = itemGroup.get('itemDetails') as FormArray;
      itemDetailsArray.controls.forEach(control => {
        const partNo = control.get('partNo')?.value;
        if (partNo && typeof partNo === 'object' && partNo._id) {
          control.get('partNo')?.setValue(partNo._id);
        }
      });
      itemsFormArray.push(itemGroup);
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
      partNo: [typeof item.partNo === 'object' && item.partNo?._id ? item.partNo._id : (item.partNo || '')],
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

  ensurePurchaseId(): Promise<string> {
    return new Promise((resolve, reject) => {
      if (this.purchaseId) {
        resolve(this.purchaseId);
        return;
      }

      if (!this.selectedJobSheet && !this.isJobLess) {
        this.warningMessage('Please select any job from given list');
        reject('No job selected');
        return;
      }

      const formValue = this.getFormValueForSave();
      formValue.status = 'Drafted';

      this.purchaseService.createPurchaseDraft(formValue).subscribe({
        next: (res) => {
          if (res.success && res.data?._id) {
            const newPurchaseId = res.data._id;
            this.purchaseId = newPurchaseId;
            resolve(newPurchaseId);
          } else {
            reject('Failed to create draft');
          }
        },
        error: (error) => {
          console.error(error);
          this.toaster.error('Failed to create draft');
          reject(error);
        }
      });
    });
  }

  generateId(): string {
    const now = new Date();
    const year = now.getFullYear().toString().slice(-2);
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    return `NRN/PR-${year}-${month}-${this.prSequence}`;
  }

  onSupplierClicks() {
    if (!this.selectedJobSheet) {
      this.warningMessage('Please select any job from given list');
      return;
    }

    this.ensurePurchaseId().then((purchaseId) => {
      this.router.navigate(['/purchase/supplier-discount', purchaseId]);
    }).catch(() => {});
  }

  onMrRequestClicks() {
    if (!this.selectedJobSheet) {
      this.warningMessage('Please select any job from given list');
      return;
    }

    this.ensurePurchaseId().then((purchaseId) => {
      const dialogRef = this._dialog.open(MrRequestComponent, {
        width: '550px',
        disableClose: true,
        maxHeight: '90vh',
        autoFocus: false,
        data: { purchaseId }
      });

      dialogRef.afterClosed().subscribe((result) => {
        if (result?.success) {
          this.loadPurchaseData();
        }
      });
    }).catch(() => {});
  }

  onGetMaterialRequestsClicks() {
    if (!this.selectedJobSheet) {
      this.warningMessage('Please select any job from given list');
      return;
    }

    this.ensurePurchaseId().then((purchaseId) => {
      const dialogRef = this._dialog.open(MaterialRequestModalComponent, {
        width: '800px',
        disableClose: true,
        maxHeight: '90vh',
        autoFocus: false,
        data: {
          purchaseId,
          jobId: this.purchaseForm.get('job')?.value,
          onDataChange: () => {
            this.loadPurchaseData();
          }
        }
      });

      dialogRef.afterClosed().subscribe((result) => {
        if (result?.success) {
          this.loadPurchaseData();
        }
      });
    }).catch(() => {});
  }

  deelSheets(requestedJobId?: string | null) {
    this.subscriptions.add(
      this.jobService.getConvertibleJobs().subscribe({
        next: (res: any) => {
          if (res.jobs) this.jobSheets.set(res.jobs);

          if (requestedJobId) {
            const isEligible = (res.jobs || []).some((j: any) => j._id === requestedJobId);
            if (isEligible) {
              this.selectJobById(requestedJobId);
            } else {
              this.requestedJobId.set('');
              this.toaster.error('This job is not available for a new purchase requisition. It may already have a purchase request or is not open for procurement.');
            }
          }
        }, error: (err) => {
          console.error(err)
        }
      })
    )
  }

  onJobSelected(selected: string | string[]) {
    this.purchaseForm.reset();
    this.purchaseForm.get('purchaseNo')?.setValue(this.purchaseNo);
    this.purchaseId = null;
    this.itemsList.set([]);
    
    this.jobService.getOneJob(selected as string).subscribe({
      next: (res) => {
        if (res && res.length > 0) {
          this.patchValues(res[0]);
        }
      },
      error: (error) => {
        console.error(error);
      }
    });
  }

  onComparisonClicks(item: QuoteItemDetails) {
    if (!this.selectedJobSheet) {
      this.warningMessage('Please select any job from given list');
      return;
    }

    if (!item._id) {
      this.warningMessage('Please save the item first before adding comparisons');
      return;
    }

    item.comparison = true;

    this.ensurePurchaseId().then((purchaseId) => {
      this.router.navigate(['/purchase/comparison-sheet', purchaseId], {
        queryParams: { selectedItem: item._id }
      });
    }).catch(() => {});
  }

  onComparisonSummaryClicks() {
    if (!this.selectedJobSheet) {
      this.warningMessage('Please select any job from given list');
      return;
    }

    const items = this.itemsList();
    const max = Math.max(
      ...items.map((item: any) =>
        item.itemDetails.reduce((sum: any, detail: any) => {
          return sum + (detail.comparisons?.length || 0);
        }, 0)
      )
    );

    if (max == 0 || items.length == 0) {
      this.warningMessage('No comparisons found!');
      return;
    }

    this.ensurePurchaseId().then((purchaseId) => {
      this.router.navigate(['/purchase/comparison-summary', purchaseId]);
    }).catch(() => {});
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
    const itemsList = this.itemsList();
    if (!itemsList || itemsList.length === 0) return 0;
    return itemsList.reduce((total, item: any) => {
      if (!item.itemDetails || !Array.isArray(item.itemDetails)) return total;
      const itemTotal = item.itemDetails.reduce((subTotal: number, detail: any) => {
        if (detail.fromMrRequest) {
          return subTotal;
        }
        const quantity = +detail.quantity || 0;
        const unitCost = +detail.unitCost || 0;
        return subTotal + (quantity * unitCost);
      }, 0);
      return total + itemTotal;
    }, 0);
  }

  formatPartNumber(partNo: any): string {
    if (!partNo) return '-';
    if (typeof partNo === 'string') {
      // Look up the part number from options to get the full object
      const option = this.partNumberOptions().find(opt => opt.value === partNo);
      if (option?.data) {
        const code = option.data.partNo || '';
        if (code) {
          return `${code}`;
        }
        return code || partNo;
      }
      return partNo;
    }
    const code = partNo?.partNo || '';
    if (code) {
      return `${code}`;
    }
    return code || '-';
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
    if (!lastItem) {
      this.toaster.warning('No item to save!');
      return;
    }

    const itemValue = lastItem.value;

    const hasRequiredValues =
      itemValue.itemDetails?.[0]?.detail &&
      itemValue.itemDetails[0]?.unitCost > 0 &&
      itemValue.itemDetails[0]?.quantity > 0;

    if (!hasRequiredValues) {
      this.toaster.warning('Please fill all required fields!');
      return;
    }

    // Ensure itemName is set - use detail if itemName is empty
    if (!itemValue.itemName || itemValue.itemName.trim() === '') {
      itemValue.itemName = itemValue.itemDetails?.[0]?.detail || 'Item';
    }

    if (itemValue.itemDetails && itemValue.itemDetails.length > 0) {
      itemValue.itemDetails = itemValue.itemDetails.map((detail: any) => ({
        ...detail,
        isNewlyAdded: true,
        merged: false
      }));
    }

    const updatedItemsList = [...(this.itemsList() || []), itemValue];
    this.itemsList.set(updatedItemsList);
    
    this.isAddingItem = false;
    this.purchaseForm.get('totalLpo')?.setValue(this.calculateTotalLpo(), { emitEvent: false });

    this.saveItemsToBackend(updatedItemsList);
  }

  isEditingItem(i: number, j: number): boolean {
    return this.editingItemKey === `${i}-${j}`;
  }

  onEditItemClick(i: number, j: number): void {
    const item = this.itemsList()[i]?.itemDetails?.[j];
    if (!item) return;
    this.editingItemKey = `${i}-${j}`;
    this.editBuffer = {
      detail: item.detail,
      quantity: item.quantity,
      unitCost: item.unitCost,
      unitSellingPrice: item.unitSellingPrice,
      partNo: typeof item.partNo === 'object' && item.partNo?._id ? item.partNo._id : (item.partNo || '')
    };
  }

  onEditPartNumberSelected(event: string | string[]): void {
    const value = Array.isArray(event) ? event[0] : event;
    this.editBuffer.partNo = (value || '').trim();
  }

  onCancelEditItem(): void {
    this.editingItemKey = null;
    this.editBuffer = null;
  }

  onSaveEditedItem(i: number, j: number): void {
    if (!this.editBuffer) return;

    if (!this.editBuffer.detail || !(this.editBuffer.quantity > 0) || !(this.editBuffer.unitCost > 0)) {
      this.toaster.warning('Please fill all required fields!');
      return;
    }

    const updatedList = [...this.itemsList()];
    const updatedItem = { ...updatedList[i] };
    const updatedDetails = [...updatedItem.itemDetails];
    updatedDetails[j] = { ...updatedDetails[j], ...this.editBuffer };
    updatedItem.itemDetails = updatedDetails;
    updatedList[i] = updatedItem;

    this.itemsList.set(updatedList);
    this.editingItemKey = null;
    this.editBuffer = null;
    this.purchaseForm.get('totalLpo')?.setValue(this.calculateTotalLpo(), { emitEvent: false });
    this.saveItemsToBackend(updatedList);
  }

  onDeleteItemClick(i: number, j: number): void {
    const updatedList = [...this.itemsList()];
    const updatedItem = { ...updatedList[i] };
    const updatedDetails = updatedItem.itemDetails.filter((_: any, idx: number) => idx !== j);

    if (updatedDetails.length === 0) {
      updatedList.splice(i, 1);
    } else {
      updatedItem.itemDetails = updatedDetails;
      updatedList[i] = updatedItem;
    }

    this.itemsList.set(updatedList);
    this.purchaseForm.get('totalLpo')?.setValue(this.calculateTotalLpo(), { emitEvent: false });
    this.saveItemsToBackend(updatedList);
  }

  saveItemsToBackend(updatedItemsList: any[]): void {
    // Convert part number IDs to objects first, then clean for backend
    const itemsWithPartNos = this.convertPartNoIdsToObjects(updatedItemsList);
    const itemsToSave = this.cleanItemsForBackend(itemsWithPartNos);
    
    const handleSaveResponse = (res: any) => {
      if (res.success && res.data && res.data.items) {
        // Update itemsList with the saved items that have IDs from backend
        this.itemsList.set(res.data.items);
        this.patchItemsValuesWithPartNoIds(res.data.items);
        this.toaster.success('Item saved successfully');
      } else if (res.success) {
        this.toaster.success('Item saved successfully');
      }
    };
    
    if (this.purchaseId) {
      this.subscriptions.add(
        this.purchaseService.updatePurchaseItems(this.purchaseId, itemsToSave).subscribe({
          next: handleSaveResponse,
          error: (error) => {
            console.error('Error saving item:', error);
            this.toaster.error('Failed to save item');
          }
        })
      );
    } else if (this.selectedJobSheet || this.isJobLess) {
      console.log('Creating draft first before saving items');
      this.ensurePurchaseId().then((purchaseId) => {
        this.subscriptions.add(
          this.purchaseService.updatePurchaseItems(purchaseId, itemsToSave).subscribe({
            next: handleSaveResponse,
            error: (error) => {
              console.error('Error saving item:', error);
              this.toaster.error('Failed to save item');
            }
          })
        );
      }).catch((error) => {
        console.error('Error creating draft:', error);
        this.toaster.error('Failed to create draft purchase');
      });
    } else {
      console.warn('Cannot save items: no purchaseId and no selectedJobSheet');
    }
  }

  checkMRExists(): boolean {
    return this.purchaseForm.contains('mrRequest');
  }

  checkSupplierExists(): boolean {
    return this.purchaseForm.contains('supplierDiscounts')
  }

  onFinalDasdboardClicks() {
    if (!this.purchaseId) {
      this.warningMessage('Please save the purchase first');
      return;
    }
    this.router.navigate(['/purchase/view-purchase', this.purchaseId]);
  }

  onEditSubmits() {
    if (!this.purchaseId) return;
    
    const formValue = this.getFormValueForSave();
    formValue.status = 'Pending';

    this.subscriptions.add(
      this.purchaseService.updatePurchase(this.purchaseId, formValue).subscribe({
        next: (res) => {
          if (res.success) {
            this.toaster.success('Purchase Updated Successfully');
            this.router.navigate(['/purchase/view-purchase', this.purchaseId]);
          }
        },
        error: (error) => {
          console.error(error);
          this.toaster.error('Failed to update purchase');
        }
      })
    );
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


  getPurchaseStatus(): string {
    return this.purchaseForm.get('status')?.value || 'Pending';
  }

  loadPartNumbers(search?: string): void {
    const params: { search?: string; limit?: number } = { limit: 50 };
    if (search) {
      params.search = search;
    }

    this.subscriptions.add(
      this.productService.getPartNumbers(params).subscribe({
        next: (res) => {
          const options = (res.data || []).map((item: PartNumberOption) => ({
            label: this.composePartNumberLabel(item),
            value: item._id,
            data: item
          }));
          this.partNumberOptions.set(options);
        },
        error: (error) => {
          console.error('Error loading part numbers:', error);
          this.partNumberOptions.set([]);
        }
      })
    );
  }

  private composePartNumberLabel(option: { partNo?: string; productDescription?: string }): string {
    const code = option.partNo || '';
    const description = option.productDescription || '';
    return description ? `${code} (${description})` : code;
  }

  getPartNumberValue(partNo: any): string {
    if (!partNo) return '';
    if (typeof partNo === 'string') return partNo;
    return partNo._id || '';
  }

  onPartNumberSelected(event: string | string[], itemDetailControl: AbstractControl): void {
    const value = Array.isArray(event) ? event[0] : event;
    const normalized = (value || '').trim();
    itemDetailControl.get('partNo')?.setValue(normalized || '', { emitEvent: false });
  }

  convertPartNoIdsToObjects(items: any[]): any[] {
    return items.map(item => ({
      ...item,
      itemDetails: (item.itemDetails || []).map((detail: any) => {
        const partNoId = typeof detail.partNo === 'string' ? detail.partNo : detail.partNo?._id;
        if (partNoId) {
          const option = this.partNumberOptions().find(opt => opt.value === partNoId);
          if (option?.data) {
            return {
              ...detail,
              partNo: {
                _id: option.data._id,
                partNo: option.data.partNo,
                productDescription: option.data.productDescription
              }
            };
          }
        }
        return detail;
      })
    }));
  }

  cleanItemsForBackend(items: any[]): any[] {
    return items.map(item => {
      // Ensure itemName is set - use first detail if itemName is empty
      let itemName = item.itemName;
      if (!itemName || itemName.trim() === '') {
        itemName = item.itemDetails?.[0]?.detail || 'Item';
      }

      const cleanedItem: any = {
        itemName: itemName.trim(),
        itemDetails: (item.itemDetails || []).map((detail: any) => {
          const cleanedDetail: any = {
            detail: detail.detail || '',
            quantity: typeof detail.quantity === 'number' ? detail.quantity : (detail.quantity ? parseFloat(String(detail.quantity)) : 0),
            unitCost: typeof detail.unitCost === 'number' ? detail.unitCost : (detail.unitCost ? parseFloat(String(detail.unitCost)) : 0),
            availability: detail.availability || '',
            supplierName: detail.supplierName || '',
            email: detail.email || '',
            phoneNo: detail.phoneNo || '',
            dealSelected: detail.dealSelected || false,
            comparisons: detail.comparisons && Array.isArray(detail.comparisons) ? detail.comparisons : [],
            isNewlyAdded: detail.isNewlyAdded !== undefined ? detail.isNewlyAdded : false,
            merged: detail.merged !== undefined ? detail.merged : false,
            fromMrRequest: detail.fromMrRequest === true
          };

          // Handle unitSellingPrice - only include if it's a valid number
          if (detail.unitSellingPrice !== undefined && detail.unitSellingPrice !== null && detail.unitSellingPrice !== '') {
            const sellingPrice = typeof detail.unitSellingPrice === 'number' ? detail.unitSellingPrice : parseFloat(String(detail.unitSellingPrice));
            if (!isNaN(sellingPrice)) {
              cleanedDetail.unitSellingPrice = sellingPrice;
            }
          }

          // Handle partNo - convert to ObjectId string if it's an object
          if (detail.partNo) {
            if (typeof detail.partNo === 'object' && detail.partNo !== null && detail.partNo._id) {
              cleanedDetail.partNo = detail.partNo._id;
            } else if (typeof detail.partNo === 'string' && detail.partNo.trim() !== '') {
              cleanedDetail.partNo = detail.partNo.trim();
            }
          }

          // Only include _id if it's a valid MongoDB ObjectId (not a temporary ID)
          // MongoDB ObjectIds are 24 hex characters
          if (detail._id && typeof detail._id === 'string' && !detail._id.startsWith('temp-')) {
            // Check if it's a valid ObjectId format (24 hex characters)
            if (/^[0-9a-fA-F]{24}$/.test(detail._id)) {
              cleanedDetail._id = detail._id;
            }
          }

          return cleanedDetail;
        })
      };

      return cleanedItem;
    });
  }

  onCreatePartNumber(): void {
    const dialogRef = this._dialog.open(CreateProductComponent, {
      width: '650px',
      disableClose: true,
      maxHeight: '90vh',
      autoFocus: false
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result?.partNo && result?._id) {
        const option: PartNumberDropdownOption = {
          label: this.composePartNumberLabel({
            partNo: result.partNo,
            productDescription: result.productDescription
          }),
          value: result._id,
          data: {
            _id: result._id,
            partNo: result.partNo,
            productDescription: result.productDescription
          }
        };
        const filtered = this.partNumberOptions().filter(opt => opt.value !== option.value);
        this.partNumberOptions.set([option, ...filtered]);
        this.loadPartNumbers();
      }
    });
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }
}
