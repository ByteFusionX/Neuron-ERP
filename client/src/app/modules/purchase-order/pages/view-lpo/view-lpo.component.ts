import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { MatDialog } from '@angular/material/dialog';
import { PurchaseOrderService } from 'src/app/core/services/purchaseOrder/purchaseOrder.service';
import { PurchaseService } from 'src/app/core/services/purchase/purchase.service';
import { ConfirmDialogService } from 'src/app/shared/components/confirm-dialog';
import { buildApprovalTimeline } from 'src/app/shared/utils/approval-timeline.util';
import { QuotationService } from 'src/app/core/services/quotation/quotation.service';
import { PdfPreviewComponent } from 'src/app/shared/components/pdf-preview/pdf-preview.component';
import { ApproveDealComponent } from 'src/app/modules/deal-sheet/pages/approve-deal/approve-deal.component';
import { PurchaseViewModalComponent } from 'src/app/shared/components/purchase-view-modal/purchase-view-modal.component';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { DetailTableComponent } from 'src/app/shared/components/detail-panel/detail-table.component';
import { DetailMetricsComponent } from 'src/app/shared/components/detail-panel/detail-metrics.component';
import { DetailTimelineComponent } from 'src/app/shared/components/detail-panel/detail-timeline.component';
import { DetailMetric, DetailOverviewSection, DetailTableColumn, DetailTimelineEntry } from 'src/app/shared/components/detail-panel/detail-panel.model';
import { DetailViewBadge, DetailViewBreadcrumb, DetailViewShellComponent, DetailViewStat, DetailViewTab } from 'src/app/shared/components/detail-view-shell/detail-view-shell.component';

