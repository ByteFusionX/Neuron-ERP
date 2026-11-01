import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { MatDialog } from '@angular/material/dialog';
import { GrnService } from 'src/app/core/services/grn/grn.service';
import { PdfPreviewComponent } from 'src/app/shared/components/pdf-preview/pdf-preview.component';
import { FileUploadModalComponent, FileUploadModalData } from 'src/app/shared/components/file-upload-modal/file-upload-modal.component';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { DetailViewShellComponent, DetailViewStat } from 'src/app/shared/components/detail-view-shell/detail-view-shell.component';
import { DetailSectionComponent } from 'src/app/shared/components/detail-panel/detail-section.component';
import { DetailFieldComponent } from 'src/app/shared/components/detail-panel/detail-field.component';
import { DetailFieldsMenuComponent, DetailFieldsMenuItem } from 'src/app/shared/components/detail-panel/detail-fields-menu.component';
import { DetailDocumentsComponent } from 'src/app/shared/components/detail-panel/detail-documents.component';
import { DetailTableComponent } from 'src/app/shared/components/detail-panel/detail-table.component';
import { DetailTimelineComponent } from 'src/app/shared/components/detail-panel/detail-timeline.component';
import { DetailDocument, DetailFootRow, DetailTableColumn, DetailTimelineEntry } from 'src/app/shared/components/detail-panel/detail-panel.model';
import { AuditLogService } from 'src/app/core/services/audit-log.service';
import { toTimelineEntries } from 'src/app/shared/utils/audit-timeline.util';
import { DETAIL_TONE, DetailTone } from 'src/app/shared/components/detail-panel/detail-tone';

const STATUS_TONES: Record<string, DetailTone> = {
  Completed: 'good',
  Resolved: 'good',
  Closed: 'good',
  Placed: 'active',
  'Return Required': 'warn',
  'Return in Progress': 'active',
  'Ready for Invoice': 'info',
  'Blocked by Return': 'bad',
  Passed: 'good',
  Partial: 'warn',
  Failed: 'bad',
};

/** A label/value in the Details section or a side panel; ids link out, statuses show as dot + text. */
interface GrnFact {
  label: string;
  value: string;
  link?: any[];
  state?: { dot: string; text: string };
}

type PanelTab = 'order' | 'inspection' | 'documents' | 'history';

