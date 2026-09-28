import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { ToastrService } from 'ngx-toastr';
import { CommonModule, DatePipe } from '@angular/common';
import { PurchaseService } from 'src/app/core/services/purchase/purchase.service';
import { FileService } from 'src/app/core/services/file.service';
import { PurchaseData } from 'src/app/shared/interfaces/purchase.interface';
import { StatusHistoryModalComponent } from 'src/app/shared/components/status-history-modal/status-history-modal.component';
import { ConfirmDialogService } from 'src/app/shared/components/confirm-dialog';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { SupplierService } from 'src/app/core/services/supplier.service';
import { ApproveDealComponent } from 'src/app/modules/deal-sheet/approve-deal/approve-deal.component';
import { Quotatation } from 'src/app/shared/interfaces/quotation.interface';
import {
  DetailViewBadge,
  DetailViewBreadcrumb,
  DetailViewShellComponent,
  DetailViewStat,
  DetailViewTab,
} from 'src/app/shared/components/detail-view-shell/detail-view-shell.component';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { DetailTableComponent } from 'src/app/shared/components/detail-panel/detail-table.component';
import { DetailMetricsComponent } from 'src/app/shared/components/detail-panel/detail-metrics.component';
import { DetailTimelineComponent } from 'src/app/shared/components/detail-panel/detail-timeline.component';
import {
  DetailMetric,
  DetailOverviewSection,
  DetailTableColumn,
  DetailTimelineEntry,
} from 'src/app/shared/components/detail-panel/detail-panel.model';
import { DetailTone } from 'src/app/shared/components/detail-panel/detail-tone';

const STATUS_TONES: Record<string, DetailTone> = {
  Pending: 'warn',
  Approved: 'good',
  Rejected: 'bad',
  Drafted: 'neutral',
};