@Component({
  selector: 'app-view-lpo',
  standalone: true,
  imports: [
    CommonModule,
    ActionButtonComponent,
    DetailTableComponent,
    DetailMetricsComponent,
    DetailTimelineComponent,
    DetailViewShellComponent
  ],
  templateUrl: './view-lpo.component.html'
})
export class ViewLpoComponent implements OnInit {
  readonly itemColumns: DetailTableColumn[] = [
    { key: 'description', label: 'Item', type: 'stack', subKey: 'partNo' },
    { key: 'quantity', label: 'Qty', type: 'number', align: 'right' },
    { key: 'unitCost', label: 'Unit cost', type: 'currency' },
    { key: 'totalCost', label: 'Total', type: 'currency', total: true, emphasis: true },
  ];
  private purchaseOrderService = inject(PurchaseOrderService);
  private purchaseService = inject(PurchaseService);
  private notificationService = inject(ToastrService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private dialog = inject(MatDialog);
  private confirmDialog = inject(ConfirmDialogService);
  private quotationService = inject(QuotationService);
  private employeeService = inject(EmployeeService);


  // view model for the shared detail-view shell
  tab = 'items';
  readonly tabs: DetailViewTab[] = [
    { id: 'items', label: 'Items' },
    { id: 'summary', label: 'Summary' },
    { id: 'history', label: 'Approval history' },
  ];

  private static readonly STATUS_TONES: Record<string, 'good' | 'warn' | 'bad' | 'neutral'> = {
    'Approved': 'good', 'Closed': 'good', 'Pending for Approval': 'warn', 'Rejected': 'bad', 'Draft': 'neutral',
  };

  get breadcrumbs(): DetailViewBreadcrumb[] {
    return [
      { label: 'Purchase', link: ['/purchase/pr'] },
      { label: 'PO', link: ['/purchase/po'] },
      { label: this.lpo?.poNo || 'LPO' },
    ];
  }

  get badges(): DetailViewBadge[] {
    const status = this.lpo?.poStatus;
    return status ? [{ label: status, tone: ViewLpoComponent.STATUS_TONES[status] ?? 'neutral' }] : [];
  }

  get subtitle(): string {
    return [this.supplier?.supplierName, this.lpo?.subject].filter(Boolean).join(' · ');
  }

  get stats(): DetailViewStat[] {
    if (!this.lpo) return [];
    return [
      { label: 'Total after discount', value: this.formatCurrency(this.getTotalAfterDiscount()) },
      { label: 'Subtotal', value: this.formatCurrency(this.getSubTotal()) },
      { label: 'Discount', value: this.formatCurrency(this.lpo.discount || 0) },
      { label: 'Items', value: String(this.items().length) },
    ];
  }

  get summaryMetrics(): DetailMetric[] {
    return [
      { label: 'Subtotal', value: this.formatCurrency(this.getSubTotal()) },
      { label: 'Discount', value: this.formatCurrency(this.lpo?.discount || 0) },
      { label: 'Total after discount', value: this.formatCurrency(this.getTotalAfterDiscount()) },
    ];
  }

  get historyEntries(): DetailTimelineEntry[] {
    return buildApprovalTimeline(this.lpo?.approvalStatus);
  }

  get sidebarSections(): DetailOverviewSection[] {
    const l = this.lpo;
    if (!l) return [];
    return [
      {
        title: 'Order',
        fields: [
          { type: 'field', label: 'PO no', value: l.poNo, numeric: true },
          { type: 'field', label: 'PO date', value: this.formatDate(l.poDate) },
          { type: 'field', label: 'PR no', value: this.purchase?.purchaseNo || '-', numeric: true },
          { type: 'field', label: 'Job no', value: this.purchase?.jobId?.jobId || l.jobId?.jobId || '-', numeric: true },
          { type: 'field', label: 'Quote ref', value: this.purchase?.jobId?.quoteId?.quoteId || l.quoteId?.quoteId || '-' },
        ],
      },
      {
        title: 'Supplier',
        fields: [
          { type: 'field', label: 'Supplier', value: this.supplier?.supplierName || '-' },
          { type: 'field', label: 'Contact', value: this.supplier?.contactDetails?.name || '-' },
          { type: 'field', label: 'Phone', value: this.supplier?.contactDetails?.phoneNumber || '-' },
          { type: 'field', label: 'Email', value: this.supplier?.contactDetails?.email || '-' },
        ],
      },
      {
        title: 'Delivery & payment',
        fields: [
          { type: 'field', label: 'Delivery terms', value: l.etaTerms || '-' },
          { type: 'field', label: 'Payment terms', value: l.paymentTerms || '-' },
          { type: 'field', label: 'Place of delivery', value: l.placeOfDelivery || '-' },
          { type: 'field', label: 'Shipping terms', value: l.shippingTerms || '-' },
        ],
      },
    ];
  }

  lpoId!: string;
  lpo: any = null;
  purchase: any = null;
  quotation: any = null;
  isLoading = signal<boolean>(true);
  supplier: any = null;
  items = signal<any[]>([]);
  currency = signal<string>('QAR');
  isApproving = false;
  isRejecting = false;
  canApprovePOs = signal<boolean>(false);
  currentEmployeeId: string | null = null;
  currentCategoryId: string | null = null;
  isSuperAdmin = false;

  ngOnInit(): void {
    this.lpoId = <string>this.route.snapshot.paramMap.get('id');
    if (!this.lpoId) {
      this.notificationService.error('Invalid LPO ID');
      this.router.navigate(['/purchase/po'], { queryParams: { view: 'pending' } });
      return;
    }
    this.checkPrivileges();
    this.loadLpo();
  }

  checkPrivileges(): void {
    this.employeeService.employeeData$.subscribe((data) => {
      this.currentEmployeeId = data?._id || null;
      this.currentCategoryId = data?.category?._id || null;
      this.isSuperAdmin = /^superadmin$/i.test(data?.category?.role ?? '');
      if (data?.category?.privileges) {
        this.canApprovePOs.set(data.category.privileges.purchaseOrder?.canApprovePOs || false);
      }
    });
  }

  isOwnLpo(): boolean {
    const createdById = this.lpo?.createdBy?._id || this.lpo?.createdBy
      || this.purchase?.createdBy?._id || this.purchase?.createdBy;
    return !!this.currentEmployeeId && !!createdById && createdById === this.currentEmployeeId;
  }

  loadLpo(): void {
    this.isLoading.set(true);
    this.purchaseOrderService.getPurchaseOrderById(this.lpoId).subscribe({
      next: (response: any) => {
        if (response.success || response._id) {
          const lpoData = response.success ? response.data : response;
          this.lpo = lpoData;
          this.supplier = lpoData.supplierId;
          this.items.set(lpoData.items || []);
          
          const currency = lpoData.quoteId?.currency || 
                          lpoData.quoteId?.dealData?.currency || 
                          lpoData.purchaseId?.jobId?.quoteId?.currency ||
                          lpoData.purchaseId?.jobId?.quoteId?.dealData?.currency ||
                          'QAR';
          this.currency.set(currency);
          
          if (lpoData.purchaseId) {
            const purchaseId = lpoData.purchaseId._id || lpoData.purchaseId;
            if (typeof purchaseId === 'string') {
              this.loadPurchase(purchaseId);
            } else {
              this.purchase = lpoData.purchaseId;
              this.isLoading.set(false);
            }
          } else {
            this.isLoading.set(false);
          }
        } else {
          this.notificationService.error('LPO not found');
          this.isLoading.set(false);
          this.router.navigate(['/purchase/po'], { queryParams: { view: 'pending' } });
        }
      },
      error: (error) => {
        this.notificationService.error('Failed to load LPO details');
        console.error('Error loading LPO:', error);
        this.isLoading.set(false);
        this.router.navigate(['/purchase/po'], { queryParams: { view: 'pending' } });
      }
    });
  }

  loadPurchase(purchaseId: string): void {
    this.purchaseService.getPurchaseById(purchaseId).subscribe({
      next: (response) => {
        this.purchase = response.data;
        if (this.purchase?.jobId?.quoteId && !this.currency() || this.currency() === 'QAR') {
          const quoteId = this.purchase.jobId.quoteId;
          const currency = quoteId?.currency || quoteId?.dealData?.currency || 'QAR';
          this.currency.set(currency);
        }
        this.isLoading.set(false);
      },
      error: (error) => {
        console.error('Error loading purchase:', error);
        this.isLoading.set(false);
      }
    });
  }

  formatPartNumber(partNo: any): string {
    if (!partNo) return '-';
    if (typeof partNo === 'string') return partNo;
    if (partNo.partNo) {
      return partNo.partNo;
    }
    return '-';
  }

  formatDate(date: any): string {
    if (!date) return '-';
    const d = new Date(date);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  formatCurrency(value: number): string {
    const currency = this.currency();
    const formattedValue = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value || 0);
    return `${formattedValue} ${currency}`;
  }

  getTotalLpoValue(): number {
    return this.items().reduce((total, item) => total + (item.totalCost || 0), 0);
  }

  getSubTotal(): number {
    return this.items().reduce((total, item) => total + (item.totalCost || 0), 0);
  }

  getTotalAfterDiscount(): number {
    const subtotal = this.getSubTotal();
    const discount = this.lpo?.discount || 0;
    return subtotal - discount;
  }

  /**
   * Open quotation preview (PDF) for the current LPO's quote reference.
   */
  onViewQuote(): void {
    let quoteData: any =
      this.lpo?.quoteId ||
      this.purchase?.jobId?.quoteId;

    if (!quoteData) {
      this.notificationService.error('Quotation details not available');
      return;
    }

    // Ensure the quotation has the enriched relational data expected by the PDF generator
    if (this.lpo?.quoteId) {
      quoteData = {
        ...quoteData,
        client: this.lpo.quoteId.client || quoteData.client,
        createdBy: this.lpo.quoteId.createdBy || quoteData.createdBy,
        attention: this.lpo.quoteId.attention || quoteData.attention,
        department: this.lpo.quoteId.department || quoteData.department
      };
    }

    const pdfDoc = this.quotationService.generatePDF(quoteData, true);
    pdfDoc.then((pdf) => {
      pdf.getBlob((blob: Blob) => {
        const url = window.URL.createObjectURL(blob);
        this.dialog.open(PdfPreviewComponent, {
          data: { url, formatedQuote: quoteData }
        });
      });
    });
  }

  /**
   * Open deal sheet for the current Job (based on the linked quotation).
   * This mirrors the behaviour from job-sheet open-to-work.
   */
  onViewDealSheet(): void {
    let quoteData: any =
      this.lpo?.quoteId ||
      this.purchase?.jobId?.quoteId;

    if (!quoteData?.dealData?.updatedItems) {
      this.notificationService.error('Deal sheet data not available');
      return;
    }

    // Enrich quoteData with client and salesperson details for the deal sheet header
    if (this.lpo?.quoteId) {
      quoteData = {
        ...quoteData,
        client: this.lpo.quoteId.client || quoteData.client,
        createdBy: this.lpo.quoteId.createdBy || quoteData.createdBy
      };
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
      data: { approval: false, quoteData, quoteItems, priceDetails },
      width: '1200x'
    });
  }

