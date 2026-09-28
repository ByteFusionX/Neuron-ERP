import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, computed, effect, EventEmitter, HostBinding, inject, Input, OnDestroy, OnInit, Output, signal, untracked } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { PurchaseService } from 'src/app/core/services/purchase/purchase.service';
import { MrRequestComponent } from '../mr-request/mr-request.component';
import { MaterialRequestModalComponent } from '../material-request-modal/material-request-modal.component';
import { getJob } from 'src/app/shared/interfaces/job.interface';
import { JobService } from 'src/app/core/services/job/job.service';
import { ToastrService } from 'ngx-toastr';
import { Subscription } from 'rxjs';
import { MrDetails, QuoteItem, QuoteItemDetails, ProductPartNumber } from 'src/app/shared/interfaces/purchase.interface';
import { ProductService, PartNumberOption } from 'src/app/core/services/product/product.service';
import { ProductFormDrawerComponent } from 'src/app/modules/products/pages/product-form-drawer/product-form-drawer.component';
import { ComparisonSheetComponent } from '../comparison-sheet/comparison-sheet.component';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { SupplierService } from 'src/app/core/services/supplier.service';
import { ModalService } from 'src/app/shared/components/modal';
import { SmartFormModule, SfOption } from 'src/app/shared/components/smart-form';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { DetailBadgeComponent } from 'src/app/shared/components/detail-panel/detail-badge.component';
import { DetailFieldComponent } from 'src/app/shared/components/detail-panel/detail-field.component';
import { DetailPanelIconComponent } from 'src/app/shared/components/detail-panel/detail-panel-icon.component';
import { ItemEntryComponent, ItemEntryOptionValue } from 'src/app/shared/components/item-entry';
import {
  DetailViewBadge,
  DetailViewBreadcrumb,
  DetailViewShellComponent,
  DetailViewStat,
} from 'src/app/shared/components/detail-view-shell/detail-view-shell.component';

interface PartNumberDropdownOption {
  label: string;
  value: string;
  data: PartNumberOption;
}

@Component({
  selector: 'app-create-purchase',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    ProductFormDrawerComponent,
    ComparisonSheetComponent,
    SmartFormModule,
    DetailViewShellComponent,
    ActionButtonComponent,
    DetailBadgeComponent,
    DetailFieldComponent,
    DetailPanelIconComponent,
    ItemEntryComponent,
  ],
  templateUrl: './create-purchase.component.html',
  styleUrl: './create-purchase.component.css',
})
export class CreatePurchaseComponent implements OnInit, AfterViewInit, OnDestroy {
  /** Renders the create form in a slide-over instead of as a page. The host mounts it per opening. */
  @Input() drawer = false;
  /** Drawer mode: job to preselect (replaces the `jobId` query param of the page). */
  @Input() initialJobId: string | null = null;
  /** Drawer mode: start as a general purchase (replaces the `withoutJob` query param). */
  @Input() withoutJob = false;
  /** Drawer mode: an existing PR to edit (replaces the `/purchase/edit/:id` route param). */
  @Input() editPurchaseId: string | null = null;
  /** Drawer mode: a PR was created or saved as a draft, so the list should reload. */
  @Output() saved = new EventEmitter<void>();
  /** Drawer mode: the slide-out animation finished; the host can unmount. */
  @Output() closed = new EventEmitter<void>();

  @HostBinding('style.display') get hostDisplay(): string | null {
    return this.drawer ? 'contents' : null;
  }

  private fb = inject(FormBuilder);
  private modal = inject(ModalService)
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
  suppliersList = signal<any[]>([]);

  // header / view model
  breadcrumbs: DetailViewBreadcrumb[] = [{ label: 'Home', link: '/' }, { label: 'Purchase' }, { label: 'PR', link: '/purchase/pr' }];
  badges = signal<DetailViewBadge[]>([]);
  headerSubtitle = signal<string>('');
  stats = signal<DetailViewStat[]>([]);
  jobOptions = computed<SfOption[]>(() => this.jobSheets().map((j: any) => ({ label: j.jobId, value: j._id, description: j.clientDetails?.companyName })));
  supplierOptions = computed<SfOption[]>(() => this.suppliersList().map((s) => ({ label: s.supplierName, value: s._id })));
  itemCount = computed(() => this.itemsList().reduce((n, item: any) => n + (item.itemDetails?.length || 0), 0));

