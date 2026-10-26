import { Component, inject, signal } from '@angular/core';
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
  value: number;
  sign?: boolean;
  total?: boolean;
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

  purchase: PurchaseData | null = null;
  isLoading = true;
  isApproving = false;
  isRejecting = false;
  editDrawerOpen = false;
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
  panelTab: 'pricing' | 'approval' | 'history' = 'pricing';
  readonly panelTabs: { id: 'pricing' | 'approval' | 'history'; label: string }[] = [
    { id: 'pricing', label: 'Pricing' },
    { id: 'approval', label: 'Approval' },
    { id: 'history', label: 'History' },
  ];
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
  pricingCost: PricingLine[] = [];
  pricingProfit: PricingLine[] = [];
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
    const prCost = (p.totalPRCost || 0) - (p.totalDiscountReceived || 0);
    const profit = this.getProfitMargin(p.lpoValue || 0, prCost);
    const diff = (profit || 0) - (p.dealProfit || 0);

    this.subtitle = manual ? ['General purchase', p.supplierId?.supplierName].filter(Boolean).join(' · ') : (p.customerId?.companyName || '');
    this.owner = p.procurementPerson ? this.fullName(p.procurementPerson) : '';

    this.stats = manual
      ? [{ label: 'Total LPO value', value: this.money(p.totalLpo) }]
      : [
          { label: 'LPO value', value: this.money(p.lpoValue) },
          { label: 'Cost as per PR', value: this.money(prCost) },
          { label: 'Cost as per deal sheet', value: this.money(p.totalDealCost) },
          { label: 'Profit', value: this.money(profit), danger: profit < 0 },
          { label: 'Difference in profit', value: this.money(diff), danger: diff < 0 },
          { label: 'Discount received', value: this.money(p.totalDiscountReceived), hiddenByDefault: true },
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
      { key: 'detail', label: 'Description', truncate: true },
      { key: 'partNo', label: 'Part No', hiddenByDefault: true },
      { key: 'qty', label: 'Qty', type: 'number', align: 'right' },
      { key: 'uom', label: 'UOM' },
      { key: 'unitCost', label: 'Unit cost', type: 'currency' },
      { key: 'totalCost', label: 'Total cost', type: 'currency', emphasis: true },
      ...(manual ? [] : [
        { key: 'unitSelling', label: 'Unit selling', type: 'currency' },
        { key: 'totalSelling', label: 'Total selling', type: 'currency' },
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
      const qty = Number(row.detail.quantity) || 0;
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
    this.pricingCost = manual
      ? [{ label: 'Total LPO value', value: Number(p.totalLpo) || 0, total: true }]
      : [
          { label: 'Cost as per PR', value: Number(p.totalPRCost) || 0 },
          { label: 'Discount received', value: -(Number(p.totalDiscountReceived) || 0), sign: true },
          { label: 'Net PR cost', value: prCost, total: true },
        ];
    this.pricingProfit = manual ? [] : [
      { label: 'LPO value', value: Number(p.lpoValue) || 0 },
      { label: 'Net PR cost', value: -prCost, sign: true },
      { label: 'Profit', value: profit, total: true },
      { label: 'Deal profit', value: Number(p.dealProfit) || 0 },
      { label: 'Difference in profit', value: diff, sign: true },
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
    for (const item of items) {
      if (!item.itemDetails?.length) continue;

      for (const detail of item.itemDetails) {
        const selected = detail.comparisons?.find((c: any) => c.selected);

        if (selected) {
          const supplier = this.suppliersList().find(
            (s: any) => s._id === selected.supplierId
          );

          rows.push({
            itemName: item.itemName,
            detail,
            selectedSupplier: {
              supplierName: supplier?.supplierName ?? 'Unknown Supplier',
              unitPrice: selected.unitPrice,
              quantity: selected.quantity,
              etaTerms: selected.etaTerms,
            },
          });
        } else {
          rows.push({
            itemName: item.itemName,
            detail,
            selectedSupplier: {
              supplierName: detail.supplierName ?? 'Unknown Supplier',
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
