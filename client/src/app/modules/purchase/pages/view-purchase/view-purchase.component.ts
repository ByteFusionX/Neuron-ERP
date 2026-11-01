import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { ToastrService } from 'ngx-toastr';
import { CommonModule, DatePipe } from '@angular/common';
import { PurchaseService } from 'src/app/core/services/purchase/purchase.service';
import { FileService } from 'src/app/core/services/file.service';
import { PurchaseData } from 'src/app/shared/interfaces/purchase.interface';
import { StatusHistoryModalComponent } from 'src/app/shared/components/status-history-modal/status-history-modal.component';
import { buildApprovalTimeline } from 'src/app/shared/utils/approval-timeline.util';
import { AuditLogService } from 'src/app/core/services/audit-log.service';
import { toTimelineEntries } from 'src/app/shared/utils/audit-timeline.util';
import { ConfirmDialogService } from 'src/app/shared/components/confirm-dialog';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { SupplierService } from 'src/app/core/services/supplier.service';
import {
  DetailViewShellComponent,
  DetailViewStat,
} from 'src/app/shared/components/detail-view-shell/detail-view-shell.component';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { DetailTableComponent } from 'src/app/shared/components/detail-panel/detail-table.component';
import { DetailTimelineComponent } from 'src/app/shared/components/detail-panel/detail-timeline.component';
import { DetailSectionComponent } from 'src/app/shared/components/detail-panel/detail-section.component';
import { DetailFieldComponent } from 'src/app/shared/components/detail-panel/detail-field.component';
import { DetailFieldsMenuComponent, DetailFieldsMenuItem } from 'src/app/shared/components/detail-panel/detail-fields-menu.component';
import {
  DetailFootRow,
  DetailTableColumn,
  DetailTimelineEntry,
} from 'src/app/shared/components/detail-panel/detail-panel.model';
import { CreatePurchaseComponent } from '../create-purchase/create-purchase.component';
import { SalesRfqService } from 'src/app/core/services/sales-rfq/sales-rfq.service';
import { PurchaseOrderStatusRow } from 'src/app/shared/interfaces/sales-rfq.interface';
import { DETAIL_TONE, DetailTone } from 'src/app/shared/components/detail-panel/detail-tone';

const STATUS_TONES: Record<string, DetailTone> = {
  Pending: 'warn',
  Approved: 'good',
  Rejected: 'bad',
  New: 'info',
  'In Progress': 'active',
};

/** A label/value in the Details section; ids link out, the status shows as dot + text. */
interface PurchaseFact {
  label: string;
  value: string;
  link?: any[];
  state?: { dot: string; text: string };
}

/** One row of the Pricing tab; `sign` marks an adjustment (orange minus, green plus). */
interface PricingLine {
  label: string;
  note?: string;
  value: number;
  sign?: boolean;
  total?: boolean;
  pct?: boolean;
}

