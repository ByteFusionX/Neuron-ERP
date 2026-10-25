import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { MatDialog } from '@angular/material/dialog';
import { PurchaseOrderService } from 'src/app/core/services/purchaseOrder/purchaseOrder.service';
import { PurchaseService } from 'src/app/core/services/purchase/purchase.service';
import { ConfirmDialogService } from 'src/app/shared/components/confirm-dialog';
import { PlaceOrderModalComponent, PlaceOrderModalResult } from '../place-order-modal/place-order-modal.component';
import { buildApprovalTimeline } from 'src/app/shared/utils/approval-timeline.util';
import { PdfPreviewComponent } from 'src/app/shared/components/pdf-preview/pdf-preview.component';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { ActionMenuComponent, ActionMenuItem } from 'src/app/shared/components/action-menu/action-menu.component';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { DetailTableComponent } from 'src/app/shared/components/detail-panel/detail-table.component';
import { DetailMetricsComponent } from 'src/app/shared/components/detail-panel/detail-metrics.component';
import { DetailTimelineComponent } from 'src/app/shared/components/detail-panel/detail-timeline.component';
import saveAs from 'file-saver';
import { ModalService } from 'src/app/shared/components/modal';
import { DetailDocumentsComponent } from 'src/app/shared/components/detail-panel/detail-documents.component';
import { DocumentUploadModalComponent, DocumentUploadModalResult } from 'src/app/shared/components/detail-panel/document-upload-modal/document-upload-modal.component';
import { DetailDocument, DetailMetric, DetailOverviewSection, DetailTableColumn, DetailTimelineEntry } from 'src/app/shared/components/detail-panel/detail-panel.model';
import { DetailViewBadge, DetailViewBreadcrumb, DetailViewShellComponent, DetailViewStat, DetailViewTab } from 'src/app/shared/components/detail-view-shell/detail-view-shell.component';

