import { CommonModule } from '@angular/common';
import { Component, EventEmitter, inject, Input, OnInit, Output, signal } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import * as ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { PurchaseService } from 'src/app/core/services/purchase/purchase.service';
import { SupplierService } from 'src/app/core/services/supplier.service';
import { PurchaseOrderService } from 'src/app/core/services/purchaseOrder/purchaseOrder.service';
import { GrnService } from 'src/app/core/services/grn/grn.service';
import { DeliveryNoteService } from 'src/app/core/services/delivery-note/delivery-note.service';
import { DnStatus } from 'src/app/shared/interfaces/delivery-note.interface';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { PurchaseData, QuoteItem } from 'src/app/shared/interfaces/purchase.interface';
import { ItemIssueHistoryModalComponent, ItemIssueEntry, LpoStatusEntry } from 'src/app/shared/components/item-issue-history-modal/item-issue-history-modal.component';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { PrCompareDrawerComponent } from 'src/app/modules/purchase/pages/pr-compare-drawer/pr-compare-drawer.component';
import { LpoItemEntryComponent } from 'src/app/shared/components/lpo-item-entry/lpo-item-entry.component';
import { LpoSupplierTab } from 'src/app/shared/components/lpo-item-entry/lpo-item-entry.model';
import { SfDrawerComponent } from 'src/app/shared/components/smart-form/sf-drawer.component';
import { SmartFormModule, SfOption } from 'src/app/shared/components/smart-form';
import { ProfileService } from 'src/app/core/services/profile/profile.service';
import { ConfirmDialogService } from 'src/app/shared/components/confirm-dialog/confirm-dialog.service';
import { SalesRfqService } from 'src/app/core/services/sales-rfq/sales-rfq.service';
import { proratedRfqDiscount, RfqTotalDiscount } from 'src/app/shared/utils/rfq-discount.util';

/** One line the supplier can still be ordered for, as the LPO endpoint reports it, plus the buyer's pick. */
interface IssueLine {
  item: any;
  picked: boolean;
  qty: number;
}

type ComparisonItem = ReturnType<InitiateLpoComponent['selectedComparison']>[number];

/** The confirmed items for one supplier: what goes on one LPO. */
interface SupplierGroup {
  key: string;
  supplierId?: string;
  supplierName: string;
  items: ComparisonItem[];
  total: number;
  paymentTerms: string;
  etaTerms: string;
}