  onBack(): void {
    this.router.navigate(['/purchase/po'], { queryParams: { view: 'pending' } });
  }

  async onApprove(): Promise<void> {
    if (!this.canApproveOrReject()) return;

    const { confirmed, reason } = await this.confirmDialog.open({
      tone: 'approve',
      title: 'Approve LPO',
      message: this.approvalSteps.filter((a) => a.status === 'pending').length > 1 && !this.isSuperAdmin
        ? 'Your approval moves this LPO on to the next approval stage.'
        : 'This LPO will be approved and released to the supplier.',
      details: [
        { label: 'PO no', value: this.lpo?.poNo || '-' },
        { label: 'Supplier', value: this.supplier?.supplierName || '-' },
        { label: 'Total', value: this.formatCurrency(this.getTotalAfterDiscount()) },
      ],
      confirmLabel: 'Approve',
      reason: 'optional',
      reasonLabel: 'Approval comment',
    });
    if (!confirmed) return;

    this.isApproving = true;
    this.purchaseOrderService.approvePurchaseOrder(this.lpoId, reason ?? '').subscribe({
      next: () => {
        this.notificationService.success('LPO approved successfully');
        this.router.navigate(['/purchase/po'], { queryParams: { view: 'approved' } });
      },
      error: (error) => {
        this.notificationService.error(error.error?.message || 'Failed to approve LPO');
        this.isApproving = false;
      }
    });
  }