  // --- Item entry ----------------------------------------------------------------------
  // Integration boundary: `itemsList` (and `saveItemsToBackend`) stays the source of truth because the
  // comparison sheet, MR linkage and supplier discounts all key off the saved item records. The
  // shared editor gets its own option → items → details array seeded from that list; every line
  // carries a `lineKey` so an edited/reordered/removed line can be mapped back to its saved record.

  entryForm: FormGroup = this.fb.group({ optionalItems: this.fb.array([]) });
  get entryItems(): FormArray { return this.entryForm.get('optionalItems') as FormArray; }
  liveTotalLpo = signal<number>(0);

  /** A new list means the editor reseeds from it, so whatever it held is no longer unsaved work. */
  private resetEntryDirty = effect(() => {
    this.itemsList();
    untracked(() => this.entryItems.markAsPristine());
  });

  entrySeed = computed<ItemEntryOptionValue[]>(() => [{
    totalDiscount: null,
    items: this.itemsList().map((item: any, i: number) => ({
      itemName: item.itemName || '',
      itemDetails: (item.itemDetails || []).map((d: any, j: number) => ({
        itemCode: d.itemCode || '',
        partNo: this.getPartNumberValue(d.partNo),
        detail: d.detail || '',
        quantity: d.quantity ?? null,
        unitCost: d.unitCost ?? null,
        unitSellingPrice: d.unitSellingPrice ?? null,
        availability: d.availability || '',
        supplierId: d.supplierId || null,
        uom: d.uom || '',
        lineKey: this.lineKeyOf(i, j, d),
      })),
    })),
  }]);

  private originalsByKey = computed(() => {
    const map = new Map<string, any>();
    this.itemsList().forEach((item: any, i: number) =>
      (item.itemDetails || []).forEach((d: any, j: number) => map.set(this.lineKeyOf(i, j, d), d)));
    return map;
  });

  private lineKeyOf(i: number, j: number, detail: any): string {
    return detail?._id || `idx-${i}-${j}`;
  }

  private originalAt(i: number, j: number, k: number): any | undefined {
    const items = this.entryItems.at(i)?.get('items') as FormArray | null;
    const details = items?.at(j)?.get('itemDetails') as FormArray | null;
    const key = details?.at(k)?.get('lineKey')?.value;
    return key ? this.originalsByKey().get(key) : undefined;
  }

  /** Deal-sheet lines are fixed on a job-linked PR; only lines added here stay editable. */
  lineLocked = (i: number, j: number, k: number): boolean => {
    if (this.isJobLess) return false;
    const original = this.originalAt(i, j, k);
    return !!original && !original.isNewlyAdded;
  };

  lineBadge = (i: number, j: number, k: number): string | null =>
    this.originalAt(i, j, k)?.fromMrRequest ? 'MR' : null;

  compareLabel = (i: number, j: number, k: number): string => {
    const count = this.originalAt(i, j, k)?.comparisons?.length || 0;
    return count ? `${count} quotes` : 'Compare';
  };

  onEntryCompare({ i, j, k }: { i: number; j: number; k: number }): void {
    this.onComparisonClicks(this.originalAt(i, j, k) ?? ({} as QuoteItemDetails));
  }

  private lineHasContent(d: any): boolean {
    return !!(d?.detail || '').toString().trim() || d?.quantity != null || d?.unitCost != null;
  }

  private recomputeLiveTotal(): void {
    const byKey = this.originalsByKey();
    let total = 0;
    (this.entryItems.getRawValue()?.[0]?.items || []).forEach((item: any) =>
      (item.itemDetails || []).forEach((d: any) => {
        if (d.lineKey && byKey.get(d.lineKey)?.fromMrRequest) return;
        total += (+d.quantity || 0) * (+d.unitCost || 0);
      }));
    this.liveTotalLpo.set(total);
  }