@Component({
  selector: 'app-view-purchase',
  imports: [CommonModule, RouterLink, DetailViewShellComponent, ActionButtonComponent, DetailTableComponent, DetailTimelineComponent, DetailSectionComponent, DetailFieldComponent, DetailFieldsMenuComponent, CreatePurchaseComponent],
  providers: [DatePipe],
  templateUrl: './view-purchase.component.html',
  styleUrls: ['./view-purchase.component.css']
})
export class ViewPurchaseComponent {
  private purchaseService = inject(PurchaseService);
  private notificationService = inject(ToastrService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private dialog = inject(MatDialog);
  private confirmDialog = inject(ConfirmDialogService);
  private fileService = inject(FileService);
  private supplierService = inject(SupplierService)
  private employeeService = inject(EmployeeService)
  private datePipe = inject(DatePipe);
  private auditLog = inject(AuditLogService);
  private salesRfqService = inject(SalesRfqService);

  purchase: PurchaseData | null = null;
  isLoading = true;
  isApproving = false;
  isRejecting = false;
  isRevokingPr = false;
  editDrawerOpen = false;
  /** Read-only drawer for a PR sent for approval. */
  viewDrawerOpen = false;
  /** POs step of an approved PR. */
  posDrawerOpen = false;
  isMerging = false;
  isRevoking = false;
  downloadProgress = 0;
  isDownloading = false;
  purchaseId!: string;
  suppliersList = signal<any[]>([])
  canApprovePR = false;
  isSuperAdmin = false;
  currentEmployeeId: string | null = null;

  // view model — rebuilt by buildView() whenever the purchase or supplier list changes
  panelOpen = true;
  panelTab: 'pricing' | 'approval' | 'history' | 'pos' = 'pricing';
  /** The POs tab only exists once the request is approved. */
  get panelTabs(): { id: 'pricing' | 'approval' | 'history' | 'pos'; label: string }[] {
    const showPos = !['New', 'In Progress', 'Pending', 'Rejected', 'Revoked'].includes(this.purchase?.status ?? '');
    return showPos ? this.tabsWithPos : this.tabsBase;
  }
  // stable arrays: a getter that builds a new one each change detection re-creates the buttons and swallows clicks
  private readonly tabsBase: { id: 'pricing' | 'approval' | 'history' | 'pos'; label: string }[] = [
    { id: 'pricing', label: 'Costs' },
    { id: 'approval', label: 'Approval' },
    { id: 'history', label: 'History' },
  ];
  private readonly tabsWithPos: { id: 'pricing' | 'approval' | 'history' | 'pos'; label: string }[] = [
    { id: 'pricing', label: 'Costs' },
    { id: 'pos', label: 'POs' },
    { id: 'approval', label: 'Approval' },
    { id: 'history', label: 'History' },
  ];
  /** Per line and supplier PO status, as the PO tab lists it. */
  orderRows = signal<PurchaseOrderStatusRow[]>([]);
  posLoading = false;
  /** Every line put on a PO, one row per PO line, cancelled ones left out. */
  poLineRows = computed(() => {
    const out: { key: string; poId: string; poNo: string; detail: string; qty: number; uom: string; price: number | null; supplierId: string; supplierName: string; status: string }[] = [];
    this.orderRows().forEach((row) => row.suppliers.forEach((s) => s.pos.forEach((p) => {
      if (p.poStatus === 'Cancelled' || !(p.qty > 0)) return;
      out.push({
        key: `${row.lineKey}|${p._id}`, poId: p._id, poNo: p.poNo, detail: row.detail, qty: p.qty, uom: row.uom || '',
        price: s.unitPrice ?? null, supplierId: s.supplierId, supplierName: s.supplierName, status: p.poStatus,
      });
    })));
    return out.sort((a, b) => a.poNo.localeCompare(b.poNo));
  });
  onViewPoLine(r: { poId: string }): void {
    this.router.navigate(['/purchase-order/view-lpo', r.poId]);
  }
  poTone(status: string): string {
    return ['Placed', 'Closed'].includes(status)
      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
      : status === 'Approved'
        ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300'
        : status === 'Rejected'
          ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
          : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300';
  }
  private loadPos(): void {
    this.posLoading = true;
    this.salesRfqService.getPurchaseOrderStatus(this.purchaseId).subscribe({
      next: (res) => { this.orderRows.set(res?.data?.rows || []); this.posLoading = false; },
      error: () => { this.orderRows.set([]); this.posLoading = false; },
    });
  }
  /** Audit-log events; approve/reject are left out because the Approval tab already shows them. */
  auditEntries: DetailTimelineEntry[] = [];
  stats: DetailViewStat[] = [];
  subtitle = '';
  owner = '';
  detailFacts: PurchaseFact[] = [];
  detailItems: DetailFieldsMenuItem[] = [];
  hiddenDetail = new Set<string>();
  detailOrder: string[] = [];
  /** Detail fields that are switched on, in the user's order. */
  get visibleDetail(): PurchaseFact[] {
    const pos = (k: string) => { const i = this.detailOrder.indexOf(k); return i < 0 ? this.detailOrder.length : i; };
    return this.detailFacts.filter((f) => !this.hiddenDetail.has(f.label)).sort((a, b) => pos(a.label) - pos(b.label));
  }
  trackFact = (_: number, f: PurchaseFact) => f.label;
  itemColumns: DetailTableColumn[] = [];
  itemRows: Record<string, any>[] = [];
  itemFootRows: DetailFootRow[] = [];
  pricingDeal: PricingLine[] = [];
  pricingPr: PricingLine[] = [];
  historyEntries: DetailTimelineEntry[] = [];

  get isManual(): boolean {
    return this.purchase?.sourceType === 'manual';
  }

  get dealId(): string | null {
    return (this.purchase as any)?.jobId?.quoteId?.dealData?.dealId || null;
  }

  ngOnInit(): void {
    this.loadPurchase();

    this.supplierService.supplierList().subscribe({
      next: (res) => {
        this.suppliersList.set(res.data)
        this.buildView();
      }, error: (error) => {
        console.log(error);
      }
    })

    this.employeeService.employeeData$.subscribe((data) => {
      this.currentEmployeeId = data?._id || null;
      this.isSuperAdmin = /^superadmin$/i.test(data?.category?.role ?? '');
      this.canApprovePR = this.isSuperAdmin
        || data?.category?.privileges?.purchase?.canApprovePR === true
        || (data as any)?.extraPrivileges?.purchase?.canApprovePR === true;
    });
  }

  isOwnRequest(): boolean {
    const createdById = (this.purchase as any)?.createdBy?._id || (this.purchase as any)?.createdBy;
    return !!this.currentEmployeeId && !!createdById && createdById === this.currentEmployeeId;
  }

  canApproveOrReject(): boolean {
    return this.canApprovePR && (this.isSuperAdmin || !this.isOwnRequest());
  }

  loadPurchase() {
    this.purchaseId = <string>this.route.snapshot.paramMap.get('id');
    if (this.purchaseId == 'none') {
      this.isLoading = false;
      return;
    }
    if (!this.purchaseId) {
      this.isLoading = false;
      this.notificationService.error('Invalid Purchase Id');
      this.router.navigate(['/purchase/pr']);
      return;
    }

    this.purchaseService.getPurchaseById(this.purchaseId).subscribe({
      next: (response) => {
        this.purchase = response.data;
        this.buildView();
        this.isLoading = false;
        if (!['New', 'In Progress', 'Pending', 'Rejected', 'Revoked'].includes(this.purchase?.status ?? '')) this.loadPos();
        this.auditLog.getHistory(this.isManual ? 'generalPurchaseRequest' : 'purchaseRequest', this.purchaseId).subscribe({
          next: (entries) => (this.auditEntries = toTimelineEntries((entries || []).filter((e) => e.action !== 'approved' && e.action !== 'rejected'))),
          error: () => (this.auditEntries = []),
        });
      },
      error: (error) => {
        this.notificationService.error('Failed to load purchase details');
        console.error('Error loading purchase:', error);
        this.isLoading = false;
        this.router.navigate(['/purchase/pr']);
      }
    });
  }

  private money(value: number | null | undefined): string {
    const n = Number(value) || 0;
    const formatted = n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return this.purchase?.currency ? `${formatted} ${this.purchase.currency}` : formatted;
  }

  private fullName(person: any): string {
    return person?.firstName ? `${person.firstName} ${person.lastName ?? ''}`.trim() : '-';
  }

  private buildView(): void {
    const p: any = this.purchase;
    if (!p) return;

    const manual = this.isManual;
    // Cost follows what is awarded; a line with no awarded comparison stands on its deal sheet supplier.
    // A supplier's discount counts only while that supplier still carries a line.
    const effective = this.getSelectedRows(p.items);
    const grossCost = effective.reduce(
      (sum: number, r: any) => sum + (Number(r.selectedSupplier.unitPrice) || 0) * (Number(r.selectedSupplier.quantity) || 0), 0);
    const idOf = (ref: any): string => String(ref && typeof ref === 'object' ? ref._id : ref ?? '');
    const activeSuppliers = new Set<string>();
    const itemSupplierNames = new Map<string, string>();
    for (const item of p.items || []) {
      for (const detail of item.itemDetails || []) {
        const won = (detail.comparisons || []).filter((c: any) => c.selected);
        for (const src of won.length ? won : [detail]) {
          const id = idOf(src.supplierId);
          if (id) activeSuppliers.add(id);
          const nm = src.supplierName || src.supplierDetails?.supplierName || src.supplierId?.supplierName;
          if (id && nm) itemSupplierNames.set(id, nm);
        }
      }
    }
    // supplier names by id, from the awarded lines and the deal sheet's discount entries
    const supplierNames = new Map<string, string>(itemSupplierNames);
    for (const r of effective) {
      const sid = idOf(r.selectedSupplier.supplierId);
      if (sid && r.selectedSupplier.supplierName) supplierNames.set(sid, r.selectedSupplier.supplierName);
    }
    for (const c of p.jobId?.quoteId?.dealData?.additionalCosts || []) {
      const sid = idOf(c.supplierId);
      const nm = c.supplierDetails?.supplierName || c.supplierId?.supplierName;
      if (sid && nm && !supplierNames.has(sid)) supplierNames.set(sid, nm);
    }
    const savedDiscounts: any[] = p.supplierDiscounts?.suppliers || [];
    const dealDiscounts: any[] = (p.jobId?.quoteId?.dealData?.additionalCosts || [])
      .filter((c: any) => c.type === 'Supplier Discount' && c.supplierId)
      .map((c: any) => ({ supplierId: c.supplierId, discount: c.value }));
    const discountRows = savedDiscounts.length ? savedDiscounts : dealDiscounts;
    const discountReceived = discountRows
      .filter((d: any) => activeSuppliers.has(idOf(d.supplierId)))
      .reduce((sum: number, d: any) => sum + (Number(d.discount) || 0), 0);
    const dealAdditionalCosts = (p.jobId?.quoteId?.dealData?.additionalCosts || [])
      .filter((c: any) => c.type !== 'Supplier Discount')
      .reduce((sum: number, c: any) => sum + (Number(c.value) || 0), 0);
    // The PR's own additional costs replace the deal's once saved; until then the deal's stand.
    const prExtraCosts: { name: string; value: number }[] = Array.isArray(p.additionalCosts)
      ? p.additionalCosts.map((c: any) => ({ name: c.name || 'Additional cost', value: Number(c.value) || 0 }))
      : (p.jobId?.quoteId?.dealData?.additionalCosts || [])
          .filter((c: any) => (c.type || 'Additional Cost') === 'Additional Cost')
          .map((c: any) => ({ name: c.name || 'Additional cost', value: Number(c.value) || 0 }));
    const prAdditionalCosts = prExtraCosts.reduce((sum, c) => sum + c.value, 0);
    const customerDiscount = (p.jobId?.quoteId?.dealData?.additionalCosts || [])
      .filter((c: any) => c.type === 'Customer Discount')
      .reduce((sum: number, c: any) => sum + (Number(c.value) || 0), 0);
    const prCost = grossCost + prAdditionalCosts - discountReceived;
    const profit = this.getProfitMargin(p.lpoValue || 0, prCost);
    const diff = (profit || 0) - (p.dealProfit || 0);

    this.subtitle = manual ? ['General purchase', p.supplierId?.supplierName].filter(Boolean).join(' · ') : (p.customerId?.companyName || '');
    this.owner = p.procurementPerson ? this.fullName(p.procurementPerson) : '';

    this.stats = manual
      ? [{ label: 'Total LPO value', value: this.money(p.totalLpo) }]
      : [
          { label: 'Total price', value: this.money((p.lpoValue || 0) + customerDiscount) },
          { label: 'LPO value', value: this.money(p.lpoValue) },
          ...(customerDiscount ? [{ label: 'Customer discount', value: this.money(customerDiscount) }] : []),
          { label: 'Cost as per deal sheet', value: this.money(p.totalDealCost) },
          { label: 'Additional costs in deal', value: this.money(dealAdditionalCosts) },
          { label: 'Additional costs in PR', value: this.money(prAdditionalCosts) },
          { label: 'Total discount', value: this.money(discountReceived) },
          { label: 'Cost as per PR', value: this.money(prCost) },
          { label: 'Margin %', value: `${((p.lpoValue || 0) > 0 ? (profit / p.lpoValue) * 100 : 0).toFixed(2)}%`, danger: profit < 0, hiddenByDefault: true },
          { label: 'Margin value', value: this.money(profit), danger: profit < 0, hiddenByDefault: true },
          { label: 'Difference in profit', value: this.money(diff), danger: diff < 0, hiddenByDefault: true },
        ];

    const tone = DETAIL_TONE[STATUS_TONES[p.status] ?? 'neutral'];
    const date = (v: any) => this.datePipe.transform(v, 'dd MMM yyyy') || '';
    const jobRef = p.jobId?.jobId?.jobId || p.jobId?.jobId;
    const facts: (PurchaseFact | false)[] = [
      // what it is and who it's for
      !manual && { label: 'Customer', value: p.customerId?.companyName || '-' },
      manual && { label: 'Supplier', value: p.supplierId?.supplierName || '-' },
      !manual && { label: 'Job ID', value: typeof jobRef === 'string' ? jobRef : '-', link: p.jobId?._id && typeof jobRef === 'string' ? ['/job-sheet/view', p.jobId._id] : undefined },
      !manual && { label: 'Quotation', value: p.jobId?.quoteId?.quoteId || '-', link: p.jobId?.quoteId?._id && p.jobId.quoteId.quoteId ? ['/quotations/view', p.jobId.quoteId._id] : undefined },
      // the deal sheet view is keyed by its quotation's id
      !manual && { label: 'Deal Sheet ID', value: this.dealId || '-', link: p.jobId?.quoteId?._id && this.dealId ? ['/deal-sheet/view', p.jobId.quoteId._id] : undefined },
      // who is responsible
      { label: 'Allocated To', value: this.fullName(p.procurementPerson) },
      { label: 'Allocated By', value: this.fullName(p.allocatedBy) },
      { label: 'Allocated On', value: date(p.allocatedAt || p.jobId?.allocatedAt) || '-' },
      !manual && { label: 'Sales Manager', value: this.fullName(p.jobId?.quoteId?.createdBy) },
      !!p.mr?.engineer && { label: 'MR Engineer', value: p.mr.engineer },
      // when
      { label: 'Created By', value: this.fullName(p.createdBy) },
      { label: 'Created On', value: date(p.createdAt) || '-' },
      !!p.approvedDate && { label: 'Approved On', value: date(p.approvedDate) },
      !!p.updatedAt && { label: 'Last Updated', value: date(p.updatedAt) },
      { label: 'Currency', value: p.currency || '-' },
      { label: 'Status', value: p.status || '-', state: { dot: tone.dot, text: tone.text } },
    ];
    this.detailFacts = facts.filter((f): f is PurchaseFact => !!f);
    const hidden = ['Currency', 'Last Updated'];
    this.detailItems = this.detailFacts.map((f) => ({ key: f.label, label: f.label, hiddenByDefault: hidden.includes(f.label) }));

    this.itemColumns = [
      { key: 'itemCode', label: 'Item code', hiddenByDefault: true },
      { key: 'detail', label: 'Description', type: 'html', truncate: true, tooltipKey: 'detailText' },
      { key: 'partNo', label: 'Part No', hiddenByDefault: true },
      { key: 'qty', label: 'Qty', type: 'number', align: 'right' },
      { key: 'uom', label: 'UOM' },
      { key: 'unitCost', label: 'Unit cost', type: 'currency' },
      { key: 'totalCost', label: 'Total cost', type: 'currency', emphasis: true, total: true },
      ...(manual ? [] : [
        { key: 'margin', label: 'Margin %', align: 'right' },
        { key: 'marginValue', label: 'Margin value', type: 'currency', total: true },
        { key: 'unitSelling', label: 'Unit price', type: 'currency' },
        { key: 'totalSelling', label: 'Total price', type: 'currency', total: true },
        { key: 'eta', label: 'ETA terms', wrap: true, hiddenByDefault: true },
      ] as DetailTableColumn[]),
    ];

    // grouped under the supplier name, the same banded layout as the quotation and deal views
    const rows: Record<string, any>[] = [];
    let lastGroup: string | null = null;
    let sumCost = 0;
    let sumSell = 0;
    const supplierOf = (r: any): string => r.selectedSupplier?.supplierName || 'No supplier';
    const selectedRows = this.getSelectedRows(p.items)
      .map((r: any, i: number) => ({ r, i }))
      .sort((a: any, b: any) => supplierOf(a.r).localeCompare(supplierOf(b.r)) || a.i - b.i)
      .map((x: any) => x.r);
    for (const row of selectedRows) {
      const group = supplierOf(row);
      if (group !== lastGroup) {
        rows.push({ _group: true, label: group });
        lastGroup = group;
      }
      const qty = Number(row.selectedSupplier.quantity) || 0;
      const totalCost = (Number(row.selectedSupplier.unitPrice) || 0) * qty;
      const totalSelling = (Number(row.detail.unitSellingPrice) || 0) * qty;
      sumCost += totalCost;
      sumSell += totalSelling;
      rows.push({
        detail: row.detail.detail,
        detailText: `${row.detail.detail ?? ''} ${row.detail.itemCode ?? ''} ${this.formatPartNumber(row.detail.partNo)}`,
        itemCode: row.detail.itemCode || '-',
        partNo: this.formatPartNumber(row.detail.partNo),
        uom: row.detail.uom || '-',
        qty,
        unitCost: row.selectedSupplier.unitPrice,
        totalCost,
        unitSelling: row.detail.unitSellingPrice,
        totalSelling,
        margin: totalSelling > 0 ? `${(((totalSelling - totalCost) / totalSelling) * 100).toFixed(2)}%` : '-',
        marginValue: totalSelling - totalCost,
        eta: row.selectedSupplier.etaTerms || '-',
      });
    }
    this.itemRows = rows;
    this.itemFootRows = [{
      label: 'Total',
      emphasis: true,
      cells: {
        totalCost: { value: sumCost, format: 'currency' },
        ...(manual ? {} : { totalSelling: { value: sumSell, format: 'currency' } }),
      },
    }];

    // Pricing tab: how line costs become the PR cost, then the profit against the deal sheet
    const sellingPrice = Number(p.lpoValue) || 0;
    const marginPct = sellingPrice > 0 ? (profit / sellingPrice) * 100 : 0;
    const dealCosts: any[] = p.jobId?.quoteId?.dealData?.additionalCosts || [];
    const costLines = dealCosts.filter((c: any) => c.type === 'Additional Cost' && Number(c.value));
    const discLines = dealCosts.filter((c: any) => c.type === 'Supplier Discount' && Number(c.value));
    const dealTotalCost = Number(p.totalDealCost) || 0;
    const dealItemsCost = dealTotalCost
      - costLines.reduce((s: number, c: any) => s + Number(c.value), 0)
      + discLines.reduce((s: number, c: any) => s + Number(c.value), 0);
    const dealSelling = Number(p.totalDealSellingPrice) || sellingPrice;
    const dealProfit = dealSelling - dealTotalCost;
    // LPO value is what the customer pays after their discounts, so show the discounts that bridge to it
    const custDiscLines = dealCosts.filter((c: any) => c.type === 'Customer Discount' && Number(c.value));
    const custDiscTotal = custDiscLines.reduce((s: number, c: any) => s + Number(c.value), 0);
    const sellingLines = (net: number): PricingLine[] => custDiscTotal
      ? [
          { label: 'Selling price', value: net + custDiscTotal },
          ...custDiscLines.map((c: any) => ({ label: c.name || 'Customer discount', note: 'Customer discount', value: -Number(c.value), sign: true })),
          { label: 'LPO value', value: net, total: true },
        ]
      : [{ label: 'Selling price (LPO value)', value: net }];
    this.pricingDeal = manual ? [] : [
      ...sellingLines(dealSelling),
      { label: 'Items cost', value: dealItemsCost },
      ...costLines.map((c: any) => ({ label: c.name || 'Additional cost', note: 'Additional cost', value: Number(c.value), sign: true })),
      ...discLines.map((c: any) => ({
        label: c.supplierDetails?.supplierName || supplierNames.get(idOf(c.supplierId)) || c.supplierId?.supplierName || c.name || 'Supplier',
        note: 'Supplier discount',
        value: -Number(c.value),
        sign: true,
      })),
      { label: 'Total cost', value: dealTotalCost, total: true },
      { label: 'Margin value', value: dealProfit },
      { label: 'Margin %', value: dealSelling > 0 ? (dealProfit / dealSelling) * 100 : 0, pct: true },
    ];
    this.pricingPr = manual
      ? [{ label: 'Total LPO value', value: Number(p.totalLpo) || 0, total: true }]
      : [
          ...sellingLines(sellingPrice),
          { label: 'Items cost', value: grossCost },
          ...prExtraCosts.filter((c) => c.value).map((c) => ({ label: c.name, note: 'Additional cost', value: c.value, sign: true })),
          ...discountRows
            .filter((d: any) => activeSuppliers.has(idOf(d.supplierId)) && Number(d.discount))
            .map((d: any) => ({
              label: supplierNames.get(idOf(d.supplierId)) || d.supplierName || d.supplierDetails?.supplierName || d.supplierId?.supplierName || 'Supplier',
              note: 'Supplier discount',
              value: -Number(d.discount),
              sign: true,
            })),
          { label: 'Total cost', value: prCost, total: true },
          { label: 'Margin value', value: profit },
          { label: 'Margin %', value: marginPct, pct: true },
        ];

    this.historyEntries = buildApprovalTimeline(p.approvalStatus);
  }

  hasNewItemsToMerge(): boolean {
    if (!this.purchase?.items) return false;

    return this.purchase.items.some((item: any) =>
      item.itemDetails?.some((detail: any) => detail.isNewlyAdded && !detail.merged)
    );
  }

  hasMergedItems(): boolean {
    if (!this.purchase?.items) return false;

    return this.purchase.items.some((item: any) =>
      item.itemDetails?.some((detail: any) => detail.merged)
    );
  }

  async onMergeItems(): Promise<void> {
    if (!this.purchase?._id) return;

    const { confirmed } = await this.confirmDialog.open({
      tone: 'approve',
      title: 'Merge items to deal sheet',
      message: 'All newly added items on this purchase request will be merged into the deal sheet.',
      confirmLabel: 'Merge items',
    });
    if (!confirmed) return;

    this.isMerging = true;
    this.purchaseService.mergeItemsToDealSheet(this.purchaseId).subscribe({
      next: () => {
        this.loadPurchase();
        this.isMerging = false;
        this.notificationService.success('Items merged to deal sheet successfully');
      },
      error: (error) => {
        this.notificationService.error(error.error?.message || 'Failed to merge items');
        this.isMerging = false;
      }
    });
  }

  async onRevokeMerge(): Promise<void> {
    if (!this.purchase?._id) return;

    const { confirmed } = await this.confirmDialog.open({
      tone: 'warning',
      title: 'Revoke merged items',
      message: 'The merged items will be removed from the deal sheet.',
      confirmLabel: 'Revoke merge',
    });
    if (!confirmed) return;

    this.isRevoking = true;
    this.purchaseService.revokeMergedItems(this.purchaseId).subscribe({
      next: () => {
        this.loadPurchase();
        this.isRevoking = false;
        this.notificationService.success('Merged items revoked successfully');
      },
      error: (error) => {
        this.notificationService.error(error.error?.message || 'Failed to revoke merged items');
        this.isRevoking = false;
      }
    });
  }

  /** True when other approval stages are still waiting after the one this person is about to decide. */
  private moreStagesAfterMe(): boolean {
    const pending = ((this.purchase as any)?.approvalStatus ?? []).filter((a: any) => a.status === 'pending');
    return pending.length > 1 && !this.isSuperAdmin;
  }

  async onApprove(): Promise<void> {
    if (!this.purchase?._id || !this.canApproveOrReject()) return;

    const { confirmed, reason } = await this.confirmDialog.open({
      tone: 'approve',
      title: 'Approve purchase request',
      message: this.moreStagesAfterMe() ? 'Your approval moves this purchase request on to the next approval stage.' : 'This purchase request will be approved and move on to LPO.',
      details: [
        { label: 'PR No', value: this.purchase.purchaseNo || '-' },
        { label: 'LPO value', value: this.money(this.isManual ? (this.purchase as any).totalLpo : (this.purchase as any).lpoValue) },
      ],
      confirmLabel: 'Approve',
      reason: 'optional',
      reasonLabel: 'Approval comment',
    });
    if (!confirmed) return;

    this.isApproving = true;
    this.purchaseService.updatePurchaseStatus(this.purchaseId, 'approved', reason ?? '').subscribe({
      next: (res) => {
        this.notificationService.success('Purchase approved successfully');
        this.isApproving = false;
        if (res?.data) {
          this.purchase = res.data;
        }
        this.router.navigate(['/purchase/pr']);
      },
      error: (error) => {
        this.notificationService.error(error.error?.message || 'Failed to approve purchase');
        this.isApproving = false;
      }
    });
  }

  async onReject(): Promise<void> {
    if (!this.purchase?._id || !this.canApproveOrReject()) return;

    const { confirmed, reason } = await this.confirmDialog.open({
      tone: 'reject',
      title: 'Reject purchase request',
      message: 'This purchase request will be sent back to its creator.',
      details: [{ label: 'PR No', value: this.purchase.purchaseNo || '-' }],
      confirmLabel: 'Reject',
      reason: true,
      reasonLabel: 'Rejection reason',
    });
    if (!confirmed) return;
    if (!reason || reason.trim() === '') {
      this.notificationService.error('Rejection reason is required');
      return;
    }

    this.isRejecting = true;
    this.purchaseService.updatePurchaseStatus(this.purchaseId, 'rejected', reason).subscribe({
      next: (res) => {
        this.notificationService.success('Purchase rejected successfully');
        this.isRejecting = false;
        if (res?.data) {
          this.purchase = res.data;
        }
        this.router.navigate(['/purchase/pr']);
      },
      error: (error) => {
        this.notificationService.error(error.error?.message || 'Failed to reject purchase');
        this.isRejecting = false;
      }
    });
  }

  async onRevoke(): Promise<void> {
    if (!this.purchase?._id || !this.canApproveOrReject()) return;
    const { confirmed, reason } = await this.confirmDialog.open({
      tone: 'reject',
      title: 'Revoke purchase request',
      message: 'This approved purchase request goes back to its creator to be edited and sent for approval again.',
      details: [{ label: 'PR No', value: this.purchase.purchaseNo || '-' }],
      confirmLabel: 'Revoke',
      reason: true,
      reasonLabel: 'Revoke reason',
    });
    if (!confirmed) return;
    if (!reason?.trim()) {
      this.notificationService.error('Revoke reason is required');
      return;
    }
    this.isRevokingPr = true;
    this.purchaseService.revokePurchase(this.purchaseId, reason.trim()).subscribe({
      next: () => {
        this.notificationService.success('Purchase request revoked');
        this.isRevokingPr = false;
        this.loadPurchase();
      },
      error: (error) => {
        this.notificationService.error(error.error?.message || 'Failed to revoke purchase request');
        this.isRevokingPr = false;
      }
    });
  }

  getProfitMargin(totalCost: number, discountedCost: number): number {
    if (!discountedCost || discountedCost <= 0) return 0;
    return (totalCost - discountedCost) || 0;
  }

  onEdit() {
    if (!this.purchase?._id) return;
    this.editDrawerOpen = true;
  }

  onEditDrawerSaved(): void {
    this.loadPurchase();
  }

  onDownloadFile(file: any) {
    if (this.isDownloading) return;

    this.isDownloading = true;
    this.downloadProgress = 0;

    this.fileService.downloadFileWithProgress(
      file.fileName,
      file.originalname,
      (progress) => {
        this.downloadProgress = progress;
      },
      (error) => {
        this.isDownloading = false;
        if (error.status === 404) {
          this.notificationService.warning('File not found on server. Please check and try again.');
        } else {
          this.notificationService.error('An error occurred while downloading the file.');
        }
      }
    );
  }

  getSelectedRows(items: any[]) {
    if (!Array.isArray(items) || items.length === 0) return [];

    const rows: any[] = [];
    // ids may arrive plain or populated
    const nameOf = (ref: any): string | null => {
      if (!ref) return null;
      if (typeof ref === 'object' && ref.supplierName) return ref.supplierName;
      const id = String(typeof ref === 'object' ? ref._id : ref);
      return this.suppliersList().find((s: any) => String(s._id) === id)?.supplierName ?? null;
    };
    for (const item of items) {
      if (!item.itemDetails?.length) continue;

      for (const detail of item.itemDetails) {
        const won = (detail.comparisons || []).filter((c: any) => c.selected);

        if (won.length) {
          // a line split between suppliers gives one row per supplier, each with its awarded share
          for (const selected of won) {
            rows.push({
              itemName: item.itemName,
              detail,
              selectedSupplier: {
                // a deal-sheet supplier on the line stands in when the comparison's own supplier is not found
                supplierName: nameOf(selected.supplierId) ?? nameOf(detail.supplierId) ?? detail.supplierName ?? 'Unknown Supplier',
                unitPrice: selected.unitPrice,
                quantity: Number(selected.awardedQty) || Number(detail.quantity) || 0,
                etaTerms: selected.etaTerms,
              },
            });
          }
        } else {
          rows.push({
            itemName: item.itemName,
            detail,
            selectedSupplier: {
              supplierName: nameOf(detail.supplierId) ?? detail.supplierName ?? 'Unknown Supplier',
              unitPrice: detail.unitCost,
              quantity: detail.quantity,
              etaTerms: detail.availability,
            },
          });
        }
      }
    }

    return rows;
  }

  formatPartNumber(partNo: any): string {
    if (!partNo) return '-';
    if (typeof partNo === 'string') {
      return partNo;
    }
    const code = partNo?.partNo || '';
    return code || '-';
  }

  showStatusHistory(): void {
    if (!this.purchase?.rejectedReason?.length) return;

    this.dialog.open(StatusHistoryModalComponent, {
      data: {
        title: 'Purchase Rejection History',
        history: this.purchase.rejectedReason
      },
      width: '600px',
      maxHeight: '80vh'
    });
  }
}
