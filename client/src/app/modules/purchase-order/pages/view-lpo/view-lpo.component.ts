import { ALLOWED_UPLOAD_TYPES } from 'src/app/shared/constants/upload-types';
import { NgIcon } from '@ng-icons/core';
import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { MatDialog } from '@angular/material/dialog';
import { PurchaseOrderService } from 'src/app/core/services/purchaseOrder/purchaseOrder.service';
import { PurchaseService } from 'src/app/core/services/purchase/purchase.service';
import { GrnService } from 'src/app/core/services/grn/grn.service';
import { ConfirmDialogService } from 'src/app/shared/components/confirm-dialog';
import { PlaceOrderModalComponent, PlaceOrderModalResult } from '../place-order-modal/place-order-modal.component';
import { buildApprovalTimeline } from 'src/app/shared/utils/approval-timeline.util';
import { AuditLogService } from 'src/app/core/services/audit-log.service';
import { toTimelineEntries } from 'src/app/shared/utils/audit-timeline.util';
import { PdfPreviewComponent } from 'src/app/shared/components/pdf-preview/pdf-preview.component';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { ActionMenuComponent, ActionMenuItem } from 'src/app/shared/components/action-menu/action-menu.component';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { DetailTableComponent } from 'src/app/shared/components/detail-panel/detail-table.component';
import { DetailTimelineComponent } from 'src/app/shared/components/detail-panel/detail-timeline.component';
import { DetailSectionComponent } from 'src/app/shared/components/detail-panel/detail-section.component';
import { DetailFieldComponent } from 'src/app/shared/components/detail-panel/detail-field.component';
import { DetailFieldsMenuComponent, DetailFieldsMenuItem } from 'src/app/shared/components/detail-panel/detail-fields-menu.component';
import { DETAIL_TONE, DetailTone } from 'src/app/shared/components/detail-panel/detail-tone';
import saveAs from 'file-saver';
import { ModalService } from 'src/app/shared/components/modal';
import { DetailDocumentsComponent } from 'src/app/shared/components/detail-panel/detail-documents.component';
import { DocumentUploadModalComponent, DocumentUploadModalResult } from 'src/app/shared/components/detail-panel/document-upload-modal/document-upload-modal.component';
import { DetailDocument, DetailFootRow, DetailTableColumn, DetailTimelineEntry } from 'src/app/shared/components/detail-panel/detail-panel.model';
import { DetailViewShellComponent, DetailViewStat } from 'src/app/shared/components/detail-view-shell/detail-view-shell.component';

/** A label/value in the Details section; ids link out, the status shows as dot + text. */
interface LpoFact {
  label: string;
  value: string;
  link?: any[];
  state?: { dot: string; text: string };
}

type LpoPanelTab = 'pricing' | 'grn' | 'terms' | 'documents' | 'approval' | 'history';