  /** Translates the editor back into the `itemsList` shape, keeping each saved line's hidden fields. */
  private collectEntryItems(): any[] | null {
    const byKey = this.originalsByKey();
    let invalid = false;
    const items: any[] = [];

    (this.entryItems.getRawValue()?.[0]?.items || []).forEach((item: any) => {
      const details = (item.itemDetails || []).filter((d: any) => this.lineHasContent(d)).map((d: any) => {
        const { lineKey, profit, ...fields } = d;
        if (!(fields.detail || '').toString().trim() || !(+fields.quantity > 0) || !(+fields.unitCost > 0)) invalid = true;
        const original = lineKey ? byKey.get(lineKey) : undefined;
        return {
          ...(original ?? { isNewlyAdded: true, merged: false, comparisons: [] }),
          ...fields,
          partNo: fields.partNo || '',
          supplierId: fields.supplierId || original?.supplierId || '',
        };
      });
      if (!details.length) return;
      const itemName = (item.itemName || '').toString().trim() || details[0].detail || 'Item';
      items.push({ itemName, itemDetails: details });
    });

    if (invalid) {
      this.toaster.warning('Please fill all required fields!');
      return null;
    }
    return items;
  }

  /** Pulls unsaved editor changes into `itemsList` before a whole-form save. */
  private syncEntryToList(): boolean {
    if (!this.entryItems.dirty) return true;
    const items = this.collectEntryItems();
    if (!items) return false;
    this.itemsList.set(items);
    this.updateTotalLpo();
    this.entryItems.markAsPristine();
    return true;
  }

  onSaveEntryItems(): void {
    const items = this.collectEntryItems();
    if (!items) return;
    this.itemsList.set(items);
    this.updateTotalLpo();
    this.entryItems.markAsPristine();
    this.saveItemsToBackend(items);
  }

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
    this.isEditing = !!this.editPurchaseId || (!this.drawer && url.includes('edit'));

    if (this.isEditing) {
      this.purchaseId = this.drawer ? this.editPurchaseId : <string>this.route.snapshot.paramMap.get('id');
      this.loadPurchaseData();
    } else {
      this.purchaseForm.reset();
      this.getPurchaseNo();
      
      const jobId = this.drawer ? this.initialJobId : this.route.snapshot.queryParamMap.get('jobId');
      if (jobId) {
        this.requestedJobId.set(jobId);
      }

      if (this.drawer ? this.withoutJob : this.route.snapshot.queryParamMap.get('withoutJob') === 'true') {
        this.toggleJobLess(true);
      }

      this.deelSheets(jobId);
    }

    this.generatedPRId = this.generateId();
    this.loadPartNumbers();
    this.loadSuppliers();

    (this.purchaseForm.get('items') as FormArray).valueChanges.subscribe(() => {
      this.updateTotalLpo();
    });

    this.subscriptions.add(this.entryItems.valueChanges.subscribe(() => this.recomputeLiveTotal()));