@Component({
  selector: 'app-view-purchase',
  imports: [CommonModule, DetailViewShellComponent, ActionButtonComponent, DetailTableComponent, DetailMetricsComponent, DetailTimelineComponent],
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

  purchase: PurchaseData | null = null;
  isLoading = true;
  isApproving = false;
  isRejecting = false;
  isMerging = false;
  isRevoking = false;
  downloadProgress = 0;
  isDownloading = false;
  purchaseId!: string;
  suppliersList = signal<any[]>([])
  canApprovePR = false;
  currentEmployeeId: string | null = null;

  // view model — rebuilt by buildView() whenever the purchase or supplier list changes
  tab = 'items';
  readonly tabs: DetailViewTab[] = [
    { id: 'items', label: 'Items' },
    { id: 'summary', label: 'Summary' },
    { id: 'history', label: 'Approval history' },
  ];
  breadcrumbs: DetailViewBreadcrumb[] = [];
  badges: DetailViewBadge[] = [];
  stats: DetailViewStat[] = [];
  subtitle = '';
  avatarText = 'PR';
  sidebarSections: DetailOverviewSection[] = [];
  itemColumns: DetailTableColumn[] = [];
  itemRows: Record<string, any>[] = [];
  summaryMetrics: DetailMetric[] = [];
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
      if (data?.category?.privileges) {
        this.canApprovePR = data.category.privileges.purchase?.canApprovePR || false;
      }
    });
  }

  isOwnRequest(): boolean {
    const createdById = (this.purchase as any)?.createdBy?._id || (this.purchase as any)?.createdBy;
    return !!this.currentEmployeeId && !!createdById && createdById === this.currentEmployeeId;
  }

  canApproveOrReject(): boolean {
    return this.canApprovePR && !this.isOwnRequest();
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

    this.breadcrumbs = [{ label: 'Home', link: '/' }, { label: 'Purchase' }, { label: 'PR', link: '/purchase/pr' }, { label: p.purchaseNo }];
    this.badges = p.status ? [{ label: p.status, tone: STATUS_TONES[p.status] ?? 'neutral' }] : [];
    if (manual) this.badges.push({ label: 'General purchase', tone: 'info' });
    this.subtitle = manual ? (p.supplierId?.supplierName || '') : (p.customerId?.companyName || '');

    this.stats = manual
      ? [{ label: 'Total LPO value', value: this.money(p.totalLpo) }]
      : [
          { label: 'LPO value', value: this.money(p.lpoValue) },
          { label: 'Cost as per PR', value: this.money(prCost) },
          { label: 'Cost as per deal sheet', value: this.money(p.totalDealCost) },
          { label: 'Profit margin', value: this.money(profit), danger: profit < 0 },
          { label: 'Difference in profit', value: this.money(diff), danger: diff < 0 },
        ];

    this.sidebarSections = [
      {
        title: 'Purchase',
        fields: [
          { type: 'field', label: 'Purchase No', value: p.purchaseNo, numeric: true },
          { type: 'field', label: 'Job ID', value: p.jobId?.jobId?.jobId || p.jobId?.jobId, visible: !manual },
          { type: 'field', label: 'Deal Sheet ID', value: this.dealId || '-', visible: !manual },
          { type: 'field', label: 'Supplier', value: p.supplierId?.supplierName || '-', visible: manual },
          { type: 'field', label: 'Created By', value: this.fullName(p.createdBy) },
          { type: 'field', label: 'Created On', value: this.datePipe.transform(p.createdAt, 'dd MMM yyyy') },
          { type: 'field', label: 'Approved On', value: this.datePipe.transform(p.approvedDate, 'dd MMM yyyy'), visible: !!p.approvedDate },
        ],
      },
      {
        title: 'Customer',
        visible: !manual,
        fields: [
          { type: 'field', label: 'Customer', value: p.customerId?.companyName },
          { type: 'field', label: 'Sales Manager', value: this.fullName(p.jobId?.quoteId?.createdBy) },
          { type: 'field', label: 'Procurement Person', value: this.fullName(p.procurementPerson) },
        ],
      },
    ];

    this.itemColumns = [
      { key: 'item', label: 'Item', type: 'stack', subKey: 'partNo' },
      ...(manual || !p.jobId?._id ? [] : [{ key: 'tag', label: '', type: 'badge', badgeTones: { New: 'info', Merged: 'good' } } as DetailTableColumn]),
      { key: 'qty', label: 'Qty', type: 'number', align: 'right' },
      { key: 'unitCost', label: 'Unit cost', type: 'currency' },
      { key: 'totalCost', label: 'Total cost', type: 'currency', total: true, emphasis: true },
      ...(manual ? [] : [
        { key: 'unitSelling', label: 'Unit selling', type: 'currency' },
        { key: 'totalSelling', label: 'Total selling', type: 'currency', total: true },
        { key: 'supplier', label: 'Approved supplier' },
        { key: 'eta', label: 'ETA terms', wrap: true },
      ] as DetailTableColumn[]),
    ];

    this.itemRows = this.getSelectedRows(p.items).map((row) => ({
      item: row.detail.detail,
      partNo: this.formatPartNumber(row.detail.partNo),
      tag: this.getItemStatus(row.detail)?.label ?? '',
      qty: row.detail.quantity,
      unitCost: row.selectedSupplier.unitPrice,
      totalCost: (row.selectedSupplier.unitPrice || 0) * (row.detail.quantity || 0),
      unitSelling: row.detail.unitSellingPrice,
      totalSelling: (row.detail.quantity || 0) * (row.detail.unitSellingPrice || 0),
      supplier: row.selectedSupplier.supplierName,
      eta: row.selectedSupplier.etaTerms || '-',
    }));

    this.summaryMetrics = manual
      ? [{ label: 'Total LPO value', value: this.money(p.totalLpo) }]
      : [
          { label: 'LPO value', value: this.money(p.lpoValue) },
          { label: 'Total discount received', value: this.money(p.totalDiscountReceived), tone: p.totalDiscountReceived ? 'good' : undefined },
          { label: 'Total cost as per PR', value: this.money(prCost) },
          { label: 'Total cost as per deal sheet', value: this.money(p.totalDealCost) },
          { label: 'Profit margin', value: this.money(profit), tone: profit < 0 ? 'bad' : 'good' },
          { label: 'Deal profit', value: this.money(p.dealProfit) },
          { label: 'Difference in profit', value: this.money(diff), tone: diff < 0 ? 'bad' : diff > 0 ? 'good' : undefined },
        ];

    this.historyEntries = (p.approvalStatus ?? []).map((approval: any) => {
      const by = approval.updatedBy ? this.fullName(approval.updatedBy) : 'Pending';
      const when = approval.updatedAt ? this.datePipe.transform(approval.updatedAt, 'dd MMM yyyy, h:mm a') : '';
      const tone = approval.status === 'approved' ? 'good' : approval.status === 'rejected' ? 'bad' : 'neutral';
      return {
        text: `Step ${approval.step} ${approval.status || 'pending'}`,
        meta: [by, when].filter(Boolean).join(' · '),
        tone,
      } as DetailTimelineEntry;
    });
  }

  /**
   * Open deal sheet for the job linked to this purchase (via job.quoteId.dealData).
   * This reuses the same dialog and calculation logic pattern used in job-sheet/open-to-work.
   */
  onViewDealSheet(): void {
    const quoteData: any = this.purchase?.jobId?.quoteId;

    if (!quoteData?.dealData?.updatedItems) {
      this.notificationService.error('Deal sheet data not available');
      return;
    }

    const priceDetails = {
      totalSellingPrice: 0,
      totalCost: 0,
      profit: 0,
      perc: 0
    };

    const quoteItems = quoteData.dealData.updatedItems.map((item: any) => {
      let itemSelected = 0;

      item.itemDetails.map((itemDetail: any) => {
        if (itemDetail.dealSelected) {
          itemSelected++;
          priceDetails.totalSellingPrice += itemDetail.unitSellingPrice * itemDetail.quantity;
          priceDetails.totalCost += itemDetail.quantity * itemDetail.unitCost;
          return itemDetail;
        }
        return;
      });

      if (itemSelected) return item;
      return;
    });

    if (Array.isArray(quoteData.dealData.additionalCosts)) {
      quoteData.dealData.additionalCosts.forEach((cost: any) => {
        if (cost.type === 'Additional Cost') {
          priceDetails.totalCost += cost.value;
        } else if (cost.type === 'Supplier Discount') {
          priceDetails.totalCost -= cost.value;
        } else if (cost.type === 'Customer Discount') {
          priceDetails.totalSellingPrice -= cost.value;
        } else {
          priceDetails.totalCost += cost.value;
        }
      });
    }

    priceDetails.profit = priceDetails.totalSellingPrice - priceDetails.totalCost;
    priceDetails.perc = priceDetails.totalSellingPrice
      ? (priceDetails.profit / priceDetails.totalSellingPrice) * 100
      : 0;

    this.dialog.open(ApproveDealComponent, {
      data: {
        approval: false,
        quoteData: quoteData as Quotatation,
        quoteItems,
        priceDetails,
        quoteView: false
      },
      width: '1200x'
    });
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

  getItemStatus(detail: any): { label: string } | null {
    if (detail.merged) return { label: 'Merged' };
    if (detail.isNewlyAdded) return { label: 'New' };
    return null;
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

  async onApprove(): Promise<void> {
    if (!this.purchase?._id || !this.canApproveOrReject()) return;

    const { confirmed, reason } = await this.confirmDialog.open({
      tone: 'approve',
      title: 'Approve purchase request',
      message: 'This purchase request will be approved and move on to LPO.',
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
    this.router.navigate(['/purchase', 'edit', this.purchase._id]);
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
