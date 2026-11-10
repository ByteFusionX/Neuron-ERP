import { ALLOWED_UPLOAD_TYPES } from 'src/app/shared/constants/upload-types';
import { poShareDiscount } from 'src/app/shared/utils/po-discount.util';
import { CommonModule, DatePipe } from '@angular/common';
import { Component, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { BehaviorSubject, Observable, forkJoin, Subscription } from 'rxjs';
import { AuditLogService } from 'src/app/core/services/audit-log.service';
import { toTimelineEntries } from 'src/app/shared/utils/audit-timeline.util';
import { DetailTimelineComponent } from 'src/app/shared/components/detail-panel/detail-timeline.component';
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
import { DetailDocument, DetailFootRow, DetailOverviewSection, DetailTableColumn, DetailTimelineEntry } from 'src/app/shared/components/detail-panel/detail-panel.model';
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
import { GrnListModalComponent, GrnListModalData } from 'src/app/shared/components/grn-list-modal/grn-list-modal.component';
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

const BILLING_BADGE_CLASSES: Record<string, string> = {
  'Not Billed': 'bg-gray-100 text-gray-700 ring-gray-200 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700 dark:border-gray-700',
  'Invoice Uploaded': 'bg-indigo-50 text-indigo-700 ring-indigo-200 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:ring-indigo-900 dark:border-indigo-900',
};

const statusLabel = (status: string) => status === 'Pending for Approval' ? 'Pending' : status;

import { InitiateLpoComponent } from '../initiate-lpo/initiate-lpo.component';

import { DEFAULT_CURRENCY } from '../../../../shared/constants/currency';
@Component({
  selector: 'app-lpo-approval',
  standalone: true,
  imports: [CommonModule, DataGridComponent, DetailOverviewComponent, DetailTableComponent, DetailDocumentsComponent, DetailTimelineComponent, ActionButtonComponent, InitiateLpoComponent],
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
  private auditLog = inject(AuditLogService);
  private poWorkflowSteps: { id: string; label: string }[] = [];
  isSuperAdmin = false;
  canCancelPo = false;
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
    { id: 'history', label: 'History', icon: 'clock' },
  ];

  private historyCache = new Map<string, BehaviorSubject<DetailTimelineEntry[]>>();

  historyFor(row: any): Observable<DetailTimelineEntry[]> {
    let subject = this.historyCache.get(row._id);
    if (!subject) {
      subject = new BehaviorSubject<DetailTimelineEntry[]>([]);
      this.historyCache.set(row._id, subject);
      this.auditLog.getHistory('purchaseOrder', row._id).subscribe({
        next: (entries) => subject!.next(toTimelineEntries(entries)),
        error: () => this.historyCache.delete(row._id),
      });
    }
    return subject.asObservable();
  }

  isUploadingFiles = false;
  readonly acceptedFiles = ALLOWED_UPLOAD_TYPES;

  readonly itemColumns: DetailTableColumn[] = [
    { key: 'description', label: 'Description', type: 'html', truncate: true },
    { key: 'quantity', label: 'Qty', type: 'number' },
    { key: 'unitPrice', label: 'Unit Price', type: 'currency' },
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
        this.canCancelPo = this.isSuperAdmin || /^admin$/i.test(employee?.category?.role ?? '') || !!employee?.category?.privileges?.purchaseOrder?.canCancel;
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
      { key: 'jobId', label: 'Job No', sortable: true, valueGetter: (row) => row.jobId?.jobId || '-' },
      { key: 'poStatus', label: 'Status', type: 'badge', align: 'center', badgeClasses: STATUS_BADGE_CLASSES, badgeLabel: statusLabel },
      { key: 'supplier', label: 'Supplier', sortable: true, valueGetter: (row) => row.supplierId?.supplierName || '-' },
      {
        key: 'totalLpoValue',
        label: 'LPO Value',
        sortable: true,
        align: 'right',
        valueGetter: (row) => this.formatAmount(row),
      },
      { key: 'createdBy', label: 'Prepared By', valueGetter: (row) => this.personName(row.createdBy) },
      { key: 'approvedBy', label: 'Approved By', valueGetter: (row) => this.approvedByNames(row) },
      { key: 'customer', label: 'Customer', sortable: true, valueGetter: (row) => row.purchaseId?.customerId?.companyName || '-' },
      ...(this.activeViewId === 'rejected'
        ? [{ key: 'rejectReason', label: 'Reject Reason', valueGetter: (row: any) => this.rejectReason(row) } as DataGridColumn<any>]
        : []),
    ];
  }

  private rejectReason(row: any): string {
    const history = row?.rejectedHistory ?? [];
    return history.length ? (history[history.length - 1]?.reason || '-') : '-';
  }

  private buildRowActions(): void {
    this.rowActions = [
      { id: 'openFullLpo', label: 'Details View', icon: 'eye', quick: true, panel: true },
      { id: 'approve', label: 'Approve', icon: 'check', quick: true, hidden: (r) => !this.canApproveOrReject(r) },
      { id: 'reject', label: 'Reject', icon: 'close', quick: true, hidden: (r) => !this.canApproveOrReject(r) },
      { id: 'edit', label: 'Edit PO', icon: 'edit', quick: true, hidden: (r) => !this.canResend(r) },
      { id: 'resend', label: 'Resend for approval', icon: 'refresh', quick: true, hidden: (r) => !this.canResend(r) },
      { id: 'viewGrn', label: 'View GRN', icon: 'eye', quick: true, hidden: (r) => !r.grns?.length },
      { id: 'previewPdf', label: 'Preview PDF', icon: 'eye' },
      { id: 'downloadPdf', label: 'Download PDF', icon: 'download' },
      { id: 'resetWorkflow', label: 'Reset Workflow', icon: 'refresh', quick: true, hidden: (r) => r.poStatus !== 'Pending for Approval' || !this.isSuperAdmin },
      { id: 'place', label: 'Place order', icon: 'check', quick: true, hidden: (r) => r.poStatus !== 'Approved' || !this.canInitiateLPO },
      { id: 'uploadDocuments', label: 'Upload documents', icon: 'upload', quick: true, hidden: (r) => !['Approved', 'Placed'].includes(r.poStatus) || !(this.isSuperAdmin || this.canInitiateLPO) },
      { id: 'cancelOrder', label: 'Revoke PO', variant: 'danger', icon: 'close', quick: true, hidden: (r) => r.poStatus !== 'Placed' || !!r.grns?.length || !this.canCancelPo },
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
    const wasRejected = this.activeViewId === 'rejected';
    this.activeViewId = query.viewId || 'all';
    if (wasRejected !== (this.activeViewId === 'rejected')) this.buildColumns();
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
            this.historyCache.clear();
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

  async cancelOrder(row: any): Promise<void> {
    const { confirmed, reason } = await this.confirmDialog.open({
      tone: 'reject',
      title: `Revoke ${row.poNo}?`,
      message: 'The order stops here and the quantities go back to the request to be ordered again. This cannot be undone.',
      details: [{ label: 'PO no', value: row.poNo || '-' }, { label: 'Supplier', value: row.supplierId?.supplierName || '-' }],
      confirmLabel: 'Revoke PO',
      reason: true,
      reasonLabel: 'Revoke reason',
    });
    if (!confirmed || !reason?.trim()) return;
    this.subscriptions.add(this.purchaseOrderService.cancelPurchaseOrder(row._id, reason.trim()).subscribe({
      next: () => { this.notificationService.success(`${row.poNo} revoked`); this.loadData(); },
      error: (err) => this.notificationService.error(err?.error?.message || 'Could not cancel the PO.'),
    }));
  }

  onRowAction(event: DataGridRowActionEvent<any>): void {
    if (event.action.id === 'openFullLpo') this.openFullLpo(event.row);
    if (event.action.id === 'resetWorkflow') this.resetWorkflow(event.row);
    if (event.action.id === 'place') this.placeOrder(event.row);
    if (event.action.id === 'cancelOrder') this.cancelOrder(event.row);
    if (event.action.id === 'uploadDocuments') this.uploadDocuments(event.row);
    if (event.action.id === 'approve') this.approve(event.row);
    if (event.action.id === 'reject') this.reject(event.row);
    if (event.action.id === 'edit') this.editRow = event.row;
    if (event.action.id === 'resend') this.resend(event.row);
    if (event.action.id === 'viewGrn') this.viewGrn(event.row);
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

  /** A rejected PO can go back for approval by whoever raised it (or a Super Admin). */
  /** The rejected PO open in the edit drawer. */
  editRow: any = null;

  idOf(v: any): string {
    return String(v?._id ?? v ?? '');
  }

  onEditSaved(): void {
    this.loadData();
  }

  canResend(row: any): boolean {
    if (row?.poStatus !== 'Rejected') return false;
    if (this.isSuperAdmin) return true;
    const createdById = row.createdBy?._id || row.createdBy;
    return this.canInitiateLPO && !!createdById && createdById === this.currentEmployeeId;
  }

  async resend(row: any): Promise<void> {
    if (!this.canResend(row)) return;
    const { confirmed } = await this.confirmDialog.open({
      tone: 'approve',
      title: 'Resend PO for approval',
      message: 'This PO will go through the approval workflow again.',
      details: [
        { label: 'PO no', value: row.poNo || '-' },
        { label: 'Supplier', value: row.supplierId?.supplierName || '-' },
        { label: 'Total', value: this.formatAmount(row) },
      ],
      confirmLabel: 'Resend',
    });
    if (!confirmed) return;
    this.purchaseOrderService.resendPurchaseOrder(row._id).subscribe({
      next: () => {
        this.notificationService.success('PO sent for approval again');
        this.loadData();
      },
      error: (error) => this.notificationService.error(error.error?.message || 'Failed to resend the PO'),
    });
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
  /** One GRN opens directly; several open the picker so the user chooses which one. */
  private viewGrn(row: any): void {
    const grns = row?.grns ?? [];
    if (grns.length === 1) {
      this.router.navigate(['/grn/view-grn', grns[0]._id]);
      return;
    }
    this.dialog.open(GrnListModalComponent, {
      data: { lpoId: row._id, lpoNo: row.poNo, grns, hasBalanceQty: false } as GrnListModalData,
    });
  }

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
      row?.quoteId?.dealData?.currency ||
      row?.quoteId?.currency ||
      row?.purchaseId?.jobId?.quoteId?.dealData?.currency ||
      row?.purchaseId?.jobId?.quoteId?.currency ||
      '';
    return currency ? `${formatted} ${currency}` : formatted;
  }

  itemRows(row: any): Record<string, any>[] {
    const sourceItems = row?.items ?? row?.purchaseId?.items ?? [];
    const rows: Record<string, any>[] = [];
    // Unit Price is the job's selling price; Unit Cost is the price awarded to the supplier on the PO.
    const key = (v: any) => String(v?._id ?? v ?? '').trim().toLowerCase();
    const jobDetails: any[] = (row?.purchaseId?.items || []).flatMap((i: any) => i?.itemDetails || []);
    const jobSellingPrice = (item: any) => {
      const match = jobDetails.find((d) => item?.partNo && key(d.partNo) === key(item.partNo))
        || jobDetails.find((d) => key(d.detail) === key(item?.detail));
      return Number(match?.unitSellingPrice) || 0;
    };

    sourceItems.forEach((item: any) => {
      const details = item.itemDetails?.length ? item.itemDetails : [item];
      details.forEach((detail: any) => {
        const quantity = detail.quantity ?? detail.qty ?? item.quantity ?? item.qty ?? 0;
        const unitCost = detail.unitCost ?? detail.price ?? item.unitCost ?? item.price ?? 0;
        rows.push({
          description: String(detail.description ?? detail.detail ?? item.description ?? item.detail ?? detail.item ?? item.item ?? item.itemName ?? '-')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
          quantity,
          unitPrice: jobSellingPrice(item),
          unitCost: Number(unitCost) || 0,
          amount: (Number(quantity) || 0) * (Number(unitCost) || 0),
        });
      });
    });

    return rows;
  }

  itemFootRows(row: any): DetailFootRow[] {
    const total = this.itemRows(row).reduce((s, r) => s + (Number(r['amount']) || 0), 0);
    const discount = poShareDiscount(row);
    const cell =(value: number) => ({ amount: { value, format: 'currency' as const } });
    return [
      { label: 'Total', cells: cell(total) },
      { label: 'Discount', cells: cell(discount) },
      { label: 'Net Total', cells: cell(Math.max(total - discount, 0)), emphasis: true },
    ];
  }

  overviewSections(row: any): DetailOverviewSection[] {
    return [
      {
        title: 'Overview',
        columns: '2',
        fields: [
          { type: 'field', label: 'PO No', value: row.poNo, numeric: true },
          { type: 'dg', key: 'poStatus' },
          { type: 'field', label: 'Supplier', value: row.supplierId?.supplierName || '-' },
          { type: 'field', label: 'Customer', value: row.purchaseId?.customerId?.companyName || '-' },
          { type: 'field', label: 'Job No', value: row.jobId?.jobId || '-' },
          { type: 'field', label: 'Date', value: this.datePipe.transform(row.poDate, 'dd MMM yyyy') },
          { type: 'field', label: 'Prepared By', value: this.personName(row.createdBy) },
          { type: 'field', label: 'Amount', value: this.formatAmount(row), numeric: true, noHover: true },
          { type: 'dg', key: 'receiptStatus', label: 'Receipt Status' },
          { type: 'dg', key: 'billingStatus', label: 'Billing Status' },
          ...((row?.rejectedHistory?.length || this.activeViewId === 'rejected')
            ? [{ type: 'field', label: 'Reject Reason', value: this.rejectReason(row) } as any]
            : []),
        ],
      },
      this.summarySection(row),
    ];
  }

  /** Total cost, discount and net total for this PO's items only; the discount is this PO's share. */
  private summarySection(row: any): DetailOverviewSection {
    const lines: any[] = row?.items || [];
    const totalPrice = lines.reduce((s, l) => s + (Number(l.totalCost) || (Number(l.unitCost) || 0) * (Number(l.quantity) || 0)), 0);
    const discount = poShareDiscount(row);
    const currency = row?.currency || row?.quoteId?.currency || DEFAULT_CURRENCY;
    const fmt = (n: number) => `${currency} ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return {
      title: 'Summary',
      columns: '2',
      fields: [
        { type: 'field', label: 'Total Cost', value: fmt(totalPrice), numeric: true },
        { type: 'field', label: 'Discount', value: fmt(discount), numeric: true },
        { type: 'field', label: 'Net Total', value: fmt(Math.max(totalPrice - discount, 0)), numeric: true },
      ],
    };
  }

  private approvedByNames(row: any): string {
    const names = (row?.approvedHistory ?? [])
      .map((h: any) => this.personName(h?.approvedBy))
      .filter((n: string) => n !== '-');
    return names.length ? Array.from(new Set<string>(names)).join(', ') : '-';
  }

  private personName(person: any): string {
    if (!person) return '-';
    return `${person.firstName || ''} ${person.lastName || ''}`.trim() || '-';
  }
}