    this.refreshHeader();
    this.subscriptions.add(this.purchaseForm.valueChanges.subscribe(() => this.refreshHeader()));
  }

  ngAfterViewInit(): void {
    // Mounted closed and opened on the next tick so the drawer slides in instead of appearing.
    if (this.drawer) setTimeout(() => (this.drawerShown = true));
  }

  // --- Drawer mode -------------------------------------------------------------------

  drawerShown = false;

  drawerSubtitle(): string {
    const subtitle = this.headerSubtitle();
    const pr = this.f['purchaseNo'].value;
    return pr ? `${pr} · ${subtitle}` : subtitle;
  }

  /** Items auto-save to a server draft, so only an unsaved pick or a half-typed row counts as dirty. */
  isDrawerDirty(): boolean {
    return this.entryItems.dirty || (!this.purchaseId && (!!this.requestedJobId() || this.itemCount() > 0));
  }

  closeDrawer(): void {
    if (!this.drawerShown) return;
    this.drawerShown = false;
    // A draft may already exist (items auto-save), so let the list pick it up.
    if (this.purchaseId) this.saved.emit();
    setTimeout(() => this.closed.emit(), 250);
  }

  /** After create/draft: the page returns to the list, the drawer just closes over it. */
  private backToList(): void {
    if (this.drawer) {
      this.saved.emit();
      this.closeDrawer();
      return;
    }
    this.router.navigate(['/purchase/pr'], this.isJobLess ? { queryParams: { view: 'general' } } : {});
  }

  /** Header badges/stats; kept in signals so the shell's inputs only change when the form does. */
  private refreshHeader(): void {
    const v = this.purchaseForm.getRawValue();
    const total = this.calculateTotalLpo();
    const money = `${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${this.currency()}`.trim();
    const status = v.status || (this.isEditing ? '' : 'New');
    const tones: Record<string, DetailViewBadge['tone']> = { Pending: 'warn', Approved: 'good', Rejected: 'bad', Drafted: 'neutral', New: 'info' };

    this.badges.set([
      ...(status ? [{ label: status, tone: tones[status] ?? 'neutral' }] : []),
      ...(this.isJobLess ? [{ label: 'General purchase', tone: 'info' as const }] : []),
    ]);
    this.headerSubtitle.set(this.isJobLess
      ? (this.suppliersList().find((s) => s._id === v.supplierId)?.supplierName || 'No supplier selected')
      : (v.customer || 'No job selected'));
    this.stats.set(this.isJobLess
      ? [
          { label: 'PR No', value: v.purchaseNo || '—' },
          { label: 'Items', value: String(this.itemCount()) },
          { label: 'Total LPO value', value: money },
        ]
      : [
          { label: 'PR No', value: v.purchaseNo || '—' },
          { label: 'Job ID', value: this.isEditing ? (v.jobId || '—') : (this.selectedJobSheet as any)?.jobId || '—' },
          { label: 'Deal sheet', value: v.dealSheetId || '—' },
          { label: 'Items', value: String(this.itemCount()) },
          { label: 'Total LPO value', value: money },
        ]);
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
    if (!this.syncEntryToList()) return;
    this.purchaseForm.get('status')?.setValue('Pending')
    if (this.isEditing) {
      this.onEditSubmits()
    } else {
      this.sendToService()
    }
  }

  onDraftClicks() {
    if (!this.syncEntryToList()) return;
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
            this.backToList();
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
            this.backToList();
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
            this.backToList();
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
            this.backToList();
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
    if (this.drawer) {
      this.closeDrawer();
      return;
    }
    const isJobLess = this.isJobLess;
    this.purchaseForm.reset()
    this.itemsList.set([])
    this.router.navigate(['/purchase/pr'], isJobLess ? { queryParams: { view: 'general' } } : {})
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
      const dialogRef = this.modal.open<{ success: boolean }>(MrRequestComponent, {
        width: '560px',
        closeOnBackdrop: false,
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
      const dialogRef = this.modal.open<{ success: boolean }>(MaterialRequestModalComponent, {
        width: '880px',
        closeOnBackdrop: false,
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
    if (!selected) return;
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
      // Stacked drawer instead of navigating away, so this form isn't lost mid-edit.
      this.comparisonDrawerPurchaseId = purchaseId;
      this.comparisonDrawerItemId = item._id!;
      this.comparisonDrawerOpen = true;
    }).catch(() => {});
  }

  // --- Comparison sheet drawer -------------------------------------------------------

  comparisonDrawerOpen = false;
  comparisonDrawerPurchaseId: string | null = null;
  comparisonDrawerItemId: string | null = null;

  onComparisonDrawerSaved(): void {
    if (this.purchaseId) this.loadPurchaseData();
  }

  onComparisonDrawerClosed(): void {
    this.comparisonDrawerOpen = false;
    this.comparisonDrawerPurchaseId = null;
    this.comparisonDrawerItemId = null;
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

  updateTotalLpo() {
    this.purchaseForm.get('totalLpo')?.setValue(this.calculateTotalLpo(), { emitEvent: false });
  }

  get f() {
    return this.purchaseForm.controls;
  }

  onAddColumnClicks() {
    const itemsArray = this.purchaseForm.get('items') as FormArray;
    itemsArray.push(this.createQuoteItemGroup());
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
            if (this.drawer) {
              this.saved.emit();
              this.closeDrawer();
            } else {
              this.router.navigate(['/purchase/view-purchase', this.purchaseId]);
            }
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

  private composePartNumberLabel(option: { partNo?: string; productDescription?: string; brand?: string }): string {
    const code = option.partNo || '';
    const description = option.productDescription || '';
    const brandName = option.brand || '';
    const details = [brandName, description].filter(Boolean).join(' - ');
    return details ? `${code} (${details})` : code;
  }

  getPartNumberValue(partNo: any): string {
    if (!partNo) return '';
    if (typeof partNo === 'string') return partNo;
    return partNo._id || '';
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

  createProductOpen = false;
  createProductPrefill: { productSegment?: string; productCategoryName?: string; productDescription?: string } | null = null;

  onCreatePartNumber(): void {
    this.createProductPrefill = null;
    this.createProductOpen = true;
  }

  onProductCreated(result: any): void {
    if (!result?.partNo || !result?._id) return;
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

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }
}