@Component({
  selector: 'app-view-grn',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    ActionButtonComponent,
    DetailViewShellComponent,
    DetailSectionComponent,
    DetailFieldComponent,
    DetailFieldsMenuComponent,
    DetailDocumentsComponent,
    DetailTableComponent,
    DetailTimelineComponent,
  ],
  templateUrl: './view-grn.component.html',
  styleUrl: './view-grn.component.css'
})
export class ViewGrnComponent implements OnInit {
  private grnService = inject(GrnService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private toastr = inject(ToastrService);
  private dialog = inject(MatDialog);
  private auditLog = inject(AuditLogService);
  auditEntries: DetailTimelineEntry[] = [];

  grnId!: string;
  grn: any = null;
  isLoading = signal<boolean>(true);
  purchaseId: string = '';
  isGenerating = signal<boolean>(false);

  // view model — rebuilt by buildDetails() on every load
  panelOpen = true;
  panelTab: PanelTab = 'order';
  // stable array: a getter that builds a new one each change detection re-creates the buttons and swallows clicks
  readonly panelTabs: { id: PanelTab; label: string }[] = [
    { id: 'order', label: 'Order' },
    { id: 'inspection', label: 'Inspection' },
    { id: 'documents', label: 'Documents' },
    { id: 'history', label: 'History' },
  ];

  subtitle = '';
  receiver = '';
  stats: DetailViewStat[] = [];
  private detailFacts: GrnFact[] = [];
  detailItems: DetailFieldsMenuItem[] = [];
  hiddenDetail = new Set<string>();
  detailOrder: string[] = [];
  get visibleDetail(): GrnFact[] {
    const pos = (k: string) => { const i = this.detailOrder.indexOf(k); return i < 0 ? this.detailOrder.length : i; };
    return this.detailFacts.filter((f) => !this.hiddenDetail.has(f.label)).sort((a, b) => pos(a.label) - pos(b.label));
  }
  trackFact = (_: number, f: GrnFact) => f.label;
  orderFacts: GrnFact[] = [];
  inspectionFacts: GrnFact[] = [];
  returnFacts: GrnFact[] = [];
  inspectionNotes = '';
  itemColumns: DetailTableColumn[] = [];
  itemRows: Record<string, any>[] = [];
  itemFootRows: DetailFootRow[] = [];
  docList: DetailDocument[] = [];
  private docFiles = new Map<string, any>();

  /** Where "Back" should land, when the caller passed one (e.g. the GRN list). */
  private returnUrl = '';

  ngOnInit(): void {
    this.grnId = <string>this.route.snapshot.paramMap.get('id');
    this.returnUrl = this.route.snapshot.queryParams['returnUrl'] || '';

    if (!this.grnId) {
      this.toastr.error('Invalid GRN ID');
      this.navigateAway();
      return;
    }
    this.loadGRN();
  }

  loadGRN(): void {
    this.isLoading.set(true);
    this.grnService.getGRNById(this.grnId).subscribe({
      next: (response: any) => {
        if (response.success && response.data) {
          this.grn = response.data;
          this.purchaseId = this.grn.purchaseOrderId?._id || this.grn.purchaseOrderId || '';
          this.buildDetails();
          this.isLoading.set(false);
          this.auditLog.getHistory('grn', this.grnId).subscribe({ next: (e) => (this.auditEntries = toTimelineEntries(e)), error: () => (this.auditEntries = []) });
        } else {
          this.toastr.error('GRN not found');
          this.isLoading.set(false);
          this.purchaseId = this.purchaseId || response.data?.purchaseOrderId?._id || response.data?.purchaseOrderId || '';
          this.navigateAway();
        }
      },
      error: (error) => {
        this.toastr.error('Failed to load GRN details');
        console.error('Error loading GRN:', error);
        this.isLoading.set(false);
        this.purchaseId = this.purchaseId
          || this.grn?.purchaseOrderId?._id || this.grn?.purchaseOrderId
          || error?.error?.data?.purchaseOrderId?._id || error?.error?.data?.purchaseOrderId
          || '';
        this.navigateAway();
      }
    });
  }

  private state(value: string): { dot: string; text: string } {
    const tone = DETAIL_TONE[STATUS_TONES[value] ?? 'neutral'];
    return { dot: tone.dot, text: tone.text };
  }

  /** The shell takes new-array inputs, so everything it shows is built once per load. */
  private buildDetails(): void {
    const g = this.grn;
    const po = g?.purchaseOrderId;
    const pr = po?.purchaseId;
    const supplier = po?.supplierId?.supplierName;
    const rejected = this.getTotalRejectedQty();
    const outcome = g?.outcomeStatus || (rejected > 0 ? 'Return Required' : 'Completed');
    const job = g?.jobId?._id ? g.jobId : pr?.jobId;
    const destination = g?.destinationType === 'site'
      ? ['Site', g?.siteName].filter(Boolean).join(' · ')
      : g?.warehouse?.wareHouseName || '-';

    this.subtitle = [supplier, this.getCompanyName()].filter(Boolean).join(' · ');
    this.receiver = this.formatEmployeeName(g?.receivedBy);

    // money summary priced off the LPO lines; discount is the LPO's own, else the PR's per-supplier one
    const money = this.priceSummary();
    this.stats = [
      { label: 'Received value', value: money.received },
      { label: 'Rejected value', value: money.rejected, danger: rejected > 0 },
      { label: 'Discount', value: money.discount },
      { label: 'Total cost (LPO)', value: money.total },
    ];

    const facts: (GrnFact | false)[] = [
      // what was received and against which order
      { label: 'LPO No', value: po?.poNo || '-' },
      { label: 'Supplier', value: supplier || '-' },
      !!pr?.purchaseNo && { label: 'PR No', value: pr.purchaseNo, link: ['/purchase/view-purchase', pr._id] },
      { label: 'Job ID', value: job?.jobId || '-', link: job?._id && job?.jobId ? ['/job-sheet/view', job._id] : undefined },
      { label: 'Customer', value: this.getCompanyName() || '-' },
      // where and when
      { label: 'GRN Date', value: this.formatDate(g?.grnDate) },
      { label: g?.destinationType === 'site' ? 'Delivered To' : 'Warehouse', value: destination },
      !!g?.quarantineWarehouse && { label: 'Quarantine', value: g.quarantineWarehouse.wareHouseName || '-' },
      { label: 'Received By', value: this.receiver || '-' },
      // supplier paperwork
      { label: 'Supplier Invoice No', value: g?.supplierInvoiceNo || '-' },
      { label: 'Supplier Invoice Date', value: this.formatDate(g?.supplierInvoiceDate) },
      { label: 'Delivery Note No', value: g?.supplierDeliveryNoteNo || '-' },
      // outcome
      { label: 'Outcome', value: outcome, state: this.state(outcome) },
      { label: 'Created By', value: this.formatEmployeeName(g?.createdBy) || '-' },
      { label: 'Created On', value: this.formatDate(g?.createdAt) },
    ];
    this.detailFacts = facts.filter((f): f is GrnFact => !!f);
    const hidden = ['Created On', 'Supplier Invoice Date'];
    this.detailItems = this.detailFacts.map((f) => ({ key: f.label, label: f.label, hiddenByDefault: hidden.includes(f.label) }));

    this.orderFacts = [
      { label: 'LPO No', value: po?.poNo || '-' },
      { label: 'LPO Status', value: po?.poStatus || '-', state: po?.poStatus ? this.state(po.poStatus) : undefined },
      { label: 'LPO Date', value: this.formatDate(po?.poDate || po?.createdAt) },
      { label: 'Expected Delivery', value: this.formatDate(po?.expectedDeliveryDate) },
      { label: 'Currency', value: po?.currency || '-' },
    ];

    const inspection = g?.inspectionResult || 'Passed';
    this.inspectionFacts = [
      { label: 'Result', value: inspection, state: this.state(inspection) },
      { label: 'Inspected By', value: this.formatEmployeeName(g?.inspectedBy) || '-' },
      { label: 'Inspection Date', value: this.formatDate(g?.inspectionDate) },
    ];
    this.inspectionNotes = g?.inspectionNotes || '';
    this.returnFacts = rejected > 0 || g?.returnResolution ? [
      { label: 'Status', value: outcome, state: this.state(outcome) },
      { label: 'Resolution', value: g?.returnResolution || '-' },
      { label: 'Dispatched On', value: this.formatDate(g?.returnDispatchedAt) },
      { label: 'Resolved On', value: this.formatDate(g?.returnResolvedAt) },
      { label: 'Resolved By', value: this.formatEmployeeName(g?.returnResolvedBy) || '-' },
    ] : [];

    const items: any[] = g?.items || [];
    const tracked = items.some((i) => i.batchNo || i.serialNos?.length || i.expiryDate);
    this.itemColumns = [
      { key: 'detail', label: 'Description', truncate: true, tooltipKey: 'detail' },
      { key: 'itemCode', label: 'Item Code', hiddenByDefault: true },
      { key: 'partNo', label: 'Part No', hiddenByDefault: true },
      { key: 'uom', label: 'UOM' },
      { key: 'orderedQty', label: 'Ordered', type: 'number', align: 'right' },
      { key: 'acceptedQty', label: 'Accepted', type: 'number', align: 'right', emphasis: true },
      { key: 'rejectedQty', label: 'Rejected', type: 'number', align: 'right' },
      { key: 'remainingQty', label: 'Remaining', type: 'number', align: 'right' },
      { key: 'reason', label: 'Rejection reason', wrap: true, hiddenByDefault: !items.some((i) => i.rejectionReason) },
      { key: 'serials', label: 'Serial nos', wrap: true, hiddenByDefault: !tracked },
      { key: 'remarks', label: 'Remarks', wrap: true, hiddenByDefault: !items.some((i) => i.remarks) },
    ];
    this.itemRows = items.map((i) => ({
      detail: i.itemDescription || '-',
      itemCode: i.itemCode || this.findPoLine(i)?.itemCode || '-',
      partNo: this.formatPartNumber(i.partNo),
      uom: i.uom || '-',
      orderedQty: i.orderedQty || 0,
      acceptedQty: i.acceptedQty || 0,
      rejectedQty: this.getRejectedQty(i),
      remainingQty: this.getRemainingQty(i),
      reason: i.rejectionReason || '-',
      serials: i.serialNos?.length ? i.serialNos.join(', ') : '-',
      remarks: i.remarks || '-',
    }));
    this.itemFootRows = items.length ? [{
      label: 'Total',
      emphasis: true,
      cells: {
        orderedQty: { value: this.getTotalOrderedQty(), format: 'number' },
        acceptedQty: { value: this.getTotalAcceptedQty(), format: 'number' },
        rejectedQty: { value: rejected, format: 'number' },
        remainingQty: { value: this.sumItems((i) => this.getRemainingQty(i)), format: 'number' },
      },
    }] : [];

    this.docList = [];
    this.docFiles.clear();
    const addDocs = (files: any[] | undefined, source: string) => (files || []).forEach((f: any, i: number) => {
      const id = `${source}-${i}`;
      this.docFiles.set(id, f);
      this.docList.push({ id, name: f.originalname || f.fileName || f.name || 'File', uploadedBy: source });
    });
    addDocs(g?.supplierInvoices, 'Supplier invoice');
    addDocs(g?.supplierDeliveryNotes, 'Delivery note');
  }

  openDocument(doc: DetailDocument): void {
    const file = this.docFiles.get(doc.id);
    if (!file) return;
    const modalData: FileUploadModalData = {
      title: `${doc.uploadedBy} - ${doc.name}`,
      existingFiles: [file],
      allowMultiple: true,
      showActions: { upload: false, download: true, view: true, delete: false },
    };
    this.dialog.open(FileUploadModalComponent, { data: modalData, width: '800px', maxHeight: '90vh' });
  }

  private navigateAway(): void {
    if (this.returnUrl) {
      this.router.navigateByUrl(this.returnUrl);
    } else if (this.purchaseId) {
      this.router.navigate(['/purchase/initiate-lpo', this.purchaseId]);
    } else {
      this.router.navigate(['/purchase/approves']);
    }
  }

  onBack(): void {
    this.navigateAway();
  }

  formatPartNumber(partNo: any): string {
    if (!partNo) return '-';
    if (typeof partNo === 'string') return partNo;
    if (partNo.partNo) return partNo.partNo;
    return '-';
  }

  formatDate(date: any): string {
    if (!date) return 'N/A';
    const d = new Date(date);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  formatEmployeeName(employee: any): string {
    if (!employee) return '';
    if (typeof employee === 'string') return employee;
    if (employee.firstName && employee.lastName) {
      return `${employee.firstName} ${employee.lastName}`;
    }
    if (employee.firstName) return employee.firstName;
    if (employee.lastName) return employee.lastName;
    return '';
  }

  getRejectedQty(item: any): number {
    if (item?.rejectedQty !== undefined && item?.rejectedQty !== null) {
      return item.rejectedQty;
    }
    return Math.max(0, (item?.receivedQty || 0) - (item?.acceptedQty || 0));
  }

  private sumItems(selector: (item: any) => number): number {
    if (!this.grn?.items || !Array.isArray(this.grn.items)) return 0;
    return this.grn.items.reduce((sum: number, item: any) => sum + (selector(item) || 0), 0);
  }

  private findPoLine(item: any): any {
    const lines: any[] = this.grn?.purchaseOrderId?.items || [];
    const key = (v: any) => String(v || '').trim().toLowerCase();
    return lines.find((l) => item.partNo && key(l.partNo?.partNo ?? l.partNo) === key(item.partNo))
      || lines.find((l) => key(l.detail) === key(item.itemDescription));
  }

  getRemainingQty(item: any): number {
    return Math.max(0, (item?.orderedQty || 0) - (item?.receivedQty || 0));
  }

  private priceSummary(): { received: string; rejected: string; discount: string; total: string } {
    const po = this.grn?.purchaseOrderId || {};
    const lines: any[] = po.items || [];
    const unitCost = (item: any): number => Number(this.findPoLine(item)?.unitCost) || 0;
    const supplierId = po.supplierId?._id || po.supplierId;
    const prDiscount = (Array.isArray(po.purchaseId?.supplierDiscounts?.suppliers) ? po.purchaseId.supplierDiscounts.suppliers : [])
      .find((d: any) => String(d.supplierId?._id || d.supplierId) === String(supplierId))?.discount;
    const discount = Number(po.discount) || Number(prDiscount) || 0;
    const gross = lines.reduce((sum, l) => sum + (Number(l.totalCost) || (Number(l.unitCost) || 0) * (Number(l.quantity) || 0)), 0);
    const fmt = (n: number) => `${po.currency || 'QAR'} ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return {
      received: fmt(this.sumItems((i) => (Number(i.receivedQty) || 0) * unitCost(i))),
      rejected: fmt(this.sumItems((i) => this.getRejectedQty(i) * unitCost(i))),
      discount: fmt(discount),
      total: fmt(Math.max(gross - discount, 0)),
    };
  }

  getTotalOrderedQty(): number {
    return this.sumItems(item => item.orderedQty);
  }

  getTotalReceivedQty(): number {
    return this.sumItems(item => item.receivedQty);
  }

  getTotalAcceptedQty(): number {
    return this.sumItems(item => item.acceptedQty);
  }

  getTotalRejectedQty(): number {
    return this.sumItems(item => this.getRejectedQty(item));
  }

  onViewReceipt(): void {
    const items = this.grn?.items || [];
    if (!items.length) {
      this.toastr.warning('No items recorded on this GRN');
      return;
    }

    this.isGenerating.set(true);
    this.grnService.generateGRNReceiptPDF(this.grn, items).then((pdf) => {
      pdf.getBlob((blob: Blob) => {
        const url = window.URL.createObjectURL(blob);
        this.isGenerating.set(false);
        this.dialog.open(PdfPreviewComponent, {
          data: { url: url, formatedQuote: this.grn, type: 'grn' }
        });
      });
    }).catch((error) => {
      console.error('Error generating PDF:', error);
      this.toastr.error('Failed to load GRN receipt');
      this.isGenerating.set(false);
    });
  }

  getCompanyName(): string {
    if (!this.grn) return '';
    return this.grn.purchaseOrderId?.purchaseId?.customerId?.companyName ||
           this.grn.purchaseOrderId?.quoteId?.client?.companyName ||
           this.grn.purchaseOrderId?.purchaseId?.jobId?.quoteId?.client?.companyName ||
           '';
  }
}