@Component({
  selector: 'app-initiate-lpo',
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    SmartFormModule,
    ActionButtonComponent,
    SfDrawerComponent,
    LpoItemEntryComponent,
    PrCompareDrawerComponent
  ],
  templateUrl: './initiate-lpo.component.html'
})
export class InitiateLpoComponent implements OnInit {
  private purchaseService = inject(PurchaseService);
  private employeeService = inject(EmployeeService);
  private notificationService = inject(ToastrService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private supplierService = inject(SupplierService)
  private purchaseOrderService = inject(PurchaseOrderService);
  private salesRfqService = inject(SalesRfqService);
  private grnService = inject(GrnService);
  private deliveryNoteService = inject(DeliveryNoteService);
  private dialog = inject(MatDialog);
  compareOpen = false;
  loadingIssueHistoryFor: string | null = null;
  // LPOs/GRNs/DNs don't change between clicking "View" on different items of
  // the same purchase, so fetch them once and reuse across clicks instead of
  // re-hitting the server (LPO list + N GRN calls + DN list) every time.
  private issueHistoryCache: { lpos: any[]; grnsByLpoId: Map<string, any[]>; dns: any[] } | null = null;
  private issueHistoryCachePromise: Promise<{ lpos: any[]; grnsByLpoId: Map<string, any[]>; dns: any[] }> | null = null;

  /** Set when a list opens this as a slide-over; absent when reached through the /purchase/initiate-lpo/:id route. */
  @Input() purchaseIdInput: string | null = null;
  /** Opens on this supplier's tab (the PR drawer's POs step creates one supplier's PO at a time). */
  @Input() initialSupplierId: string | null = null;
  @Output() closed = new EventEmitter<void>();
  /** Fired on close when at least one LPO was issued, so the host list can refresh. */
  @Output('issued') issuedChange = new EventEmitter<void>();
  drawerShown = false;

  purchaseId!: string;
  purchase: PurchaseData | null = null;
  // Computed once when the purchase loads, instead of being called inline from
  // the template's *ngFor (which reran on every change-detection tick, tearing
  // down and recreating the whole row - including its click listeners - constantly).
  comparisonItems: ReturnType<InitiateLpoComponent['selectedComparison']> = [];
  /**
   * The same items grouped by the supplier sales confirmed, so each group can be checked, exported and
   * sent as one LPO. Rebuilt together with comparisonItems.
   */
  supplierGroups: SupplierGroup[] = [];
  isLoading = true;
  suppliersList = signal<any[]>([])
  supplierSelectableMap = signal<Map<string, boolean>>(new Map());
  canInitiateLPO = signal<boolean>(false);
  canReissueAndRevoke = signal<boolean>(false);
  currency = signal<string>('');


  private fb = inject(FormBuilder);
  private profileService = inject(ProfileService);
  private confirm = inject(ConfirmDialogService);

  /** 1 = pick items and issue quantities for the supplier tab, 2 = delivery, terms and notes, then issue. */
  step: 1 | 2 = 1;
  /** The supplier tab being shown. One LPO is issued per supplier. */
  activeKey = '';
  /** Lines per supplier, from the LPO endpoint so issued / pending / remaining are the server's figures. */
  private lines = new Map<string, IssueLine[]>();
  loadingLinesFor: string | null = null;
  /** Supplier records from the LPO endpoint (contact, address, canSelect), by id. */
  private poSuppliers = new Map<string, any>();

  poForm!: FormGroup;
  generatedPONumber = signal<string>('');
  isCreatingPO = signal<boolean>(false);
  termsAndConditions: any[] = [];
  placesOfDelivery: any[] = [];
  shippingTermsList: any[] = [];

  get f() {
    return this.poForm.controls;
  }

  get activeGroup(): SupplierGroup | undefined {
    return this.supplierGroups.find((g) => g.key === this.activeKey) ?? this.supplierGroups[0];
  }

  get activeSupplier(): any {
    const id = this.activeGroup?.supplierId;
    return id ? this.poSuppliers.get(id) ?? null : null;
  }

  selectSupplier(group: SupplierGroup): void {
    if (this.step !== 1) return;
    this.activeKey = group.key;
    this.ensureLines(group);
  }

  get tabs(): LpoSupplierTab[] {
    return this.supplierGroups.map((g) => ({
      key: g.key, label: g.supplierName, count: g.items.length,
      paymentTerms: g.paymentTerms, etaTerms: g.etaTerms, issuable: !!g.supplierId,
    }));
  }

  selectSupplierKey(key: string): void {
    const group = this.supplierGroups.find((g) => g.key === key);
    if (group) this.selectSupplier(group);
  }

  onHistory(line: IssueLine): void {
    this.viewItemIssueHistory({ detail: line.item.detail, partNo: this.partNoOf(line.item), quantity: line.item.originalQuantity || 0 });
  }

  linesOf(group: SupplierGroup | undefined): IssueLine[] {
    return group ? this.lines.get(group.key) ?? [] : [];
  }

  pickedLines(group: SupplierGroup | undefined): IssueLine[] {
    return this.linesOf(group).filter((l) => l.picked);
  }

  pickedCount(group: SupplierGroup): number {
    return this.pickedLines(group).length;
  }

  /** Lines that can still go on an LPO: something left to order. */
  isOpen(line: IssueLine): boolean {
    return !line.item.isIssued && (Number(line.item.remainingQuantity) || 0) > 0;
  }

  openCount(group: SupplierGroup): number {
    return this.linesOf(group).filter((l) => this.isOpen(l)).length;
  }

  allPicked(group: SupplierGroup): boolean {
    const open = this.linesOf(group).filter((l) => this.isOpen(l));
    return open.length > 0 && open.every((l) => l.picked);
  }

  togglePick(line: IssueLine): void {
    if (!this.isOpen(line)) return;
    line.picked = !line.picked;
    if (line.picked && !line.qty) line.qty = this.remainingOf(line);
  }

  togglePickAll(group: SupplierGroup): void {
    const pick = !this.allPicked(group);
    this.linesOf(group).forEach((l) => {
      if (!this.isOpen(l)) return;
      l.picked = pick;
      if (pick && !l.qty) l.qty = this.remainingOf(l);
    });
  }

  remainingOf(line: IssueLine): number {
    return Number(line.item.remainingQuantity) || 0;
  }

  unitPriceOf(line: IssueLine): number {
    return Number(line.item.comparisons?.unitPrice ?? line.item.unitPrice) || 0;
  }

  setQty(line: IssueLine, value: any): void {
    const n = value === '' || value === null ? 0 : Number(value);
    line.qty = isNaN(n) ? 0 : n;
  }

  qtyError(line: IssueLine): string | null {
    if (!line.picked) return null;
    if (!(line.qty > 0)) return 'Must be more than 0';
    if (line.qty > this.remainingOf(line)) return `Max ${this.remainingOf(line)}`;
    return null;
  }

  pickedTotal(group: SupplierGroup | undefined): number {
    return this.pickedLines(group).reduce((sum, l) => sum + l.qty * this.unitPriceOf(l), 0);
  }

  get discountedTotal(): number {
    return this.pickedTotal(this.activeGroup) - (Number(this.poForm?.value?.discount) || 0);
  }

  partNoOf(item: any): string {
    return this.formatPartNumber(item?.partNo);
  }

  private ensureLines(group: SupplierGroup | undefined, force = false): void {
    if (!group?.supplierId || (!force && this.lines.has(group.key))) return;
    const key = group.key;
    this.loadingLinesFor = key;
    this.purchaseOrderService.getItemsForPurchaseRequest(this.purchaseId, group.supplierId).subscribe({
      next: (res) => {
        const items: any[] = res?.success ? res.data || [] : [];
        // every line with something left starts ticked at its full remaining quantity
        this.lines.set(key, items.map((item) => {
          const open = !item.isIssued && (Number(item.remainingQuantity) || 0) > 0;
          return { item, picked: open, qty: open ? Number(item.remainingQuantity) || 0 : 0 };
        }));
        if (this.loadingLinesFor === key) this.loadingLinesFor = null;
      },
      error: () => {
        if (this.loadingLinesFor === key) this.loadingLinesFor = null;
        this.notificationService.error('Failed to load items for this supplier');
      },
    });
  }

  /** Each supplier's total RFQ discount, by supplier id. */
  private rfqDiscounts = new Map<string, RfqTotalDiscount>();

  /** The supplier's total RFQ discount, pro-rated to the value of this PO; the buyer can still change it. */
  discountOf(group: SupplierGroup | undefined): number {
    if (!group?.supplierId) return 0;
    return proratedRfqDiscount(this.rfqDiscounts.get(group.supplierId), this.pickedTotal(group));
  }

  /** Step 1 → 2: checks the picks, then fills the terms the supplier agreed. */
  goToTerms(): void {
    const group = this.activeGroup;
    if (!group) return;
    const picked = this.pickedLines(group);
    if (!picked.length) {
      this.notificationService.warning('Tick at least one item for this supplier');
      return;
    }
    const bad = picked.find((l) => this.qtyError(l));
    if (bad) {
      this.notificationService.error(`${bad.item.detail}: ${this.qtyError(bad)}`);
      return;
    }
    this.poForm.patchValue({ discount: this.discountOf(group) });
    this.step = 2;
  }

  backToItems(): void {
    this.step = 1;
  }

  readonly steps = [
    { n: 1 as const, label: 'Items and quantities' },
    { n: 2 as const, label: 'Delivery, terms and notes' },
  ];

  /** Stepper click: going back is free, going forward runs the step 1 checks. */
  goToStep(n: 1 | 2): void {
    if (n === this.step || this.isCreatingPO()) return;
    if (n === 1) this.backToItems();
    else this.goToTerms();
  }

  isStepValid(n: number): boolean {
    const group = this.activeGroup;
    if (n !== 1 || !group) return false;
    const picked = this.pickedLines(group);
    return picked.length > 0 && !picked.some((l) => this.qtyError(l));
  }

  private initForm(): void {
    this.poForm = this.fb.group({
      subject: ['', [Validators.required]],
      shippingTerms: ['', [Validators.required]],
      placeOfDelivery: ['', [Validators.required]],
      poDate: [new Date().toISOString().split('T')[0], [Validators.required]],
      termsAndCondition: ['', [Validators.required]],
      discount: [0, [Validators.min(0)]],
    });
  }

  private loadNotes(): void {
    this.profileService.getNotes().subscribe({
      next: (res: any) => {
        this.termsAndConditions = res?.purchaseTermsNotes || [];
        this.placesOfDelivery = res?.placeOfDelivery || [];
        this.shippingTermsList = res?.shippingTerms || [];
      },
      error: (err: any) => console.error('Error loading notes:', err),
    });
  }

  private generatePONumber(): void {
    this.purchaseOrderService.generatePONumber().subscribe({
      next: (res) => { if (res.success) this.generatedPONumber.set(res.data); },
      error: () => this.notificationService.error('Failed to generate PO number'),
    });
  }

  termsAndConditionOptions(): SfOption[] {
    return this.termsAndConditions.map((t) => ({ label: t.note, value: t._id || t.note }));
  }

  onTermsTemplate(value: string): void {
    const t = this.termsAndConditions.find((x) => (x._id || x.note) === value);
    if (t?.note) {
      this.poForm.patchValue({ termsAndCondition: t.note });
      this.poForm.markAsDirty();
    }
  }

  /** Saves new place of delivery / shipping terms values to the notes list once the LPO is issued. */
  private saveDeliveryNotes(placeOfDelivery: string, shippingTerms: string): void {
    const place = String(placeOfDelivery || '').trim();
    if (place && !this.placesOfDelivery.some((p) => p.note.toLowerCase() === place.toLowerCase())) {
      this.profileService.createPlaceOfDelivery({ note: place }).subscribe({
        next: (res: any) => { this.placesOfDelivery = res?.placeOfDelivery || this.placesOfDelivery; },
        error: (err: any) => console.error('Error saving place of delivery:', err),
      });
    }
    const terms = String(shippingTerms || '').trim();
    if (terms && !this.shippingTermsList.some((t) => t.note.toLowerCase() === terms.toLowerCase())) {
      this.profileService.createShippingTerms({ note: terms }).subscribe({
        next: (res: any) => { this.shippingTermsList = res?.shippingTerms || this.shippingTermsList; },
        error: (err: any) => console.error('Error saving shipping terms:', err),
      });
    }
  }

  joinAddress(address: any): string {
    return [address?.buildingNo, address?.location, address?.streetNo, address?.zoneNo].filter(Boolean).join(', ') || '-';
  }

  /** Step 2: creates the supplier's LPO as Pending for Approval, so it lands in the PO approvals list. */
  async issueLpo(): Promise<void> {
    const group = this.activeGroup;
    if (!group?.supplierId || this.isCreatingPO()) return;
    if (this.poForm.invalid) {
      this.poForm.markAllAsTouched();
      this.notificationService.error('Please fill in all required fields');
      return;
    }
    if (!this.generatedPONumber()) {
      this.notificationService.error('PO number not generated. Please try again.');
      this.generatePONumber();
      return;
    }
    const picked = this.pickedLines(group);
    if (!picked.length || picked.some((l) => this.qtyError(l))) {
      this.step = 1;
      return;
    }

    const { confirmed } = await this.confirm.open({
      tone: 'approve',
      title: `Issue LPO to ${group.supplierName}?`,
      message: 'The LPO goes to Purchase Orders as pending approval.',
      details: [
        { label: 'PO no', value: this.generatedPONumber() },
        { label: 'Items', value: String(picked.length) },
        { label: 'Total', value: `${this.discountedTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${this.currency()}`.trim() },
      ],
      confirmLabel: 'Issue LPO',
    });
    if (!confirmed) return;

    const form = this.poForm.value;
    const first = picked[0].item.comparisons || {};
    const payload = {
      poNo: this.generatedPONumber(),
      poStatus: 'Pending for Approval',
      items: picked.map((l) => ({
        detail: l.item.detail,
        partNo: l.item.partNo || null,
        prLineKey: l.item._id,
        quantity: l.qty,
        unitCost: this.unitPriceOf(l),
        totalCost: l.qty * this.unitPriceOf(l),
      })),
      supplierId: group.supplierId,
      purchaseId: this.purchaseId,
      jobId: (this.purchase as any)?.jobId?._id,
      quoteId: (this.purchase as any)?.quoteId?._id,
      etaTerms: first.etaTerms || '',
      paymentTerms: first.paymentTerms || '',
      shippingTerms: form.shippingTerms,
      deliveryTerms: first.etaTerms || first.paymentTerms || 'As per terms',
      placeOfDelivery: form.placeOfDelivery,
      subject: form.subject,
      poDate: new Date(form.poDate),
      termsAndCondition: form.termsAndCondition,
      discount: Number(form.discount) || 0,
    };

    this.isCreatingPO.set(true);
    this.purchaseOrderService.createPurchaseOrder(payload).subscribe({
      next: (res) => {
        this.isCreatingPO.set(false);
        if (!res?.success) {
          this.notificationService.error('Failed to create the LPO');
          return;
        }
        this.saveDeliveryNotes(form.placeOfDelivery, form.shippingTerms);
        this.notificationService.success(`LPO ${payload.poNo} sent to Purchase Orders for approval`);
        this.afterIssue(group);
      },
      error: (err) => {
        this.isCreatingPO.set(false);
        this.notificationService.error(err?.error?.message || 'Failed to create the LPO. Please try again.');
      },
    });
  }

  /** Back to step 1 with fresh figures; the next LPO gets a new number and a clean form. */
  private afterIssue(group: SupplierGroup): void {
    this.step = 1;
    this.issued = true;
    this.issueHistoryCache = null;
    this.initForm();
    this.generatePONumber();
    this.lines.clear();
    this.ensureLines(group, true);
    this.selectFirstOpenSupplier();
    this.checkSuppliersStatus();
  }

  /**
   * If the active supplier has nothing left to issue, moves to the first supplier that still has open lines.
   * Loads every supplier's lines once to find out, so the dropdown doesn't land on a fully issued supplier.
   */
  private selectFirstOpenSupplier(): void {
    const groups = this.supplierGroups.filter((g) => g.supplierId);
    if (!groups.length) return;
    const load = (g: SupplierGroup) => firstValueFrom(this.purchaseOrderService.getItemsForPurchaseRequest(this.purchaseId, g.supplierId!))
      .then((res: any) => {
        const items: any[] = res?.success ? res.data || [] : [];
        return items.map((item) => {
          const open = !item.isIssued && (Number(item.remainingQuantity) || 0) > 0;
          return { item, picked: open, qty: open ? Number(item.remainingQuantity) || 0 : 0 } as IssueLine;
        });
      })
      .catch(() => null);
    Promise.all(groups.map(load)).then((all) => {
      groups.forEach((g, i) => {
        // fresh figures; keeps the user's ticks if they already edited a loaded supplier
        const existing = this.lines.get(g.key);
        if (all[i] && (!existing || !existing.length)) this.lines.set(g.key, all[i]!);
      });
      const hasOpen = (g: SupplierGroup) => this.linesOf(g).some((l) => this.isOpen(l));
      const current = this.activeGroup;
      if (current && hasOpen(current)) return;
      const next = groups.find(hasOpen);
      if (next) this.activeKey = next.key;
    });
  }

  /** Set once an LPO went out, so the host list refreshes on close. */
  issued = false;

  get isFullyApproved(): boolean {
    const p: any = this.purchase;
    return !!p && p.status === 'Approved' && !(p.approvalStatus || []).some((a: any) => a.status === 'pending');
  }

  get statusLabel(): string {
    return this.isFullyApproved ? 'Approved' : 'Awaiting approval';
  }

  get subtitle(): string {
    const p: any = this.purchase;
    return p ? [p.customerId?.companyName, p.jobId?.jobId ? `Job ${p.jobId.jobId}` : ''].filter(Boolean).join(' · ') : '';
  }

  /** The banner's figures, shown above the item tables. */
  get banner(): { label: string; value: string }[] {
    const p: any = this.purchase;
    if (!p) return [];
    const money = (v: any) => `${(Number(v) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${this.currency()}`.trim();
    return [
      { label: 'PR no', value: String(p.purchaseNo ?? '-') },
      { label: 'Job ID', value: p.jobId?.jobId || '-' },
      { label: 'Customer', value: p.customerId?.companyName || '-' },
      { label: 'Sales person', value: [p.quoteCreatedBy?.firstName, p.quoteCreatedBy?.lastName].filter(Boolean).join(' ') || '-' },
      { label: 'Suppliers', value: String(this.supplierGroups.length) },
      { label: 'Items', value: String(this.comparisonItems.length) },
      { label: 'Cost as per PR', value: money(p.totalPRCost) },
      { label: 'LPO value of customer', value: money(p.lpoValue) },
      { label: 'Payment terms', value: this.activeGroup?.paymentTerms || '-' },
      { label: 'ETA', value: this.activeGroup?.etaTerms || '-' },
    ];
  }

  /** Mounted closed and opened on the next tick so the drawer slides in instead of appearing. */
  private openDrawer(): void {
    setTimeout(() => (this.drawerShown = true));
  }

  /** Asks first when step 2 holds typed-in terms that would be lost. */
  async requestClose(): Promise<void> {
    if (this.step === 2 && this.poForm.dirty && !this.isCreatingPO()) {
      const { confirmed } = await this.confirm.open({
        tone: 'warning',
        title: 'Discard this LPO?',
        message: 'The delivery details and terms you entered will be lost.',
        confirmLabel: 'Discard',
      });
      if (!confirmed) return;
    }
    this.closeDrawer();
  }

  closeDrawer(): void {
    if (!this.drawerShown) return;
    this.drawerShown = false;
    setTimeout(() => {
      if (this.purchaseIdInput) {
        if (this.issued) this.issuedChange.emit();
        this.closed.emit();
      }
      else this.router.navigate([(this.purchase as any)?.sourceType === 'general' ? '/purchase/general' : '/purchase/pr']);
    }, 250);
  }

  ngOnInit(): void {
    this.initForm();
    this.loadNotes();
    this.generatePONumber();
    this.openDrawer();
    this.checkPrivileges();
    this.loadPurchase()
    this.supplierService.supplierList().subscribe({
      next: (res) => {
        this.suppliersList.set(res.data)
        // Supplier names are looked up by ID inside selectedComparison(), so
        // recompute in case the purchase already loaded before suppliers did.
        if (this.purchase) {
          this.setComparisonItems(this.selectedComparison(this.purchase.items));
        }
      }, error: (error) => {
        console.log(error);
      }
    })
  }

  checkPrivileges(): void {
    this.employeeService.employeeData$.subscribe((data) => {
      if (data?.category?.privileges) {
        this.canInitiateLPO.set(data.category.privileges.purchaseOrder?.canInitiateLPO || false);
        this.canReissueAndRevoke.set(data.category.privileges.purchaseOrder?.canReissueAndRevoke || false);
        if (!this.canInitiateLPO()) {
          this.notificationService.warning('You do not have permission to initiate LPO');
          this.closeDrawer();
        }
      }
    });
  }

  loadPurchase() {
    this.purchaseId = this.purchaseIdInput || <string>this.route.snapshot.paramMap.get('id');
    if (this.purchaseId == 'none') return
    if (!this.purchaseId) {
      this.notificationService.error('Invalid Purchase ID');
      this.closeDrawer();
      return;
    }

    // Each supplier's discount on its whole RFQ, for the PO discount.
    this.salesRfqService.comparePurchase(this.purchaseId).subscribe({
      next: (res) => {
        this.rfqDiscounts.clear();
        (res?.data?.rfqs ?? []).forEach((c) => { if (c.supplierId) this.rfqDiscounts.set(String(c.supplierId), c); });
      },
      error: () => this.rfqDiscounts.clear(),
    });

    this.purchaseService.getPurchaseById(this.purchaseId).subscribe({
      next: (response) => {
        this.purchase = response.data;
        this.setComparisonItems(this.purchase ? this.selectedComparison(this.purchase.items) : []);
        if (this.purchase?.currency) {
          this.currency.set(this.purchase.currency);
        } else if (this.purchase?.jobId?.quoteId?.currency) {
          this.currency.set(this.purchase.jobId.quoteId.currency);
        } else if (this.purchase?.jobId?.quoteId?.dealData?.currency) {
          this.currency.set(this.purchase.jobId.quoteId.dealData.currency);
        }
        this.isLoading = false;
        this.checkSuppliersStatus();
      },
      error: (error) => {
        this.notificationService.error('Failed to load purchase details');
        console.error('Error loading purchase:', error);
        this.isLoading = false;
        this.closeDrawer();
      }
    });
  }

  selectedComparison(items: QuoteItem[]) {
    const result: {
      detail: string;
      partNo: string;
      quantity: number;
      supplierId?: string;
      supplierName: string;
      unitPrice: number;
      totalPrice: number;
      etaTerms: string;
      paymentTerms: string;
      isNewlyAdded?: boolean;
      merged?: boolean;
    }[] = [];

    items.forEach((item: QuoteItem) => {
      item.itemDetails.forEach(detail => {
        const selected = detail.comparisons?.find(c => c.selected);
        if (selected) {
          const supplier = this.suppliersList().find(s => s._id === selected.supplierId);
          const partNo = this.getPartNumber(detail.partNo);
          result.push({
            detail: detail.detail,
            partNo: partNo,
            quantity: selected.quantity,
            supplierId: selected.supplierId,
            supplierName: supplier?.supplierName || (selected as any).supplierName || 'Unknown Supplier',
            unitPrice: selected.unitPrice,
            totalPrice: selected.unitPrice * detail.quantity,
            etaTerms: selected.etaTerms,
            paymentTerms: selected.paymentTerms,
            isNewlyAdded: detail.isNewlyAdded,
            merged: detail.merged
          });
        }
      });
    });

    return result;
  }

  private setComparisonItems(items: ComparisonItem[]): void {
    this.comparisonItems = items;
    const groups = new Map<string, SupplierGroup>();
    items.forEach((item) => {
      const key = item.supplierId || `name:${item.supplierName}`;
      let group = groups.get(key);
      if (!group) {
        group = { key, supplierId: item.supplierId, supplierName: item.supplierName, items: [], total: 0, paymentTerms: '', etaTerms: '' };
        groups.set(key, group);
      }
      group.items.push(item);
      group.total += Number(item.totalPrice) || 0;
      group.paymentTerms = group.paymentTerms || item.paymentTerms || '';
      group.etaTerms = group.etaTerms || item.etaTerms || '';
    });
    this.supplierGroups = Array.from(groups.values()).sort((a, b) => a.supplierName.localeCompare(b.supplierName));
    const wanted = this.initialSupplierId ? this.supplierGroups.find((g) => g.supplierId === this.initialSupplierId) : undefined;
    if (wanted && !this.activeKey) this.activeKey = wanted.key;
    if (!this.supplierGroups.some((g) => g.key === this.activeKey)) this.activeKey = this.supplierGroups[0]?.key ?? '';
    this.ensureLines(this.activeGroup);
    if (!wanted) this.selectFirstOpenSupplier();
  }

  /** One sheet per supplier: the items, quantities and agreed prices to put on its LPO. */
  private addSupplierSheet(wb: ExcelJS.Workbook, group: SupplierGroup): void {
    const name = group.supplierName.replace(/[\\/*?:\[\]]/g, '').slice(0, 31) || 'Supplier';
    let sheetName = name;
    for (let i = 2; wb.getWorksheet(sheetName); i++) sheetName = `${name.slice(0, 28)} ${i}`;
    const ws = wb.addWorksheet(sheetName);
    ws.columns = [
      { key: 'no', width: 6 },
      { key: 'partNo', width: 18 },
      { key: 'detail', width: 50 },
      { key: 'qty', width: 10 },
      { key: 'price', width: 14 },
      { key: 'total', width: 16 },
      { key: 'eta', width: 18 },
    ];
    const currency = this.currency() || '';
    ws.addRow(['Purchase items for LPO']).font = { bold: true, size: 14 };
    ([
      ['Supplier', group.supplierName],
      ['Purchase ID', String(this.purchase?.purchaseNo ?? '')],
      ['Job ID', String((this.purchase as any)?.jobId?.jobId ?? '')],
      ['Payment terms', group.paymentTerms],
      ['Currency', currency],
    ] as [string, string][]).forEach(([label, value]) => {
      const row = ws.addRow([label, value]);
      row.getCell(1).font = { bold: true };
    });
    ws.addRow([]);
    const header = ws.addRow(['#', 'Part No.', 'Description', 'Qty', 'Unit price', 'Total', 'ETA']);
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.eachCell((cell) => (cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } }));
    group.items.forEach((item, i) => {
      const row = ws.addRow([i + 1, item.partNo === '-' ? '' : item.partNo, item.detail, item.quantity, item.unitPrice, item.totalPrice, item.etaTerms || '']);
      row.getCell(3).alignment = { wrapText: true, vertical: 'top' };
      row.getCell(5).numFmt = '#,##0.00';
      row.getCell(6).numFmt = '#,##0.00';
    });
    const totalRow = ws.addRow(['', '', 'Total', '', '', group.total, '']);
    totalRow.font = { bold: true };
    totalRow.getCell(6).numFmt = '#,##0.00';
  }

  private async saveWorkbook(wb: ExcelJS.Workbook, fileName: string): Promise<void> {
    const buffer = await wb.xlsx.writeBuffer();
    saveAs(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fileName.replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '_'));
  }

  async exportSupplier(group: SupplierGroup): Promise<void> {
    try {
      const wb = new ExcelJS.Workbook();
      this.addSupplierSheet(wb, group);
      await this.saveWorkbook(wb, `${this.purchase?.purchaseNo || 'purchase'}-${group.supplierName}.xlsx`);
    } catch {
      this.notificationService.error('Could not build the Excel sheet.');
    }
  }

  /** Every supplier in one workbook, a sheet each. */
  async exportAllSuppliers(): Promise<void> {
    if (!this.supplierGroups.length) return;
    try {
      const wb = new ExcelJS.Workbook();
      this.supplierGroups.forEach((group) => this.addSupplierSheet(wb, group));
      await this.saveWorkbook(wb, `${this.purchase?.purchaseNo || 'purchase'}-by-supplier.xlsx`);
    } catch {
      this.notificationService.error('Could not build the Excel sheet.');
    }
  }

  private getPartNumber(detailPartNo: any): string {
    return this.formatPartNumber(detailPartNo);
  }

  formatPartNumber(partNo: any): string {
    if (!partNo) return '-';
    if (typeof partNo === 'string') return partNo;
    if (partNo.partNo) {
      return partNo.productDescription 
        ? `${partNo.partNo}`
        : partNo.partNo;
    }
    return '-';
  }

  canIssueForSupplier(supplierId: string | undefined): boolean {
    if (!supplierId) return true;
    const map = this.supplierSelectableMap();
    return map.has(supplierId) ? map.get(supplierId)! : true;
  }

  private getLpoComment(lpo: any): string {
    if (lpo.approvedHistory && lpo.approvedHistory.length > 0) {
      const lastApproval = lpo.approvedHistory[lpo.approvedHistory.length - 1];
      if (lastApproval.reason) return lastApproval.reason;
    }
    if (lpo.rejectedHistory && lpo.rejectedHistory.length > 0) {
      const lastRejection = lpo.rejectedHistory[lpo.rejectedHistory.length - 1];
      if (lastRejection.reason) return lastRejection.reason;
    }
    return '';
  }

  private matchPartNo(grnPartNo: any, itemPartNo: any): boolean {
    const formatPartNo = (partNo: any): string => {
      if (!partNo) return '';
      if (typeof partNo === 'string') return partNo;
      if (partNo.partNo) return partNo.partNo;
      return '';
    };
    return formatPartNo(grnPartNo) === formatPartNo(itemPartNo);
  }

  private async loadIssueHistoryCache(): Promise<{ lpos: any[]; grnsByLpoId: Map<string, any[]>; dns: any[] }> {
    if (this.issueHistoryCache) return this.issueHistoryCache;
    if (this.issueHistoryCachePromise) return this.issueHistoryCachePromise;

    this.issueHistoryCachePromise = (async () => {
      const lposResponse = await firstValueFrom(
        this.purchaseOrderService.getAllPurchaseOrders({ purchaseId: this.purchaseId, row: 200 }),
      );
      const lpos = lposResponse?.success ? lposResponse.data : [];

      const grnsByLpoId = new Map<string, any[]>();
      await Promise.all(
        lpos.map(async (lpo: any) => {
          try {
            const grnResponse = await firstValueFrom(this.grnService.getAllGRNsByLpoId(lpo._id));
            grnsByLpoId.set(lpo._id, grnResponse?.success && grnResponse?.data ? grnResponse.data : []);
          } catch (error) {
            console.error('Error loading GRNs for LPO:', lpo._id, error);
            grnsByLpoId.set(lpo._id, []);
          }
        }),
      );

      // Delivery notes (Dispatch) are only linked to a Job, not to a specific
      // LPO, so they're fetched once per purchase and matched per item below.
      let dns: any[] = [];
      const jobId = this.purchase?.jobId?._id;
      if (jobId) {
        try {
          const dnResponse = await firstValueFrom(this.deliveryNoteService.getDnsByJobId(jobId));
          dns = dnResponse?.data || dnResponse?.dns || (Array.isArray(dnResponse) ? dnResponse : []);
        } catch (error) {
          console.error('Error loading delivery notes for job:', jobId, error);
        }
      }

      const cache = { lpos, grnsByLpoId, dns };
      this.issueHistoryCache = cache;
      return cache;
    })();

    try {
      return await this.issueHistoryCachePromise;
    } finally {
      this.issueHistoryCachePromise = null;
    }
  }

  async viewItemIssueHistory(item: { detail: string; partNo: string; quantity: number }) {
    if (!this.purchaseId || this.purchaseId === 'none') return;

    const itemKey = `${item.detail}-${item.partNo}`;
    this.loadingIssueHistoryFor = itemKey;

    try {
      const { lpos, grnsByLpoId, dns } = await this.loadIssueHistoryCache();

      const issues: ItemIssueEntry[] = [];
      const lpoStatuses: LpoStatusEntry[] = [];

      lpos.forEach((lpo: any) => {
        // List every LPO this item was issued on, regardless of its current
        // status (Draft through Closed), so the modal shows the full trail.
        (lpo.items || []).forEach((lpoItem: any) => {
          const partNoMatch = this.matchPartNo(lpoItem.partNo, item.partNo);
          const descriptionMatch = lpoItem.detail === item.detail;
          if (partNoMatch || descriptionMatch) {
            lpoStatuses.push({
              lpoId: lpo._id,
              purchaseId: lpo.purchaseId?._id || lpo.purchaseId || this.purchaseId,
              poNo: lpo.poNo,
              poStatus: lpo.poStatus,
              poDate: lpo.poDate,
              issuedQty: lpoItem.quantity || 0,
              comment: this.getLpoComment(lpo),
              lpo,
            });
          }
        });

        const grns = grnsByLpoId.get(lpo._id) || [];
        grns.forEach((grn: any) => {
          (grn.items || []).forEach((grnItem: any) => {
            const partNoMatch = this.matchPartNo(grnItem.partNo, item.partNo);
            const descriptionMatch = grnItem.itemDescription === item.detail;
            if (partNoMatch || descriptionMatch) {
              const receivedQty = grnItem.receivedQty || 0;
              const acceptedQty = grnItem.acceptedQty || 0;
              issues.push({
                grnNo: grn.grnNo,
                grnDate: grn.grnDate,
                poNo: lpo.poNo,
                receivedQty,
                acceptedQty,
                rejectedQty: Math.max(0, receivedQty - acceptedQty),
              });
            }
          });
        });
      });

      let deliveredQty = 0;
      (dns || []).forEach((dn: any) => {
        if (dn.status === DnStatus.CANCELLED) return;
        (dn.items || []).forEach((dnItem: any) => {
          const partNoMatch = this.matchPartNo(dnItem.partNo, item.partNo);
          const descriptionMatch = dnItem.description === item.detail;
          if (partNoMatch || descriptionMatch) {
            deliveredQty += dnItem.currentDeliveryQty || 0;
          }
        });
      });
      const pendingDeliveryQty = Math.max(0, item.quantity - deliveredQty);

      const dialogRef = this.dialog.open(ItemIssueHistoryModalComponent, {
        width: '1100px',
        maxWidth: '95vw',
        maxHeight: '90vh',
        data: {
          itemDetail: item.detail,
          partNo: item.partNo,
          orderedQty: item.quantity,
          issues,
          lpoStatuses,
          deliveredQty,
          pendingDeliveryQty,
          canInitiateLPO: this.canInitiateLPO(),
          canReissueAndRevoke: this.canReissueAndRevoke(),
        },
      });

      // An action taken inside the modal (send for approval / revoke) can
      // change this item's issue trail, so drop the cache and reload fresh
      // rather than leaving a stale table behind after the modal closes.
      dialogRef.afterClosed().subscribe((result) => {
        if (result?.refreshed) {
          this.issueHistoryCache = null;
          this.viewItemIssueHistory(item);
        }
      });
    } catch (error) {
      console.error('Error loading item issue history:', error);
      this.notificationService.error('Failed to load item issue history');
    } finally {
      this.loadingIssueHistoryFor = null;
    }
  }

  hasComparisons(items: any[]): any[] {
    if (!items?.length) return [];

    return items.flatMap(item =>
      (item.itemDetails || []).flatMap((detail: any) =>
        (detail.comparisons || []).filter((c: any) => c.selected === true)
      )
    );
  }

  checkSuppliersStatus() {
    if (!this.purchaseId || this.purchaseId === 'none') {
      this.supplierSelectableMap.set(new Map());
      return;
    }

    this.purchaseOrderService.getSuppliersForPurchaseRequest(this.purchaseId).subscribe({
      next: (response) => {
        if (response.success && response.data) {
          const map = new Map<string, boolean>();
          response.data.forEach((supplier: any) => {
            map.set(supplier._id, supplier.canSelect === true);
            this.poSuppliers.set(supplier._id, supplier);
          });
          this.supplierSelectableMap.set(map);
        } else {
          this.supplierSelectableMap.set(new Map());
        }
      },
      error: (error) => {
        console.error('Error checking suppliers status:', error);
        this.supplierSelectableMap.set(new Map());
      }
    });
  }


}
