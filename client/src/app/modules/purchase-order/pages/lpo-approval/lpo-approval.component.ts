import { ALLOWED_UPLOAD_TYPES } from 'src/app/shared/constants/upload-types';
import { CommonModule, DatePipe } from '@angular/common';
import { Component, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin, Subscription } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { PurchaseOrderService } from 'src/app/core/services/purchaseOrder/purchaseOrder.service';
import { DataGridComponent } from 'src/app/shared/components/data-grid/data-grid.component';
import {
  DataGridBreadcrumb,
  DataGridColumn,
  DataGridDetailTab,
  DataGridQuery,
  DataGridRowAction,
  DataGridRowActionEvent,
  DataGridView,
} from 'src/app/shared/components/data-grid/data-grid.model';
import { DetailOverviewComponent } from 'src/app/shared/components/detail-panel/detail-overview.component';
import { DetailTableComponent } from 'src/app/shared/components/detail-panel/detail-table.component';
import { DetailDocumentsComponent } from 'src/app/shared/components/detail-panel/detail-documents.component';
import { DetailDocument, DetailOverviewSection, DetailTableColumn } from 'src/app/shared/components/detail-panel/detail-panel.model';
import saveAs from 'file-saver';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { ModalService } from 'src/app/shared/components/modal';
import { DocumentUploadModalComponent, DocumentUploadModalResult } from 'src/app/shared/components/detail-panel/document-upload-modal/document-upload-modal.component';
import { ResetWorkflowComponent, ResetWorkflowModalData } from 'src/app/modules/presales/pages/reset-workflow/reset-workflow.component';
import { WorkflowService } from 'src/app/core/services/workflow.service';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { WorkflowFeature } from 'src/app/shared/interfaces/workflow.interface';
import { ConfirmDialogService } from 'src/app/shared/components/confirm-dialog';
import { PlaceOrderModalComponent, PlaceOrderModalResult } from '../place-order-modal/place-order-modal.component';
import { PurchaseService } from 'src/app/core/services/purchase/purchase.service';
import { MatDialog } from '@angular/material/dialog';
import { PdfPreviewComponent } from 'src/app/shared/components/pdf-preview/pdf-preview.component';

const ALL_STATUSES = ['Pending for Approval', 'Approved', 'Placed', 'Closed', 'Rejected'];
const PENDING_STATUSES = ['Pending for Approval'];
const APPROVED_STATUSES = ['Approved'];
/** Placed by an employee after approval; Closed POs stay here until a GRN view exists. */
const PLACED_STATUSES = ['Placed', 'Closed'];
const REJECTED_STATUSES = ['Rejected'];

const STATUS_BADGE_CLASSES: Record<string, string> = {
  'Pending for Approval': 'bg-amber-50 text-amber-700 ring-amber-200 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900 dark:border-amber-900',
  Approved: 'bg-emerald-50 text-emerald-700 ring-emerald-200 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900 dark:border-emerald-900',
  Placed: 'bg-teal-50 text-teal-700 ring-teal-200 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:ring-teal-900 dark:border-teal-900',
  Closed: 'bg-sky-50 text-sky-700 ring-sky-200 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:ring-sky-900 dark:border-sky-900',
  Rejected: 'bg-red-50 text-red-700 ring-red-200 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900 dark:border-red-900',
};

const RECEIPT_BADGE_CLASSES: Record<string, string> = {
  'Not Received': 'bg-gray-100 text-gray-700 ring-gray-200 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700 dark:border-gray-700',
  'Partially Received': 'bg-amber-50 text-amber-700 ring-amber-200 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900 dark:border-amber-900',
  Received: 'bg-emerald-50 text-emerald-700 ring-emerald-200 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900 dark:border-emerald-900',
};

const BILLING_BADGE_CLASSES: Record<string, string> = {
  'Not Billed': 'bg-gray-100 text-gray-700 ring-gray-200 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700 dark:border-gray-700',
  'Invoice Uploaded': 'bg-indigo-50 text-indigo-700 ring-indigo-200 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:ring-indigo-900 dark:border-indigo-900',
};

const statusLabel = (status: string) => status === 'Pending for Approval' ? 'Pending' : status;