@Component({
  selector: 'app-view-lpo',
  standalone: true,
  imports: [
    CommonModule,
    ActionButtonComponent,
    ActionMenuComponent,
    DetailTableComponent,
    DetailMetricsComponent,
    DetailTimelineComponent,
    DetailDocumentsComponent,
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
  private modal = inject(ModalService);
  private confirmDialog = inject(ConfirmDialogService);
  private employeeService = inject(EmployeeService);


  // view model for the shared detail-view shell
  tab = 'items';
  // Cached: a getter returning a fresh array every change detection makes the shell's ngOnChanges
  // re-sync from the URL on each cycle and snap the tab back to the default.
  private tabsCache: DetailViewTab[] = [];
  private tabsCacheDocs: boolean | null = null;
  get tabs(): DetailViewTab[] {
    const docs = this.showDocuments;
    if (this.tabsCacheDocs !== docs) {
      this.tabsCacheDocs = docs;
      this.tabsCache = [
        { id: 'items', label: 'Items' },
        { id: 'summary', label: 'Summary' },
        ...(docs ? [{ id: 'documents', label: 'Documents' }] : []),
        { id: 'history', label: 'Approval history' },
      ];
    }
    return this.tabsCache;
  }

  /** Documents are kept once the order is approved. */
  get showDocuments(): boolean {
    return ['Approved', 'Placed'].includes(this.lpo?.poStatus);
  }

  canManageDocuments(): boolean {
    return this.showDocuments && (this.isSuperAdmin || this.canInitiateLPO());
  }

  isUploadingFiles = false;
  readonly acceptedFiles = '.jpg,.jpeg,.png,.pdf,.doc,.docx,.xlsx,.msg,.dwg';

  get documents(): DetailDocument[] {
    return (this.lpo?.documents ?? []).map((file: any) => ({
      id: file.fileName,
      name: file.originalname || file.fileName,
      kind: file.mimetype?.split('/').pop(),
      size: file.size ? `${Math.max(1, Math.round(file.size / 1024))} KB` : undefined,
      date: file.uploadedAt,
    }));
  }

  documentRemoveDetails = (doc: DetailDocument) => [
    { label: 'PO no', value: this.lpo?.poNo ?? '' },
    { label: 'Supplier', value: this.supplier?.supplierName ?? '' },
    { label: 'File Name', value: doc.name },
  ];

  startDocumentUpload(): void {
    if (!this.canManageDocuments()) return;
    this.modal.open<DocumentUploadModalResult>(DocumentUploadModalComponent, {
      width: '680px',
      data: { context: this.lpo?.poNo || this.lpoId, acceptedFiles: this.acceptedFiles, title: 'Upload PO documents' },
    }).afterClosed().subscribe((result) => {
      if (result?.files?.length) this.uploadDocuments(result.files);
    });
  }

  private uploadDocuments(files: File[]): void {
    if (this.isUploadingFiles) return;
    this.isUploadingFiles = true;
    this.purchaseOrderService.addPurchaseOrderDocuments(this.lpoId, files).subscribe({
      next: (res) => {
        this.lpo = { ...this.lpo, documents: res.data?.documents ?? this.lpo.documents };
        this.isUploadingFiles = false;
        this.notificationService.success('Files uploaded successfully');
      },
      error: (error) => {
        this.isUploadingFiles = false;
        this.notificationService.error(error.error?.message || 'Failed to upload files');
      },
    });
  }

  onDocumentRemove(doc: DetailDocument): void {
    this.purchaseOrderService.removePurchaseOrderDocument(this.lpoId, doc.id).subscribe({
      next: (res) => {
        this.lpo = { ...this.lpo, documents: res.data?.documents ?? this.documents.filter((d) => d.id !== doc.id) };
        this.notificationService.success('File deleted');
      },
      error: (error) => this.notificationService.error(error.error?.message || 'Failed to delete file'),
    });
  }

  private fetchDocument(doc: DetailDocument, then: (blob: Blob) => void): void {
    this.purchaseOrderService.getFile(doc.id).subscribe({
      next: then,
      error: (error) => {
        if (error.status === 404) this.notificationService.warning('The file was not found on the server.');
        else this.notificationService.error('An error occurred while opening the file.');
      },
    });
  }

  private static readonly PREVIEW_MIME: Record<string, string> = {
    pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
    webp: 'image/webp', svg: 'image/svg+xml', txt: 'text/plain',
  };

  onDocumentOpen(doc: DetailDocument): void {
    this.fetchDocument(doc, (blob) => {
      // S3 often serves octet-stream, which makes the browser download instead of preview.
      const mime = ViewLpoComponent.PREVIEW_MIME[doc.id.split('.').pop()?.toLowerCase() ?? ''];
      const url = window.URL.createObjectURL(mime ? new Blob([blob], { type: mime }) : blob);
      window.open(url, '_blank');
      setTimeout(() => window.URL.revokeObjectURL(url), 60000);
    });
  }

  onDocumentDownload(doc: DetailDocument): void {
    this.fetchDocument(doc, (blob) => saveAs(blob, doc.name));
  }

  private static readonly STATUS_TONES: Record<string, 'good' | 'warn' | 'bad' | 'neutral'> = {
    'Approved': 'good', 'Placed': 'good', 'Closed': 'good', 'Cancelled': 'bad', 'Pending for Approval': 'warn', 'Rejected': 'bad', 'Draft': 'neutral',
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
          ...(l.expectedDeliveryDate ? [{ type: 'field' as const, label: 'Expected delivery', value: new Date(l.expectedDeliveryDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) }] : []),
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
  isPlacing = false;
  canApprovePOs = signal<boolean>(false);
  canInitiateLPO = signal<boolean>(false);
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
        this.canInitiateLPO.set(data.category.privileges.purchaseOrder?.canInitiateLPO || false);
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

  isPreviewing = false;
  isDownloading = false;
  isDownloadingStamped = false;

  /** PDF actions live in the More menu, same as the quotation view. */
  get moreItems(): ActionMenuItem[] {
    return [
      { id: 'preview', label: this.isPreviewing ? 'Preparing…' : 'Preview PDF', disabled: !this.lpo || this.isPreviewing },
      { id: 'stamped', label: this.isDownloadingStamped ? 'Generating…' : 'Download stamped PDF', disabled: !this.lpo || this.isDownloadingStamped },
      { id: 'pdf', label: this.isDownloading ? 'Generating…' : 'Download PDF', disabled: !this.lpo || this.isDownloading },
    ];
  }

  onMenu(id: string): void {
    switch (id) {
      case 'preview': this.onPreviewPdf(); break;
      case 'stamped': this.onDownloadPdf(true); break;
      case 'pdf': this.onDownloadPdf(false); break;
    }
  }

  onDownloadPdf(includeStamp: boolean): void {
    const po = this.lpo;
    if (!po) return;
    if (includeStamp) this.isDownloadingStamped = true;
    else this.isDownloading = true;
    this.purchaseService.generatePDF(po, includeStamp)
      .then((pdf) => pdf.download(`${String(po.poNo || 'purchase-order').replace(/[^a-zA-Z0-9._-]+/g, '_')}.pdf`))
      .catch(() => this.notificationService.error('Error generating PDF. Please try again.'))
      .finally(() => {
        if (includeStamp) this.isDownloadingStamped = false;
        else this.isDownloading = false;
      });
  }

  onPreviewPdf(): void {
    const po = this.lpo;
    if (!po) return;
    this.isPreviewing = true;
    this.purchaseService.generatePDF(po, false)
      .then((pdf) => {
        pdf.getBlob((blob: Blob) => {
          this.isPreviewing = false;
          this.dialog.open(PdfPreviewComponent, { data: { url: window.URL.createObjectURL(blob), formatedQuote: po, type: 'purchase' } });
        });
      })
      .catch(() => {
        this.isPreviewing = false;
        this.notificationService.error('Error generating PDF. Please try again.');
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

  /** Placing is manual, by someone who can issue LPOs, once the LPO is approved. */
  canPlace(): boolean {
    return this.lpo?.poStatus === 'Approved' && (this.isSuperAdmin || this.canInitiateLPO());
  }

  onPlace(): void {
    if (!this.canPlace()) return;
    const contacts: any[] = this.supplier?.contacts || [];
    this.modal.open<PlaceOrderModalResult>(PlaceOrderModalComponent, {
      width: '560px',
      data: {
        context: this.lpo?.poNo || this.lpoId,
        supplierName: this.supplier?.supplierName,
        amount: this.formatCurrency(this.getTotalAfterDiscount()),
        contactOptions: contacts.map((c) => ({ label: [c.name, c.designation].filter(Boolean).join(' · '), value: String(c._id) })),
      },
    }).afterClosed().subscribe((result) => {
      if (!result) return;
      this.isPlacing = true;
      this.purchaseOrderService.placePurchaseOrder(this.lpoId, result.expectedDeliveryDate, result.contactId, result.note).subscribe({
        next: () => {
          this.notificationService.success('Order placed');
          this.isPlacing = false;
          this.loadLpo();
        },
        error: (error) => {
          this.notificationService.error(error.error?.message || 'Failed to place the order');
          this.isPlacing = false;
        }
      });
    });
  }

  canApproveOrReject(): boolean {
    if (this.lpo?.poStatus !== 'Pending for Approval') return false;
    return this.isSuperAdmin || (this.canApprovePOs() && !this.isOwnLpo() && this.isMyTurn());
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

  itemRows(): Record<string, any>[] {
    return this.items().map((item: any) => ({
      description: item.detail || '-', partNo: (v => v === '-' ? '' : v)(this.formatPartNumber(item.partNo)),
      quantity: item.quantity || 0, unitCost: item.unitCost || 0, totalCost: item.totalCost || 0,
    }));
  }
}