@Component({
  selector: 'app-view-lpo',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    ActionButtonComponent,
    ActionMenuComponent,
    DetailTableComponent,
    DetailTimelineComponent,
    DetailDocumentsComponent,
    DetailSectionComponent,
    DetailFieldComponent,
    DetailFieldsMenuComponent,
    DetailViewShellComponent,
    NgIcon
  ],
  templateUrl: './view-lpo.component.html'
})
export class ViewLpoComponent implements OnInit {
  readonly itemColumns: DetailTableColumn[] = [
    { key: 'detail', label: 'Description', truncate: true, tooltipKey: 'detailText' },
    { key: 'itemCode', label: 'Item code', hiddenByDefault: true },
    { key: 'partNo', label: 'Part No', hiddenByDefault: true },
    { key: 'quantity', label: 'Qty', type: 'number', align: 'right' },
    { key: 'uom', label: 'UOM' },
    { key: 'receivedQty', label: 'Received', type: 'number', align: 'right', hiddenByDefault: true },
    { key: 'cancelledQty', label: 'Cancelled', type: 'number', align: 'right', hiddenByDefault: true },
    { key: 'unitCost', label: 'Unit cost', type: 'currency' },
    { key: 'totalCost', label: 'Total cost', type: 'currency', emphasis: true, total: true },
  ];
  private purchaseOrderService = inject(PurchaseOrderService);
  private purchaseService = inject(PurchaseService);
  private grnService = inject(GrnService);
  private notificationService = inject(ToastrService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private dialog = inject(MatDialog);
  private modal = inject(ModalService);
  private confirmDialog = inject(ConfirmDialogService);
  private employeeService = inject(EmployeeService);
  private auditLog = inject(AuditLogService);

  /** Audit-log events; approve/reject are left out because the Approval history tab already shows them. */
  auditEntries: DetailTimelineEntry[] = [];

  // view model, same layout as the PR view; rebuilt by buildView() when the LPO or its PR loads
  panelOpen = true;
  panelTab: LpoPanelTab = 'pricing';
  panelTabs: { id: LpoPanelTab; label: string }[] = [];
  stats: DetailViewStat[] = [];
  subtitle = '';
  detailFacts: LpoFact[] = [];
  detailItems: DetailFieldsMenuItem[] = [];
  hiddenDetail = new Set<string>();
  detailOrder: string[] = [];
  pricingLines: { label: string; value: number; sign?: boolean; total?: boolean }[] = [];
  historyEntries: DetailTimelineEntry[] = [];
  /** Detail fields that are switched on, in the user's order. */
  get visibleDetail(): LpoFact[] {
    const pos = (k: string) => { const i = this.detailOrder.indexOf(k); return i < 0 ? this.detailOrder.length : i; };
    return this.detailFacts.filter((f) => !this.hiddenDetail.has(f.label)).sort((a, b) => pos(a.label) - pos(b.label));
  }
  trackFact = (_: number, f: LpoFact) => f.label;

  /** Documents are kept once the order is approved. */
  get showDocuments(): boolean {
    return ['Approved', 'Placed'].includes(this.lpo?.poStatus);
  }

  canManageDocuments(): boolean {
    return this.showDocuments && (this.isSuperAdmin || this.canInitiateLPO());
  }

  isUploadingFiles = false;
  readonly acceptedFiles = ALLOWED_UPLOAD_TYPES;

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

  private static readonly STATUS_TONES: Record<string, DetailTone> = {
    'Approved': 'good', 'Placed': 'good', 'Closed': 'good', 'Cancelled': 'bad', 'Pending for Approval': 'warn', 'Rejected': 'bad', 'Draft': 'neutral',
  };

  private fullName(person: any): string {
    return person?.firstName ? `${person.firstName} ${person.lastName ?? ''}`.trim() : '-';
  }

  private buildView(): void {
    const l = this.lpo;
    if (!l) return;
    const s = this.supplier;
    const pr = this.purchase;
    const date = (v: any) => v ? new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
    const subtotal = this.getSubTotal();
    const discount = Number(l.discount) || 0;

    this.subtitle = [s?.supplierName, l.subject].filter(Boolean).join(' · ');

    this.stats = [
      { label: 'Subtotal', value: this.formatCurrency(subtotal) },
      { label: 'Discount', value: this.formatCurrency(discount) },
      { label: 'Total after discount', value: this.formatCurrency(subtotal - discount) },
    ];

    // the supplier's first contact, or the legacy single contact block
    const contact = s?.contacts?.[0] || s?.contactDetails || {};
    const job = pr?.jobId || l.jobId;
    const quote = pr?.jobId?.quoteId || l.quoteId;
    const tone = DETAIL_TONE[ViewLpoComponent.STATUS_TONES[l.poStatus] ?? 'neutral'];
    const facts: (LpoFact | false)[] = [
      { label: 'Supplier', value: s?.supplierName || '-' },
      { label: 'PO Date', value: date(l.poDate) },
      { label: 'PR No', value: pr?.purchaseNo || '-', link: pr?._id ? ['/purchase/view-purchase', pr._id] : undefined },
      { label: 'Job ID', value: job?.jobId || '-', link: job?._id && job?.jobId ? ['/job-sheet/view', job._id] : undefined },
      { label: 'Quotation', value: quote?.quoteId || '-', link: quote?._id && quote?.quoteId ? ['/quotations/view', quote._id] : undefined },
      { label: 'Contact', value: contact.name || '-' },
      { label: 'Phone', value: contact.phoneNumber || '-' },
      { label: 'Email', value: contact.email || '-' },
      { label: 'Delivery Terms', value: l.etaTerms || '-' },
      { label: 'Payment Terms', value: l.paymentTerms || '-' },
      { label: 'Shipping Terms', value: l.shippingTerms || '-' },
      { label: 'Place of Delivery', value: l.placeOfDelivery || '-' },
      !!l.expectedDeliveryDate && { label: 'Expected Delivery', value: date(l.expectedDeliveryDate) },
      !!l.placedAt && { label: 'Placed On', value: date(l.placedAt) },
      { label: 'Created By', value: this.fullName(l.createdBy) },
      { label: 'Created On', value: date(l.createdAt) },
      { label: 'Currency', value: this.currency() },
      { label: 'Status', value: l.poStatus === 'Pending for Approval' ? 'Pending' : (l.poStatus || '-'), state: { dot: tone.dot, text: tone.text } },
    ];
    this.detailFacts = facts.filter((f): f is LpoFact => !!f);
    const hidden = ['Phone', 'Email', 'Shipping Terms', 'Currency', 'Created On'];
    this.detailItems = this.detailFacts.map((f) => ({ key: f.label, label: f.label, hiddenByDefault: hidden.includes(f.label) }));

    // Cost is the job's (deal sheet) cost, Price is what the PO pays; both for this PO's items only.
    const key = (v: any) => String(v?._id ?? v ?? '').trim().toLowerCase();
    const details: any[] = (pr?.items || []).flatMap((i: any) => i?.itemDetails || []);
    const jobUnitCost = (line: any) => {
      const match = details.find((d) => line?.partNo && key(d.partNo) === key(line.partNo))
        || details.find((d) => key(d.detail) === key(line?.detail));
      return Number(match?.dealUnitCost) || Number(match?.unitCost) || Number(line?.unitCost) || 0;
    };
    const totalCost = this.items().reduce((sum, i) => sum + jobUnitCost(i) * (Number(i.quantity) || 0), 0);
    this.pricingLines = [
      { label: 'Total Price', value: subtotal },
      { label: 'Total Cost', value: totalCost },
      { label: 'Total Discount', value: discount },
      { label: 'Net Total', value: Math.max(subtotal - discount, 0) },
    ];

    this.panelTabs = [
      { id: 'pricing', label: 'Costs' },
      ...(l.termsAndCondition ? [{ id: 'terms' as const, label: 'Terms' }] : []),
      ...(this.showDocuments ? [{ id: 'documents' as const, label: 'Documents' }] : []),
      { id: 'approval', label: 'Approval' },
      { id: 'history', label: 'History' },
    ];
    this.panelTabs.splice(1, 0, { id: 'grn', label: 'GRN' });
    if (!this.panelTabs.some((t) => t.id === this.panelTab)) this.panelTab = 'pricing';

    this.historyEntries = buildApprovalTimeline(l.approvalStatus);
    // cached so the table does not reset on every change detection
    this.lineRows = this.itemRows();
    this.lineFootRows = this.itemFootRows();
  }

  lineRows: Record<string, any>[] = [];
  lineFootRows: DetailFootRow[] = [];

  /** GRNs raised against this PO, one row per received line. */
  readonly grnColumns: DetailTableColumn[] = [
    { key: 'docNo', label: 'GRN No', type: 'text', width: '1%' },
    { key: 'description', label: 'Item Description', type: 'text', truncate: true, hoverOnly: true, width: '100%' },
    { key: 'receivedQty', label: 'Received', type: 'number', align: 'right' },
    { key: 'acceptedQty', label: 'Accepted', type: 'number', align: 'right' },
    { key: 'rejectedQty', label: 'Rejected', type: 'number', align: 'right' },
    { key: 'value', label: 'Cost', type: 'currency', align: 'right', total: true },
    { key: 'status', label: 'Status', type: 'badge' },
    { key: 'date', label: 'Date', type: 'date' },
  ];
  grnRows: Record<string, any>[] = [];
  grnFootRows: DetailFootRow[] = [];
  grnStatus: 'idle' | 'loading' | 'ready' | 'error' = 'idle';

  selectPanelTab(tab: LpoPanelTab): void {
    this.panelTab = tab;
    if (tab === 'grn') this.loadGrns();
  }

  private loadGrns(): void {
    if (this.grnStatus === 'loading' || this.grnStatus === 'ready') return;
    this.grnStatus = 'loading';
    this.grnService.getAllGRNsByLpoId(this.lpoId).subscribe({
      next: (res: any) => {
        const key = (v: any) => String(v ?? '').trim().toLowerCase();
        const lines = this.items();
        const unitCost = (item: any) => {
          const part = key(item?.partNo?.partNo ?? item?.partNo);
          const line = lines.find((l) => part && part !== '-' && key(l.partNo?.partNo ?? l.partNo) === part)
            || lines.find((l) => key(l.detail) === key(item?.itemDescription));
          return Number(line?.unitCost) || 0;
        };
        const rows: Record<string, any>[] = [];
        for (const g of res?.data ?? []) {
          for (const i of g.items ?? []) {
            const received = Number(i.receivedQty) || 0;
            const accepted = Number(i.acceptedQty) || 0;
            rows.push({
              docNo: g.grnNo,
              _link: ['/grn/view-grn', g._id],
              description: i.itemDescription || '-',
              receivedQty: received,
              acceptedQty: accepted,
              rejectedQty: Math.max(received - accepted, 0),
              value: accepted * unitCost(i),
              status: g.outcomeStatus || '-',
              date: g.grnDate,
            });
          }
        }
        this.grnRows = rows;
        this.grnFootRows = [{ label: 'Total', emphasis: true, cells: {
          value: { value: rows.reduce((s, r) => s + r['value'], 0), format: 'currency' },
        } }];
        this.grnStatus = 'ready';
      },
      error: () => (this.grnStatus = 'error'),
    });
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
  isResending = false;
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
          this.auditLog.getHistory('purchaseOrder', this.lpoId).subscribe({
            next: (entries) => (this.auditEntries = toTimelineEntries((entries || []).filter((e) => e.action !== 'approved' && e.action !== 'rejected'))),
            error: () => (this.auditEntries = []),
          });
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
              this.buildView();
              this.isLoading.set(false);
            }
          } else {
            this.buildView();
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
        this.buildView();
        this.isLoading.set(false);
      },
      error: (error) => {
        console.error('Error loading purchase:', error);
        this.buildView();
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

  /** A rejected LPO can go back for approval by whoever raised it (or a Super Admin). */
  canResend(): boolean {
    return this.lpo?.poStatus === 'Rejected' && (this.isSuperAdmin || (this.canInitiateLPO() && this.isOwnLpo()));
  }

  async onResend(): Promise<void> {
    if (!this.canResend()) return;
    const { confirmed } = await this.confirmDialog.open({
      tone: 'approve',
      title: 'Resend LPO for approval',
      message: 'This LPO will go through the approval workflow again.',
      details: [
        { label: 'PO no', value: this.lpo?.poNo || '-' },
        { label: 'Supplier', value: this.supplier?.supplierName || '-' },
        { label: 'Total', value: this.formatCurrency(this.getTotalAfterDiscount()) },
      ],
      confirmLabel: 'Resend',
    });
    if (!confirmed) return;

    this.isResending = true;
    this.purchaseOrderService.resendPurchaseOrder(this.lpoId).subscribe({
      next: () => {
        this.notificationService.success('LPO sent for approval again');
        this.isResending = false;
        this.loadLpo();
      },
      error: (error) => {
        this.notificationService.error(error.error?.message || 'Failed to resend the LPO');
        this.isResending = false;
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
    return this.items().map((item: any) => {
      const partNo = this.formatPartNumber(item.partNo);
      return {
        detail: item.detail || '-',
        detailText: `${item.detail ?? ''} ${partNo === '-' ? '' : partNo}`.trim(),
        itemCode: item.partNo?.itemCode || '-',
        partNo,
        quantity: item.quantity || 0,
        uom: item.uom || '-',
        receivedQty: item.receivedQty || 0,
        cancelledQty: item.cancelledQty || 0,
        unitCost: item.unitCost || 0,
        totalCost: item.totalCost || 0,
      };
    });
  }

  itemFootRows(): DetailFootRow[] {
    const totalQty = this.items().reduce((sum, i) => sum + (Number(i.quantity) || 0), 0);
    const discount = Number(this.lpo?.discount) || 0;
    const cost = (value: number) => ({ totalCost: { value, format: 'currency' as const } });
    return [
      { label: 'Total', cells: { quantity: { value: totalQty, format: 'number' }, ...cost(this.getSubTotal()) } },
      { label: 'Discount', cells: cost(discount) },
      { label: 'Net Total', cells: cost(Math.max(this.getSubTotal() - discount, 0)), emphasis: true },
    ];
  }
}
