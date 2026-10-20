import { CommonModule } from '@angular/common';
import { NgIcon } from '@ng-icons/core';
import { AfterViewInit, Component, computed, effect, EventEmitter, HostBinding, inject, Input, OnDestroy, OnInit, Output, signal, untracked } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { PurchaseService } from 'src/app/core/services/purchase/purchase.service';
import { MrRequestComponent } from '../mr-request/mr-request.component';
import { MaterialRequestModalComponent } from '../material-request-modal/material-request-modal.component';
import { getJob } from 'src/app/shared/interfaces/job.interface';
import { JobService } from 'src/app/core/services/job/job.service';
import { ToastrService } from 'ngx-toastr';
import { SalesRfqService } from 'src/app/core/services/sales-rfq/sales-rfq.service';
import { Subscription } from 'rxjs';
import { MrDetails, QuoteItem, QuoteItemDetails, ProductPartNumber } from 'src/app/shared/interfaces/purchase.interface';
import { ProductService, PartNumberOption } from 'src/app/core/services/product/product.service';
import { PrCompareDrawerComponent } from '../pr-compare-drawer/pr-compare-drawer.component';
import { SupplierDiscountComponent } from '../supplier-discount/supplier-discount.component';
import { SalesRfqCreateDrawerComponent } from 'src/app/modules/sales-rfq/pages/sales-rfq-create-drawer/sales-rfq-create-drawer.component';
import { ProductFormDrawerComponent } from 'src/app/modules/products/pages/product-form-drawer/product-form-drawer.component';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { SupplierService } from 'src/app/core/services/supplier.service';
import { ModalService } from 'src/app/shared/components/modal';
import { SmartFormModule, SfOption } from 'src/app/shared/components/smart-form';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { DetailBadgeComponent } from 'src/app/shared/components/detail-panel/detail-badge.component';
import { ItemEntryOptionValue } from 'src/app/shared/components/item-entry';
import { LineSupplierOffer } from 'src/app/shared/components/item-entry/item-entry.component';
import { SalesRfqComparison } from 'src/app/shared/interfaces/sales-rfq.interface';
import { PrFormComponent } from './pr-form/pr-form.component';
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
    SmartFormModule,
    DetailViewShellComponent,
    ActionButtonComponent,
    NgIcon,
    DetailBadgeComponent,
    PrFormComponent,
    PrCompareDrawerComponent,
    SupplierDiscountComponent,
    SalesRfqCreateDrawerComponent,
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
  /** Drawer/page launch can own the source mode, so users do not switch between PR and General mid-form. */
  @Input() sourceLocked = false;
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
  private salesRfqService = inject(SalesRfqService)
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
        // A reopened draft/PR keeps the supplier on the selected comparison when the line itself has none.
        supplierId: d.supplierId?._id || d.supplierId || (d.comparisons || []).find((c: any) => c.selected)?.supplierId || d.comparisons?.[0]?.supplierId || null,
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

  /** Awarded lines stay editable; nothing is locked in the PR item entry. */
  lineLocked = (_i: number, _j: number, _k: number): boolean => false;

  /** For the item form's "Not awarded" filter: the line's saved copy says whether a supplier won it. */
  lineAwarded = (line: any): boolean => {
    const saved = line?.lineKey ? this.originalsByKey().get(line.lineKey) : undefined;
    return !!saved && this.isAwardedLine(saved);
  };

  private isAwardedLine(detail: any): boolean {
    const won = (detail?.comparisons || []).filter((c: any) => c.selected);
    if (!won.length) return false;
    // A line split between suppliers is awarded once their shares add up to its quantity.
    if (!won.some((c: any) => c.awardedQty)) return true;
    const total = won.reduce((sum: number, c: any) => sum + (+c.awardedQty || +detail.quantity || 0), 0);
    return total + 0.0001 >= (+detail.quantity || 0);
  }

  /** The supplier RFQs of this request side by side; feeds the supplier pills under each line. */
  private comparison = signal<SalesRfqComparison | null>(null);

  private loadComparison(): void {
    if (!this.purchaseId) return;
    this.subscriptions.add(this.salesRfqService.comparePurchase(this.purchaseId).subscribe({
      next: (res) => this.comparison.set(res.data),
      error: () => this.comparison.set(null),
    }));
  }

  private offersByLine = computed(() => {
    const map = new Map<string, LineSupplierOffer[]>();
    const data = this.comparison();
    if (!data) return map;
    const columns = new Map(data.rfqs.map((c) => [c._id, c]));
    for (const row of data.rows) {
      for (const cell of row.cells) {
        const column = columns.get(cell.rfqId);
        if (!column) continue;
        const priced = !!cell.quote && cell.quote.availability !== 'Unavailable' && cell.quote.unitPrice != null;
        const list = map.get(cell.lineKey) ?? [];
        list.push({
          supplierId: column.supplierId,
          supplierName: column.supplierName,
          state: cell.quote?.selected ? 'awarded' : priced ? 'priced' : 'waiting',
          price: cell.quote?.unitPrice ?? null,
          rfqId: cell.rfqId,
          quoteId: cell.quote?._id,
        });
        map.set(cell.lineKey, list);
      }
    }
    return map;
  });

  /** RFQ suppliers of a line, plus its current supplier from the job sheet when that supplier has no RFQ for it yet. */
  lineOffers = (line: any): LineSupplierOffer[] => {
    // Called for every line on every change detection pass: hand back the same array until the inputs change.
    const cache = this.offerCache();
    const key = `${line?.lineKey ?? ''}|${line?.supplierId ?? ''}`;
    const hit = cache.get(key);
    if (hit) return hit;
    const offers = [...(this.offersByLine().get(line?.lineKey) ?? [])];
    const have = (id?: string, name?: string) => offers.some((o) => (id && o.supplierId === id) || o.supplierName === name);
    const add = (id: string | undefined, name: string | undefined) => {
      if (name && !have(id, name)) offers.push({ supplierId: id, supplierName: name, state: 'none' });
    };
    const label = (id?: string) => (id ? this.supplierOptions().find((o) => o.value === id)?.label : undefined);
    // Deal sheet suppliers on the saved line, then the line's current supplier, then suppliers from earlier RFQs for the product.
    const saved = line?.lineKey ? this.originalsByKey().get(line.lineKey) : undefined;
    (saved?.comparisons || []).forEach((c: any) => add(c.supplierId ? String(c.supplierId) : undefined, c.supplierName || label(String(c.supplierId))));
    add(line?.supplierId, label(line?.supplierId));
    (this.comparison()?.previousSuppliers?.[line?.lineKey] ?? []).forEach((s) => add(s.supplierId, s.supplierName));
    cache.set(key, offers);
    return offers;
  };

  /** Fresh (empty) whenever the RFQ offers or the supplier list change. */
  private offerCache = computed(() => {
    this.offersByLine();
    this.supplierOptions();
    return new Map<string, LineSupplierOffer[]>();
  });

  rfqLineKeys: string[] = [];
  rfqFocus: { supplierId?: string; supplierName: string; lineKey: string } | null = null;

  onOfferPicked(event: { lineKey: string; offer: LineSupplierOffer }): void {
    const { lineKey, offer } = event;
    if (offer.state === 'awarded') return;
    if (offer.state === 'priced' && offer.rfqId && offer.quoteId) {
      this.salesRfqService.awardPurchase(this.purchaseId!, [{ rfqId: offer.rfqId, lineKey, quoteId: offer.quoteId }]).subscribe({
        next: () => {
          this.toaster.success(`${offer.supplierName} selected for the line`, 'Supplier');
          this.loadPurchaseData();
        },
        error: (err) => this.toaster.error(err?.error?.message || 'Could not select this supplier. Use Compare & award.'),
      });
      return;
    }
    // No price yet, or no RFQ: continue in the supplier RFQ tab (a missing supplier gets its own tab there).
    this.whenSaved(() => {
      const real = !!lineKey && !lineKey.startsWith('idx-');
      this.rfqLineKeys = [];
      this.rfqFocus = real && offer.supplierId ? { supplierId: offer.supplierId, supplierName: offer.supplierName, lineKey } : null;
      this.rfqOpen = true;
    });
  }

  lineBadge = (i: number, j: number, k: number): string | null =>
    this.originalAt(i, j, k)?.fromMrRequest ? 'MR' : null;

  private lineHasContent(d: any): boolean {
    return !!(d?.detail || '').toString().trim() || d?.quantity != null || d?.unitCost != null;
  }

  /** "Items" lists every line; each supplier tab narrows the same lines to those that supplier is asked about. */
  activeTab = 'items';
  private addedSuppliers = signal<string[]>([]);
  private lineTick = signal(0);

  supplierTabs = computed<{ id: string; name: string; count: number }[]>(() => {
    this.lineTick();
    const counts = new Map<string, number>();
    const items = this.entryItems.getRawValue()?.[0]?.items || [];
    items.forEach((item: any) => (item.itemDetails || []).forEach((d: any) => {
      const ids = new Set<string>();
      if (d.supplierId) ids.add(String(d.supplierId));
      this.lineOffers(d).forEach((o) => o.supplierId && ids.add(o.supplierId));
      ids.forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1));
    }));
    this.addedSuppliers().forEach((id) => counts.has(id) || counts.set(id, 0));
    const name = (id: string) => this.supplierOptions().find((o) => o.value === id)?.label || 'Supplier';
    return [...counts].map(([id, count]) => ({ id, name: name(id), count }));
  });

  onSupplierTabAdded(id: string): void {
    if (!id) return;
    if (!this.addedSuppliers().includes(id)) this.addedSuppliers.update((l) => [...l, id]);
    this.activeTab = id;
  }

  private recomputeLiveTotal(): void {
    this.lineTick.update((n) => n + 1);
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
        if (!(fields.detail || '').toString().trim() || !(+fields.quantity > 0)) invalid = true;
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
    const supplierIdControl = this.purchaseForm.get('supplierId');

    if (isJobLess) {
      jobIdControl?.clearValidators();
      dealSheetIdControl?.clearValidators();
      customerIdControl?.clearValidators();
      supplierIdControl?.clearValidators();
      this.loadCurrentEmployeeName();
    } else {
      jobIdControl?.setValidators([Validators.required]);
      dealSheetIdControl?.setValidators([Validators.required]);
      customerIdControl?.setValidators([Validators.required]);
      supplierIdControl?.clearValidators();
    }

    if (isJobLess && this.itemsList().length === 0) {
      this.onAddColumnClicks();
    }
    jobIdControl?.updateValueAndValidity();
    dealSheetIdControl?.updateValueAndValidity();
    customerIdControl?.updateValueAndValidity();
    supplierIdControl?.updateValueAndValidity();
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
  /** Widens the drawer to the full viewport for the item table. */
  fullView = false;

  drawerSubtitle(): string {
    const subtitle = this.headerSubtitle();
    const pr = this.f['purchaseNo'].value;
    return pr ? `${pr} · ${subtitle}` : subtitle;
  }

  formTitle(): string {
    if (this.isJobLess) return this.isEditing ? 'Edit general purchase' : 'New general purchase';
    return this.isEditing ? 'Edit purchase requisition' : 'New purchase requisition';
  }

  sourceTitle(): string {
    return this.isJobLess ? 'General purchase' : 'Job purchase';
  }

  sourceSubtitle(): string {
    return this.isJobLess
      ? 'Create a supplier purchase that is not tied to a job.'
      : 'Create from an approved job so deal sheet items, customer and pricing stay linked.';
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
    this.router.navigate([this.isJobLess ? '/purchase/po/general' : '/purchase/pr']);
  }

  /** Header badges/stats; kept in signals so the shell's inputs only change when the form does. */
  private refreshHeader(): void {
    const v = this.purchaseForm.getRawValue();
    const total = this.calculateTotalLpo();
    const money = `${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${this.currency()}`.trim();
    const status = v.status || (this.isEditing ? '' : 'New');
    const tones: Record<string, DetailViewBadge['tone']> = { Pending: 'warn', Approved: 'good', Rejected: 'bad', Drafted: 'neutral', New: 'info', 'In Progress': 'info' };

    this.badges.set([
      ...(status ? [{ label: status, tone: tones[status] ?? 'neutral' }] : []),
      ...(this.isJobLess ? [{ label: 'General purchase', tone: 'info' as const }] : []),
    ]);
    this.headerSubtitle.set(this.isJobLess
      ? (this.suppliersList().find((s) => s._id === v.supplierId)?.supplierName || 'Supplier chosen through RFQs')
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

    this.loadComparison();
    this.subscriptions.add(
      this.purchaseService.getPurchaseById(this.purchaseId).subscribe({
        next: (res) => {
          if (res.data) {
            const purchase = res.data;
            this.isJobLess = purchase.sourceType === 'manual' || !purchase.jobId;

            if (this.isJobLess) {
              const jobIdControl = this.purchaseForm.get('jobId');
              const dealSheetIdControl = this.purchaseForm.get('dealSheetId');
              const customerIdControl = this.purchaseForm.get('customerId');
              const supplierIdControl = this.purchaseForm.get('supplierId');
              jobIdControl?.clearValidators();
              dealSheetIdControl?.clearValidators();
              customerIdControl?.clearValidators();
              supplierIdControl?.clearValidators();
              jobIdControl?.updateValueAndValidity();
              dealSheetIdControl?.updateValueAndValidity();
              customerIdControl?.updateValueAndValidity();
              supplierIdControl?.updateValueAndValidity();
            }

            this.purchaseForm.patchValue({
              customerId: purchase.customerId?._id || purchase.customerId,
              supplierId: purchase.supplierId?._id || purchase.supplierId || '',
              salesManager: `${(purchase.quoteCreatedBy ?? purchase.createdBy)?.firstName || ''} ${(purchase.quoteCreatedBy ?? purchase.createdBy)?.lastName || ''}`.trim(),
              purchaseNo: purchase.purchaseNo,
              jobId: purchase.jobId?.jobId || '',
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

            const purchaseJobId = purchase.jobId?._id || purchase.jobId;
            if (purchaseJobId) {
              this.jobService.getOneJob(purchaseJobId).subscribe({
                next: (jobRes) => {
                  if (jobRes && jobRes.length > 0) {
                    this.selectedJobSheet = jobRes[0];
                    this.purchaseForm.get('jobId')?.setValue(jobRes[0].jobId || '');
                    this.refreshHeader();
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

  /** Stops an empty or half-filled request from being sent for approval. Returns true when it can go. */
  private canSubmitForApproval(): boolean {
    // The reactive form still carries a stale items array, so its overall validity is not a reliable gate; check the fields that matter.
    this.purchaseForm.get('supplierId')?.markAsTouched();
    this.purchaseForm.get('job')?.markAsTouched();
    if (!this.isJobLess && !(this.purchaseForm.get('job')?.value || this.purchaseForm.get('jobId')?.value)) {
      this.toaster.error('Select a job before submitting');
      return false;
    }
    const lines = this.itemsList().flatMap((item: any) => item.itemDetails || []);
    if (!lines.some((d: any) => String(d.detail || '').trim() && Number(d.quantity) > 0)) {
      this.toaster.error('Add at least one item with a description and a quantity before submitting');
      return false;
    }
    if (lines.some((d: any) => Number(d.quantity) < 0 || Number(d.unitCost) < 0)) {
      this.toaster.error('Quantities and costs cannot be negative');
      return false;
    }
    return true;
  }

  onSubmit(): void {
    if (!this.syncEntryToList()) return;
    if (!this.canSubmitForApproval()) return;
    if (!this.allAwarded) {
      this.toaster.error('Award every product in Compare & award before sending for approval');
      return;
    }
    this.purchaseForm.get('status')?.setValue('Pending')
    if (this.isEditing) {
      this.onEditSubmits()
    } else {
      this.sendToService()
    }
  }

  /** There is no Draft status: a saved-but-unsubmitted PR is In Progress, and one that was cancelled stays New. */
  private get draftStatus(): 'In Progress' {
    return 'In Progress';
  }

  /** Save is offered on a new request and on one still being prepared, never on a submitted or rejected one. */
  get canSaveDraft(): boolean {
    return !this.isEditing || ['New', 'In Progress', 'Drafted'].includes(this.purchaseForm.get('status')?.value);
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
    formValue.status = this.draftStatus;

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
    formValue.status = this.draftStatus;

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
            this.toaster.success('Purchase request submitted for approval');
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
    this.router.navigate([isJobLess ? '/purchase/po/general' : '/purchase/pr'])
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
      jobId: job.jobId,
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
            // The Deal Sheet supplier is only a default; the PR has to award each line itself.
            selected: false,
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
      formValue.status = this.draftStatus;

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

  compareOpen = false;

  /** Every product line has an awarded supplier offer; only then can the request go for approval. */
  get allAwarded(): boolean {
    const lines = this.itemsList().flatMap((item: any) => item.itemDetails || []).filter((d: any) => Number(d.quantity) > 0);
    return lines.length > 0 && lines.every((d: any) => this.isAwardedLine(d));
  }

  /** Awarded vs total product lines, for the Compare & award counter and the submit hint. */
  get awardStats(): { awarded: number; total: number } {
    const lines = this.itemsList().flatMap((item: any) => item.itemDetails || []).filter((d: any) => Number(d.quantity) > 0);
    return { awarded: lines.filter((d: any) => this.isAwardedLine(d)).length, total: lines.length };
  }

  /** Why Submit for approval is disabled, or null when it can go. */
  get submitBlockedReason(): string | null {
    const { awarded, total } = this.awardStats;
    if (!total) return 'Add at least one line';
    if (awarded < total) return `${total - awarded} line${total - awarded === 1 ? '' : 's'} not awarded`;
    return null;
  }

  /** Progress strip: Items -> RFQ sent -> Offers in -> Awarded -> Submitted. */
  get flowSteps(): { label: string; done: boolean }[] {
    const data = this.comparison();
    const rfqSent = !!data?.rfqs?.length;
    const offersIn = !!data?.rows?.some((r) => r.cells.some((c) => !!c.quote && c.quote.unitPrice != null));
    const status = this.f['status']?.value;
    const submitted = !!status && !['New', 'In Progress', 'Drafted'].includes(status);
    return [
      { label: 'Items', done: this.awardStats.total > 0 },
      { label: 'RFQ sent', done: rfqSent || submitted },
      { label: 'Offers in', done: offersIn || submitted },
      { label: 'Awarded', done: this.allAwarded || submitted },
      { label: 'Submitted', done: submitted },
    ];
  }

  /** Saves unsaved edits (and the draft itself) so the RFQs can point at saved lines, then runs `next`. */
  private whenSaved(next: (purchaseId: string) => void): void {
    if (!this.isJobLess && !this.selectedJobSheet) {
      this.warningMessage('Please select any job from given list');
      return;
    }
    const proceed = () => this.ensurePurchaseId().then(next).catch(() => {});
    if (!this.entryItems.dirty) {
      proceed();
      return;
    }
    const items = this.collectEntryItems();
    if (!items) return;
    this.itemsList.set(items);
    this.updateTotalLpo();
    this.entryItems.markAsPristine();
    this.saveItemsToBackend(items, (ok) => { if (ok) proceed(); });
  }

  onCompareClicks() {
    this.whenSaved(() => { this.compareOpen = true; });
  }

  /** Supplier RFQ: the request's lines are arranged under supplier tabs and saved as one RFQ per supplier. */
  rfqOpen = false;

  onSupplierRfqClicks() {
    this.whenSaved(() => { this.rfqLineKeys = []; this.rfqFocus = null; this.rfqOpen = true; });
  }

  /**
   * "Add to RFQ" in the selection bar: the ticked lines go straight onto the picked supplier's RFQ. The server adds
   * them to that supplier's live RFQ (skipping lines already on it) or raises a new one, which shows as a new tab.
   */
  onAddToRfq(pick: { supplierId: string; lineKeys: string[] }) {
    this.whenSaved((purchaseId) => {
      const due = new Date();
      due.setDate(due.getDate() + 3);
      const deadline = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}-${String(due.getDate()).padStart(2, '0')}`;
      this.salesRfqService.createFromPurchase(purchaseId, {
        suppliers: [{ supplierId: pick.supplierId, lineKeys: pick.lineKeys }],
        deadline,
      }).subscribe({
        next: (res) => {
          const rfq = res.data?.[0];
          this.toaster.success(
            rfq ? `${rfq.rfqNo} (${rfq.supplierName})${rfq.merged ? ': lines added to the existing RFQ' : ': new supplier RFQ created'}` : 'RFQ saved',
            'Supplier RFQ'
          );
          this.onRfqSaved();
        },
        error: (err) => this.toaster.error(err?.error?.message || 'Could not add the lines to the RFQ.'),
      });
    });
  }

  onRfqSaved() {
    this.loadPurchaseData();
  }

  onAwardsChanged() {
    this.loadPurchaseData();
  }

  onSupplierClicks() {
    if (!this.selectedJobSheet) {
      this.warningMessage('Please select any job from given list');
      return;
    }

    this.ensurePurchaseId().then(() => { this.discountOpen = true; }).catch(() => {});
  }

  /** Supplier discounts: edited in a drawer over the request. */
  discountOpen = false;

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

  saveItemsToBackend(updatedItemsList: any[], done?: (ok: boolean) => void): void {
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
      done?.(!!res.success);
    };
    
    if (this.purchaseId) {
      this.subscriptions.add(
        this.purchaseService.updatePurchaseItems(this.purchaseId, itemsToSave).subscribe({
          next: handleSaveResponse,
          error: (error) => {
            console.error('Error saving item:', error);
            this.toaster.error('Failed to save item');
            done?.(false);
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
              done?.(false);
            }
          })
        );
      }).catch((error) => {
        console.error('Error creating draft:', error);
        this.toaster.error('Failed to create draft purchase');
        done?.(false);
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
            supplierId: typeof detail.supplierId === 'object' && detail.supplierId !== null ? detail.supplierId._id : (detail.supplierId || ''),
            uom: detail.uom || '',
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