@Component({
  selector: 'app-lpo-approval',
  standalone: true,
  imports: [CommonModule, DataGridComponent, DetailOverviewComponent, DetailTableComponent, DetailDocumentsComponent, ActionButtonComponent],
  providers: [DatePipe],
  templateUrl: './lpo-approval.component.html',
  styleUrl: './lpo-approval.component.css',
})
export class LpoApprovalComponent implements OnInit, OnDestroy {
  @ViewChild('grid') grid!: DataGridComponent<any>;

  private purchaseOrderService = inject(PurchaseOrderService);
  private notificationService = inject(ToastrService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private datePipe = inject(DatePipe);
  private modal = inject(ModalService);
  private workflowService = inject(WorkflowService);
  private employeeService = inject(EmployeeService);
  private confirmDialog = inject(ConfirmDialogService);
  private purchaseService = inject(PurchaseService);
  private dialog = inject(MatDialog);
  private poWorkflowSteps: { id: string; label: string }[] = [];
  isSuperAdmin = false;
  canInitiateLPO = false;
  canApprovePOs = false;
  private currentEmployeeId: string | null = null;
  private currentCategoryId: string | null = null;
  private subscriptions = new Subscription();

  rows: any[] = [];
  total = 0;
  isLoading = false;
  detailLoading = false;

  page = 1;
  row = 15;
  searchQuery = '';
  activeViewId = 'all';

  breadcrumbs: DataGridBreadcrumb[] = [{ label: 'Home', link: '/' }, { label: 'Purchase' }, { label: 'PO' }];
  views: DataGridView<any>[] = [
    { id: 'all', label: 'All' },
    { id: 'pending', label: 'Pending' },
    { id: 'approved', label: 'Approved' },
    { id: 'placed', label: 'Placed' },
    { id: 'rejected', label: 'Rejected' },
  ];
  columns: DataGridColumn<any>[] = [];
  rowActions: DataGridRowAction<any>[] = [];
  detailTabs: DataGridDetailTab[] = [
    { id: 'overview', label: 'Details', icon: 'info' },
    { id: 'items', label: 'Items', icon: 'card' },
    { id: 'documents', label: 'Documents', icon: 'files' },
  ];

  isUploadingFiles = false;
  readonly acceptedFiles = ALLOWED_UPLOAD_TYPES;

  readonly itemColumns: DetailTableColumn[] = [
    { key: 'item', label: 'Item' },
    { key: 'description', label: 'Description' },
    { key: 'quantity', label: 'Qty', type: 'number' },
    { key: 'unitCost', label: 'Unit Cost', type: 'currency' },
    { key: 'amount', label: 'Amount', type: 'currency', total: true },
  ];

  lpoTitle = (row: any) => row.poNo ?? '';
  lpoSubtitle = (row: any) => row.supplierId?.supplierName ?? row.purchaseId?.customerId?.companyName ?? '';

  ngOnInit(): void {
    this.activeViewId = this.initialViewFromRoute();
    this.buildColumns();
    this.buildRowActions();
    this.updateUrlForLegacyRoutes();
    this.loadData();
    this.subscriptions.add(
      this.employeeService.employeeData$.subscribe((employee: any) => {
        this.isSuperAdmin = /^superadmin$/i.test(employee?.category?.role ?? '');
        this.canInitiateLPO = !!employee?.category?.privileges?.purchaseOrder?.canInitiateLPO;
        this.canApprovePOs = !!employee?.category?.privileges?.purchaseOrder?.canApprovePOs;
        this.currentEmployeeId = employee?._id ?? null;
        this.currentCategoryId = employee?.category?._id ?? null;
      })
    );
    this.subscriptions.add(
      this.workflowService.getWorkflows({ feature: WorkflowFeature.PO_APPROVAL }).subscribe((response) => {
        const steps = (response?.data?.[0]?.steps ?? []).filter((st: any) => st.enabled !== false && !/^superadmin$/i.test(st.role?.role ?? ''));
        this.poWorkflowSteps = [...steps].sort((a: any, b: any) => b.order - a.order)
          .map((st: any) => ({ id: String(st.role?._id ?? st.role), label: st.role?.categoryName ?? '—' }));
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  private buildColumns(): void {
    this.columns = [
      { key: 'poDate', label: 'Date', type: 'date', sortable: true, width: '120px' },
      { key: 'poNo', label: 'PO No', sortable: true, locked: true },
      { key: 'poStatus', label: 'Status', type: 'badge', align: 'center', badgeClasses: STATUS_BADGE_CLASSES, badgeLabel: statusLabel },
      { key: 'receiptStatus', label: 'Receipt', type: 'badge', align: 'center', badgeClasses: RECEIPT_BADGE_CLASSES },
      { key: 'supplier', label: 'Supplier', sortable: true, valueGetter: (row) => row.supplierId?.supplierName || '-' },
      { key: 'jobId', label: 'Job ID', sortable: true, valueGetter: (row) => row.jobId?.jobId || '-' },
      {
        key: 'totalLpoValue',
        label: 'LPO Value',
        sortable: true,
        align: 'right',
        valueGetter: (row) => this.formatAmount(row),
      },
      { key: 'createdBy', label: 'Prepared By', valueGetter: (row) => this.personName(row.createdBy) },
      { key: 'customer', label: 'Customer', sortable: true, valueGetter: (row) => row.purchaseId?.customerId?.companyName || '-' },
    ];
  }

  private buildRowActions(): void {
    this.rowActions = [
      { id: 'openFullLpo', label: 'Open full PO', icon: 'eye', quick: true, panel: true },
      { id: 'approve', label: 'Approve', icon: 'check', quick: true, hidden: (r) => !this.canApproveOrReject(r) },
      { id: 'reject', label: 'Reject', icon: 'close', quick: true, hidden: (r) => !this.canApproveOrReject(r) },
      { id: 'previewPdf', label: 'Preview PDF', icon: 'eye' },
      { id: 'downloadPdf', label: 'Download PDF', icon: 'download' },
      { id: 'resetWorkflow', label: 'Reset Workflow', icon: 'refresh', quick: true, hidden: (r) => r.poStatus !== 'Pending for Approval' || !this.isSuperAdmin },
      { id: 'place', label: 'Place order', icon: 'check', quick: true, hidden: (r) => r.poStatus !== 'Approved' || !this.canInitiateLPO },
      { id: 'uploadDocuments', label: 'Upload documents', icon: 'upload', quick: true, hidden: (r) => !['Approved', 'Placed'].includes(r.poStatus) || !(this.isSuperAdmin || this.canInitiateLPO) },
    ];
  }

  private initialViewFromRoute(): string {
    const view = this.route.snapshot.queryParamMap.get('view');
    if (view === 'pending' || view === 'approved') return view;

    const url = this.router.url;
    if (url.includes('/pending-approval')) return 'pending';
    if (url.includes('/approved')) return 'approved';
    return 'all';
  }

  private updateUrlForLegacyRoutes(): void {
    const url = this.router.url.split('?')[0];
    if (!url.endsWith('/pending-approval') && !url.endsWith('/approved') && !url.endsWith('/purchase-order/po')) return;

    this.router.navigate(['/purchase/po'], {
      queryParams: this.activeViewId === 'all' ? {} : { view: this.activeViewId },
      replaceUrl: true,
    });
  }

  private statusesForView(viewId: string): string[] {
    switch (viewId) {
      case 'pending':
        return PENDING_STATUSES;
      case 'approved':
        return APPROVED_STATUSES;
      case 'placed':
        return PLACED_STATUSES;
      case 'rejected':
        return REJECTED_STATUSES;
      default:
        return ALL_STATUSES;
    }
  }

  onQueryChange(query: DataGridQuery): void {
    this.searchQuery = query.search;
    this.page = query.page;
    this.row = query.pageSize;
    this.activeViewId = query.viewId || 'all';
    this.loadData();
  }

  private loadData(): void {
    this.isLoading = true;

    this.subscriptions.add(
      this.purchaseOrderService.getAllPurchaseOrders({
        page: this.page,
        row: this.row,
        search: this.searchQuery || undefined,
        status: this.statusesForView(this.activeViewId),
      }).subscribe({
        next: (response) => {
          if (response.success) {
            this.rows = response.data ?? [];
            this.total = response.pagination?.total ?? this.rows.length;
          }
          this.isLoading = false;
        },
        error: (error) => {
          this.notificationService.error('Failed to load POs');
          console.error('Error loading POs:', error);
          this.isLoading = false;
        },
      })
    );

    this.loadViewCounts();
  }

  private loadViewCounts(): void {
    const requests = this.views.reduce((acc, view) => {
      acc[view.id] = this.purchaseOrderService.getAllPurchaseOrders({
        page: 1,
        row: 1,
        search: this.searchQuery || undefined,
        status: this.statusesForView(view.id),
      });
      return acc;
    }, {} as Record<string, ReturnType<PurchaseOrderService['getAllPurchaseOrders']>>);

    this.subscriptions.add(
      forkJoin(requests).subscribe({
        next: (results) => {
          this.views = this.views.map((view) => ({
            ...view,
            count: results[view.id]?.pagination?.total ?? view.count,
          }));
        },
        error: (error) => console.error('Error loading PO view counts:', error),
      })
    );
  }

  onRowOpen(): void {
    this.detailLoading = true;
    setTimeout(() => (this.detailLoading = false), 200);
  }

  onRowAction(event: DataGridRowActionEvent<any>): void {
    if (event.action.id === 'openFullLpo') this.openFullLpo(event.row);
    if (event.action.id === 'resetWorkflow') this.resetWorkflow(event.row);
    if (event.action.id === 'place') this.placeOrder(event.row);
    if (event.action.id === 'uploadDocuments') this.uploadDocuments(event.row);
    if (event.action.id === 'approve') this.approve(event.row);
    if (event.action.id === 'reject') this.reject(event.row);
    if (event.action.id === 'previewPdf') this.openPdf(event.row, true);
    if (event.action.id === 'downloadPdf') this.openPdf(event.row, false);
  }

  /** Same rule as the PO view page: approver privilege, not your own PO (unless superadmin), and your workflow stage is the one waiting. */
  canApproveOrReject(row: any): boolean {
    if (row?.poStatus !== 'Pending for Approval') return false;
    if (this.isSuperAdmin) return true;
    if (!this.canApprovePOs) return false;
    const createdById = row.createdBy?._id || row.createdBy;
    if (createdById && createdById === this.currentEmployeeId) return false;
    const steps = [...(row.approvalStatus || [])].sort((a: any, b: any) => a.step - b.step);
    if (!steps.length || this.isSuperAdmin) return true;
    const pending = steps.filter((a: any) => a.status === 'pending');
    return pending.filter((a: any) => a.step === pending[0]?.step).some((a: any) =>
      a.managerApproval ? String(a.approver) === this.currentEmployeeId : String(a.role?._id || a.role) === this.currentCategoryId
    );
  }

  async approve(row: any): Promise<void> {
    const { confirmed, reason } = await this.confirmDialog.open({
      tone: 'approve',
      title: 'Approve PO',
      message: (row.approvalStatus || []).filter((a: any) => a.status === 'pending').length > 1 && !this.isSuperAdmin
        ? 'Your approval moves this PO on to the next approval stage.'
        : 'This PO will be approved and can then be placed with the supplier.',
      details: [
        { label: 'PO no', value: row.poNo || '-' },
        { label: 'Supplier', value: row.supplierId?.supplierName || '-' },
        { label: 'Total', value: this.formatAmount(row) },
      ],
      confirmLabel: 'Approve',
      reason: 'optional',
      reasonLabel: 'Approval comment',
    });
    if (!confirmed) return;
    this.purchaseOrderService.approvePurchaseOrder(row._id, reason ?? '').subscribe({
      next: () => {
        this.notificationService.success('PO approved');
        this.loadData();
      },
      error: (error) => this.notificationService.error(error.error?.message || 'Failed to approve the PO'),
    });
  }

  async reject(row: any): Promise<void> {
    const { confirmed, reason } = await this.confirmDialog.open({
      tone: 'reject',
      title: 'Reject PO',
      message: 'This PO will be sent back to the person who raised it.',
      details: [{ label: 'PO no', value: row.poNo || '-' }, { label: 'Supplier', value: row.supplierId?.supplierName || '-' }],
      confirmLabel: 'Reject',
      reason: true,
      reasonLabel: 'Rejection reason',
    });
    if (!confirmed) return;
    this.purchaseOrderService.rejectPurchaseOrder(row._id, reason ?? '').subscribe({
      next: () => {
        this.notificationService.success('PO rejected');
        this.loadData();
      },
      error: (error) => this.notificationService.error(error.error?.message || 'Failed to reject the PO'),
    });
  }

  /** The list row isn't fully populated (supplier contacts, quote, terms), so the PO is loaded in full first. */
  private openPdf(row: any, preview: boolean): void {
    this.purchaseOrderService.getPurchaseOrderById(row._id).subscribe({
      next: (response: any) => {
        const po = response?.success ? response.data : response;
        this.purchaseService.generatePDF(po, false)
          .then((pdf) => {
            if (!preview) {
              pdf.download(`${String(po.poNo || 'purchase-order').replace(/[^a-zA-Z0-9._-]+/g, '_')}.pdf`);
              return;
            }
            pdf.getBlob((blob: Blob) => {
              this.dialog.open(PdfPreviewComponent, { data: { url: window.URL.createObjectURL(blob), formatedQuote: po, type: 'purchase' } });
            });
          })
          .catch(() => this.notificationService.error('Error generating PDF. Please try again.'));
      },
      error: () => this.notificationService.error('Failed to load the PO'),
    });
  }

  placeOrder(row: any): void {
    const contacts: any[] = row.supplierId?.contacts || [];
    this.modal.open<PlaceOrderModalResult>(PlaceOrderModalComponent, {
      width: '560px',
      data: {
        context: row.poNo || row._id,
        supplierName: row.supplierId?.supplierName,
        amount: this.formatAmount(row),
        contactOptions: contacts.map((c) => ({ label: [c.name, c.designation].filter(Boolean).join(' · '), value: String(c._id) })),
      },
    }).afterClosed().subscribe((result) => {
      if (!result) return;
      this.purchaseOrderService.placePurchaseOrder(row._id, result.expectedDeliveryDate, result.contactId, result.note).subscribe({
        next: () => {
          this.notificationService.success('Order placed');
          this.loadData();
        },
        error: (error) => this.notificationService.error(error.error?.message || 'Failed to place the order'),
      });
    });
  }

  /** Documents are kept once the order is approved. */
  canManageDocuments(row: any): boolean {
    return ['Approved', 'Placed'].includes(row?.poStatus) && (this.isSuperAdmin || this.canInitiateLPO);
  }

  /** Opens the upload modal over the row's documents tab. */
  uploadDocuments(row: any): void {
    if (!this.canManageDocuments(row)) return;
    this.grid?.openRow(row, 'documents');
    this.modal.open<DocumentUploadModalResult>(DocumentUploadModalComponent, {
      width: '680px',
      data: { context: row.poNo || row._id, acceptedFiles: this.acceptedFiles, title: 'Upload PO documents' },
    }).afterClosed().subscribe((result) => {
      if (result?.files?.length) this.saveDocuments(row, result.files);
    });
  }

  private saveDocuments(row: any, files: File[]): void {
    if (this.isUploadingFiles) return;
    this.isUploadingFiles = true;
    this.purchaseOrderService.addPurchaseOrderDocuments(row._id, files).subscribe({
      next: (res) => {
        row.documents = res.data?.documents ?? row.documents;
        this.isUploadingFiles = false;
        this.notificationService.success('Files uploaded successfully');
      },
      error: (error) => {
        this.isUploadingFiles = false;
        this.notificationService.error(error.error?.message || 'Failed to upload files');
      },
    });
  }

  poDocuments(row: any): DetailDocument[] {
    return (row?.documents ?? []).map((file: any) => ({
      id: file.fileName,
      name: file.originalname || file.fileName,
      kind: file.mimetype?.split('/').pop(),
      size: file.size ? `${Math.max(1, Math.round(file.size / 1024))} KB` : undefined,
      date: file.uploadedAt,
    }));
  }

  documentRemoveDetails = (row: any) => (doc: DetailDocument) => [
    { label: 'PO no', value: row?.poNo ?? '' },
    { label: 'Supplier', value: row?.supplierId?.supplierName ?? '' },
    { label: 'File Name', value: doc.name },
  ];

  onDocumentRemove(row: any, doc: DetailDocument): void {
    this.purchaseOrderService.removePurchaseOrderDocument(row._id, doc.id).subscribe({
      next: (res) => {
        row.documents = res.data?.documents ?? (row.documents ?? []).filter((d: any) => d.fileName !== doc.id);
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
      const mime = LpoApprovalComponent.PREVIEW_MIME[doc.id.split('.').pop()?.toLowerCase() ?? ''];
      const url = window.URL.createObjectURL(mime ? new Blob([blob], { type: mime }) : blob);
      window.open(url, '_blank');
      setTimeout(() => window.URL.revokeObjectURL(url), 60000);
    });
  }

  onDocumentDownload(doc: DetailDocument): void {
    this.fetchDocument(doc, (blob) => saveAs(blob, doc.name));
  }

  resetWorkflow(row: any): void {
    const data: ResetWorkflowModalData = {
      jobId: row._id,
      context: row.poNo,
      contextLabel: 'Purchase order',
      description: 'Tick the approval stages that get another chance on this purchase order. Unticked stages are skipped for this PO only.',
      stages: this.poWorkflowSteps,
      restart: (ids) => this.purchaseOrderService.resetPurchaseOrderWorkflow(row._id, ids),
    };
    this.modal.open<boolean>(ResetWorkflowComponent, { width: '520px', data })
      .afterClosed().subscribe((reset) => { if (reset) this.loadData(); });
  }

  openFullLpo(row: any, event?: Event): void {
    event?.stopPropagation();
    this.router.navigate(['/purchase/view-lpo', row._id]);
  }

  formatAmount(row: any): string {
    const value = typeof row?.totalLpoValue === 'number' ? row.totalLpoValue : parseFloat(row?.totalLpoValue) || 0;
    const formatted = value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const currency =
      row?.currency ||
      row?.quoteId?.currency ||
      row?.quoteId?.dealData?.currency ||
      row?.purchaseId?.jobId?.quoteId?.currency ||
      row?.purchaseId?.jobId?.quoteId?.dealData?.currency ||
      '';
    return currency ? `${formatted} ${currency}` : formatted;
  }

  itemRows(row: any): Record<string, any>[] {
    const sourceItems = row?.items ?? row?.purchaseId?.items ?? [];
    const rows: Record<string, any>[] = [];

    sourceItems.forEach((item: any) => {
      const details = item.itemDetails?.length ? item.itemDetails : [item];
      details.forEach((detail: any) => {
        const quantity = detail.quantity ?? detail.qty ?? item.quantity ?? item.qty ?? 0;
        const unitCost = detail.unitCost ?? detail.price ?? item.unitCost ?? item.price ?? 0;
        rows.push({
          item: detail.item ?? detail.detail ?? item.item ?? item.itemName ?? '-',
          description: detail.description ?? item.description ?? '-',
          quantity,
          unitCost,
          amount: (Number(quantity) || 0) * (Number(unitCost) || 0),
        });
      });
    });

    return rows;
  }

  overviewSections(row: any): DetailOverviewSection[] {
    return [
      {
        title: 'General',
        columns: '2',
        fields: [
          { type: 'field', label: 'PO No', value: row.poNo, numeric: true },
          { type: 'dg', key: 'poStatus' },
          { type: 'field', label: 'Supplier', value: row.supplierId?.supplierName || '-' },
          { type: 'field', label: 'Customer', value: row.purchaseId?.customerId?.companyName || '-' },
          { type: 'field', label: 'Job ID', value: row.jobId?.jobId || '-' },
          { type: 'field', label: 'Date', value: this.datePipe.transform(row.poDate, 'dd MMM yyyy') },
          { type: 'field', label: 'Prepared By', value: this.personName(row.createdBy) },
          { type: 'field', label: 'Amount', value: this.formatAmount(row), numeric: true, noHover: true },
          { type: 'dg', key: 'receiptStatus', label: 'Receipt Status' },
          { type: 'dg', key: 'billingStatus', label: 'Billing Status' },
        ],
      },
    ];
  }

  private personName(person: any): string {
    if (!person) return '-';
    return `${person.firstName || ''} ${person.lastName || ''}`.trim() || '-';
  }
}