  async onReject(): Promise<void> {
    if (!this.canApproveOrReject()) return;

    const { confirmed, reason } = await this.confirmDialog.open({
      tone: 'reject',
      title: 'Reject LPO',
      message: 'This LPO will be sent back to the person who raised it.',
      details: [{ label: 'PO no', value: this.lpo?.poNo || '-' }, { label: 'Supplier', value: this.supplier?.supplierName || '-' }],
      confirmLabel: 'Reject',
      reason: true,
      reasonLabel: 'Rejection reason',
    });
    if (!confirmed) return;

    this.isRejecting = true;
    this.purchaseOrderService.rejectPurchaseOrder(this.lpoId, reason ?? '').subscribe({
      next: () => {
        this.notificationService.success('LPO rejected successfully');
        this.router.navigate(['/purchase/po'], { queryParams: { view: 'pending' } });
      },
      error: (error) => {
        this.notificationService.error(error.error?.message || 'Failed to reject LPO');
        this.isRejecting = false;
      }
    });
  }

  canApproveOrReject(): boolean {
    return this.lpo?.poStatus === 'Pending for Approval' && this.canApprovePOs() && (this.isSuperAdmin || !this.isOwnLpo()) && this.isMyTurn();
  }

  get approvalSteps(): any[] {
    return [...(this.lpo?.approvalStatus || [])].sort((a, b) => a.step - b.step);
  }

  /** Approval stage currently waiting (the lowest pending step), as the workflow routes one stage at a time. */
  get currentStepApprovals(): any[] {
    const pending = this.approvalSteps.filter((a) => a.status === 'pending');
    return pending.filter((a) => a.step === pending[0]?.step);
  }

  /** LPOs raised before the workflow was wired in have no steps and stay open to any approver. */
  isMyTurn(): boolean {
    if (!this.approvalSteps.length) return true;
    if (this.isSuperAdmin) return true;
    return this.currentStepApprovals.some((a) =>
      a.managerApproval ? a.approver === this.currentEmployeeId : (a.role?._id || a.role) === this.currentCategoryId
    );
  }

  stepLabel(step: any): string {
    return step.managerApproval ? 'Reporting manager' : (step.role?.categoryName || 'Approver');
  }

  stepActor(step: any): string {
    const by = step.updatedBy;
    return by ? `${by.firstName ?? ''} ${by.lastName ?? ''}`.trim() : '';
  }

  onViewPurchase(): void {
    if (!this.purchase) {
      this.notificationService.error('Purchase details not available');
      return;
    }

    this.dialog.open(PurchaseViewModalComponent, {
      data: {
        purchase: this.purchase
      },
      width: '1400px',
      maxHeight: '90vh',
      panelClass: 'purchase-view-modal'
    });
  }

  itemRows(): Record<string, any>[] {
    return this.items().map((item: any) => ({
      description: item.detail || '-', partNo: (v => v === '-' ? '' : v)(this.formatPartNumber(item.partNo)),
      quantity: item.quantity || 0, unitCost: item.unitCost || 0, totalCost: item.totalCost || 0,
    }));
  }
}
