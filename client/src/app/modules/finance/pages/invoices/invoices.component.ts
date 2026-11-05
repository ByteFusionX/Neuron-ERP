import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { BehaviorSubject, Observable } from 'rxjs';
import { AuditLogService } from 'src/app/core/services/audit-log.service';
import { toTimelineEntries } from 'src/app/shared/utils/audit-timeline.util';
import { DetailTimelineComponent } from 'src/app/shared/components/detail-panel/detail-timeline.component';
import { DetailTableComponent } from 'src/app/shared/components/detail-panel/detail-table.component';
import { DetailMetaComponent } from 'src/app/shared/components/detail-panel/detail-meta.component';
import { DetailOverviewComponent } from 'src/app/shared/components/detail-panel/detail-overview.component';
import { DetailDocumentsComponent } from 'src/app/shared/components/detail-panel/detail-documents.component';
import { DetailDocument, DetailFootRow, DetailMetaItem,DetailOverviewSection, DetailTableColumn, DetailTimelineEntry } from 'src/app/shared/components/detail-panel/detail-panel.model';
import { DetailFieldComponent } from 'src/app/shared/components/detail-panel/detail-field.component';
import { DetailSectionComponent } from 'src/app/shared/components/detail-panel/detail-section.component';
import { ToastrService } from 'ngx-toastr';
import { Subscription, catchError, map, of, switchMap, take } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { ConfirmDialogService } from 'src/app/shared/components/confirm-dialog/confirm-dialog.service';
import { ModalService } from 'src/app/shared/components/modal';
import { PiFormDrawerComponent, piDefaultsFromJob } from '../pi-shared/pi-form-drawer/pi-form-drawer.component';
import { InvoiceService } from 'src/app/core/services/invoice.service';
import { CustomerInvoiceService } from 'src/app/core/services/customer-invoice.service';
import { PiInvoiceDrawerComponent } from './pi-invoice-drawer/pi-invoice-drawer.component';
import { FileService } from 'src/app/core/services/file.service';
import { ProformaInvoice, ProformaInvoiceService, ProformaStatusPayload, proformaToInvoice } from 'src/app/core/services/proforma-invoice.service';
import { PiStatusModalComponent } from '../pi-shared/pi-status-modal/pi-status-modal.component';
import { PdfPreviewComponent } from 'src/app/shared/components/pdf-preview/pdf-preview.component';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { JobService } from 'src/app/core/services/job/job.service';
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
import { allocateStatus, JobTable } from 'src/app/shared/interfaces/job.interface';

const JOB_STATUS_CLASSES: Record<string, string> = {
  [allocateStatus.Pending]: 'bg-amber-50 text-amber-700 ring-amber-200 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900 dark:border-amber-900',
  [allocateStatus.OnHold]: 'bg-orange-50 text-orange-700 ring-orange-200 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:ring-orange-900 dark:border-orange-900',
  [allocateStatus.WorkInProgress]: 'bg-sky-50 text-sky-700 ring-sky-200 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:ring-sky-900 dark:border-sky-900',
  [allocateStatus.OpenToWork]: 'bg-violet-50 text-violet-700 ring-violet-200 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-900 dark:border-violet-900',
  [allocateStatus.Completed]: 'bg-emerald-50 text-emerald-700 ring-emerald-200 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900 dark:border-emerald-900',
};

const PI_STATUS_CLASSES: Record<string, string> = {
  Pending: JOB_STATUS_CLASSES[allocateStatus.Pending],
  Sent: JOB_STATUS_CLASSES[allocateStatus.WorkInProgress],
  Accepted: JOB_STATUS_CLASSES[allocateStatus.OpenToWork],
  Received: JOB_STATUS_CLASSES[allocateStatus.Completed],
  Completed: JOB_STATUS_CLASSES[allocateStatus.Completed],
  Rejected: 'bg-red-50 text-red-700 ring-red-200 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900 dark:border-red-900',
};

/** Jobs listed for invoicing: only those on hold for an advance payment (see tabFilter). */
/** In Progress: jobs with a PI that is not yet received, while the job is still open. */
const IN_PROCESS_STATUSES = [allocateStatus.Pending, allocateStatus.OpenToWork, allocateStatus.WorkInProgress, allocateStatus.OnHold];
/** New Jobs: jobs on hold for an advance payment that have no PI yet (see tabFilter). */
const NEW_JOB_STATUSES = [allocateStatus.OnHold];

const formatDateTime = (value?: string | Date | null) =>
  value ? new Date(value).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
const formatMoney = (value: number | undefined, currency = 'QAR') =>
  `${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;

const fullName = (e?: { firstName?: string; lastName?: string } | null) => (e ? `${e.firstName ?? ''} ${e.lastName ?? ''}`.trim() : '');

@Component({
  selector: 'app-invoices',
  standalone: true,
  imports: [CommonModule, RouterModule, DataGridComponent, DetailTimelineComponent, DetailDocumentsComponent, DetailMetaComponent, DetailOverviewComponent, DetailTableComponent, PiFormDrawerComponent, PiInvoiceDrawerComponent],
  templateUrl: './invoices.component.html',
  styleUrl: './invoices.component.css',
})
export class InvoicesComponent implements OnInit, OnDestroy {
  private readonly jobService = inject(JobService);
  private readonly employeeService = inject(EmployeeService);
  private readonly notificationService = inject(ToastrService);
  private readonly router = inject(Router);
  private readonly piService = inject(ProformaInvoiceService);
  private readonly invoiceService = inject(InvoiceService);
  private readonly dialog = inject(MatDialog);
  private readonly modal = inject(ModalService);
  private readonly fileService = inject(FileService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly customerInvoiceService = inject(CustomerInvoiceService);
  /** Proformas on the current page that already have an invoice. */
  private invoicedPis = new Map<string, string>();
  private readonly canInvoice = (row: any): boolean =>
    this.canCreate && row.proforma?.status === 'Received' && !this.invoicedPis.has(String(row.proforma._id));
  private readonly canConfirmPayment = (row: any): boolean =>
    this.canApprove && this.hasInvoice(row) && (
      (row.proforma?.status === 'Received' && !row.proforma?.paymentConfirmedAt)
      // Already confirmed, but the job is still held for the advance: confirming again releases it.
      || ((row.proforma?.status === 'Completed' || !!row.proforma?.paymentConfirmedAt) && row.allocateStatus === allocateStatus.OnHold && row.holdType !== 'other'));
  private readonly hasInvoice = (row: any): boolean => !!row.proforma && this.invoicedPis.has(String(row.proforma._id));

  drawerOpen = false;
  drawerJob: any = null;
  drawerPi: ProformaInvoice | null = null;
  invoiceDrawerOpen = false;
  invoiceDrawerPi: ProformaInvoice | null = null;

  closeDrawer(): void { this.drawerOpen = false; }

  onDrawerSaved(): void {
    this.drawerOpen = false;
    this.historyCache.clear();
    this.load();
    this.loadCounts();
  }

  rows: any[] = [];
  total = 0;
  isLoading = false;
  page = 1;
  pageSize = 15;
  search = '';
  viewId = 'all';

  readonly breadcrumbs: DataGridBreadcrumb[] = [{ label: 'Home', link: '/' }, { label: 'Finance' }, { label: 'Invoice' }];
  views: DataGridView<any>[] = [{ id: 'all', label: 'All' }, { id: 'newjob', label: 'New Jobs' }, { id: 'inprocess', label: 'In Progress' }, { id: 'received', label: 'Received' }, { id: 'completed', label: 'Completed' }];

  columns: DataGridColumn<any>[] = this.allColumns();
  private columnsView = '';

  /** Every tab lists jobs with the same columns. */
  private allColumns(): DataGridColumn<any>[] { return [
    { key: 'date', label: 'Date', type: 'date', width: '120px' },
    { key: 'jobRef', label: 'Job Id', locked: true },
    { key: 'customer', label: 'Customer' },
    { key: 'salesPerson', label: 'Sales Person', valueGetter: (r) => fullName(r.salesPersonDetails?.[0]) || '-' },
    { key: 'details', label: 'Subject' },
    { key: 'amount', label: 'LPO Value (QAR)', type: 'currency', currencyCode: 'QAR', align: 'right' },
    { key: 'status', label: 'Status', type: 'badge', badgeClasses: JOB_STATUS_CLASSES },
    { key: 'piNo', label: 'PI Id' },
    { key: 'piStatus', label: 'PI Status', type: 'badge', badgeClasses: PI_STATUS_CLASSES },
  ]; }

  private jobToAllRow(j: any): any {
    return { ...j, kind: 'Job', date: j.updatedDate || j.createdDate, reference: j.jobId, jobRef: j.jobId,
      customer: j.clientDetails?.companyName || '-', details: j.quotation?.subject || '-',
      amount: j.lpoValue ?? 0, status: j.allocateStatus,
      piNo: j.proforma?.piNo || '-', piStatus: j.proforma?.status || '' };
  }

  private isAdv(viewId: string): boolean { return viewId === 'newjob' || viewId === 'inprocess' || viewId === 'received' || viewId === 'completed'; }

  /** Which jobs a tab lists, by job status and by the state of their latest proforma. */
  private tabFilter(viewId: string): { statuses?: allocateStatus[]; piState?: 'none' | 'inProcess' | 'received' | 'completed'; onHoldType?: 'advance-payment' } {
    switch (viewId) {
      case 'newjob': return { statuses: NEW_JOB_STATUSES, piState: 'none', onHoldType: 'advance-payment' };
      case 'inprocess': return { statuses: IN_PROCESS_STATUSES, piState: 'inProcess' };
      case 'received': return { piState: 'received' };
      case 'completed': return { piState: 'completed' };
      default: return {};
    }
  }

  readonly detailTabs: DataGridDetailTab[] = [
    { id: 'overview', label: 'Details', icon: 'info' },
    { id: 'items', label: 'Items', icon: 'package' },
    { id: 'documents', label: 'Documents', icon: 'files' },
    { id: 'history', label: 'History', icon: 'clock' },
  ];

  /** The proforma's payment proof, the only file attached to an advance. */
  paymentDocuments(row: any): DetailDocument[] {
    const doc = row.proforma?.payment?.document;
    if (!doc?.fileName) return [];
    return [{ id: 'payment', name: doc.originalname || doc.fileName, uploadedBy: 'Payment proof', date: doc.uploadedAt }];
  }

  onPaymentDocument(row: any): void {
    this.downloadPaymentDocument(row.proforma);
  }

  readonly itemColumns: DetailTableColumn[] = [
    { key: 'itemCode', label: 'Item Code', hiddenByDefault: true },
    { key: 'description', label: 'Description', truncate: true },
    { key: 'partNo', label: 'Part No', hiddenByDefault: true },
    { key: 'quantity', label: 'Qty', type: 'number', align: 'right' },
    { key: 'unitPrice', label: 'Unit price', type: 'currency', align: 'right' },
    { key: 'amount', label: 'Total', type: 'currency', align: 'right' },
  ];
  /** Footer card under the items: total price, discount and net total. */
  itemFootRows(row: any): DetailFootRow[] {
    const pi = row.proforma;
    if (!pi) return [];
    const total = Number(pi.amount) || 0;
    const discount = Number(pi.summary?.customerDiscount) || 0;
    const cell = (value: number) => ({ amount: { value, format: 'currency' as const } });
    return [
      { label: 'Total price', cells: cell(total) },
      { label: 'Discount', cells: cell(discount) },
      { label: 'Net total', cells: cell(Math.max(0, total - discount)), emphasis: true },
    ];
  }
  /** Line items of the job's proforma (what the invoice bills). */
  itemRows(row: any): Record<string, any>[] {
    return (row.proforma?.items || []).map((i: any) => ({
      ...i,
      amount: i.amount ?? (Number(i.quantity) || 0) * (Number(i.unitPrice) || 0),
    }));
  }
  private readonly auditLog = inject(AuditLogService);
  private historyCache = new Map<string, BehaviorSubject<DetailTimelineEntry[]>>();
  readonly rowOpenable = (): boolean => true;
  readonly title = (row: any) => row.jobId || '';
  readonly subtitle = (row: any) => row.clientDetails?.companyName || '';

  // ---- Advances detail panel ----

  private netTotal(pi: any): number { return Math.max(0, (pi.amount || 0) - (pi.summary?.customerDiscount || 0)); }

  advanceMeta(row: any): DetailMetaItem[] {
    const pi = row.proforma;
    if (!pi) {
      const d = piDefaultsFromJob(row);
      return [
        { label: 'Job Id', value: row.jobId },
        { label: 'Status', value: row.allocateStatus },
        { label: 'Customer', value: d.client.name },
        { label: 'Payment terms', value: d.paymentTerms },
      ];
    }
    return [
      { label: 'PI No', value: pi.piNo },
      { label: 'Status', value: pi.status },
      { label: 'Total price', value: this.netTotal(pi), format: 'currency' },
      { label: 'Expected date', value: pi.expectedDate, format: 'date' },
    ];
  }

  advanceCurrency(row: any): string { return row.proforma?.currency || row.quotation?.currency || 'QAR'; }

  advanceSections(row: any): DetailOverviewSection[] {
    const d = piDefaultsFromJob(row);
    const pi = row.proforma;
    const sections: DetailOverviewSection[] = [{
      title: 'Job', columns: '2',
      fields: [
        { type: 'field', label: 'Job Id', value: row.jobId || '-' },
        { type: 'field', label: 'Status', value: row.allocateStatus || '-' },
        { type: 'field', label: 'Customer', value: d.client.name || '-' },
        { type: 'field', label: 'Subject', value: d.subject || '-' },
        { type: 'field', label: 'Customer PO', value: d.lpoNo || '-' },
        { type: 'field', label: 'Payment terms', value: d.paymentTerms || '-' },
      ],
    }];
    if (!pi) return sections;
    const cur = pi.currency;
    sections.push(
      {
        title: 'Proforma', columns: '2',
        fields: [
          { type: 'field', label: 'PI No', value: pi.piNo },
          { type: 'field', label: 'Status', value: pi.status },
          { type: 'field', label: 'Created by', value: fullName(pi.createdBy) || '-' },
          { type: 'field', label: 'Created', value: formatDateTime(pi.createdAt) },
        ],
      },
      {
        title: 'Cost summary', columns: '2',
        fields: [
          { type: 'field', label: 'Items price', value: formatMoney(pi.summary?.itemsPrice ?? pi.amount, cur) },
          { type: 'field', label: 'Customer discount', value: formatMoney(pi.summary?.customerDiscount || 0, cur) },
          { type: 'field', label: 'Total price', value: formatMoney(this.netTotal(pi), cur), tone: 'active' },
          { type: 'field', label: 'Expected amount', value: formatMoney(pi.expectedAmount || 0, cur) },
          { type: 'field', label: 'Expected date', value: pi.expectedDate ? new Date(pi.expectedDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '-' },
        ],
      },
      {
        title: 'Client and terms', columns: '2',
        fields: [
          { type: 'field', label: 'Client', value: pi.client?.name || '-' },
          { type: 'field', label: 'Attention', value: pi.attention || '-' },
          { type: 'field', label: 'Ship to', value: pi.shipTo || '-' },
          { type: 'field', label: 'LPO No', value: pi.lpoNo || '-' },
          { type: 'field', label: 'Payment terms', value: pi.paymentTerms || '-' },
        ],
      },
    );
    return sections;
  }

  /** Recorded events of the job's proforma; a job without one has none yet. */
  advanceHistory(row: any): Observable<DetailTimelineEntry[]> {
    const pi = row.proforma;
    if (!pi) return of([]);
    let subject = this.historyCache.get(pi._id);
    if (!subject) {
      subject = new BehaviorSubject<DetailTimelineEntry[]>([]);
      this.historyCache.set(pi._id, subject);
      this.auditLog.getHistory('proformaInvoice', pi._id).subscribe({
        next: (e: any) => subject!.next(toTimelineEntries(e)),
        error: () => this.historyCache.delete(pi._id),
      });
    }
    return subject.asObservable();
  }

  rowActions: DataGridRowAction<any>[] = this.actionsFor('all');

  /** Advances bill the customer up-front with a proforma; the other tabs raise a regular invoice. */
  private actionsFor(viewId: string): DataGridRowAction<any>[] {
    // All tab: job rows get the proforma actions (create, or edit/status/preview/download once one exists); 
    if (viewId === 'all') {
      const notJob = (row: any) => row.kind !== 'Job';
      return [
        { id: 'create-proforma', label: 'Create proforma', icon: 'plus', quick: true, panel: false, hidden: (row: any) => notJob(row) || !!row.proforma },
        { id: 'edit-proforma', label: 'Edit PI', icon: 'pencil', quick: true, panel: false, hidden: (row: any) => notJob(row) || !row.proforma || !this.canCreate || row.proforma.status === 'Received' || row.proforma.status === 'Completed' },
        { id: 'update-status', label: 'Update status', icon: 'flag', quick: true, panel: false, hidden: (row: any) => notJob(row) || !row.proforma || !this.canApprove || this.hasInvoice(row) },
        { id: 'confirm-payment', label: 'Confirm payment', icon: 'check', quick: true, panel: false, hidden: (row: any) => notJob(row) || !this.canConfirmPayment(row) },
        { id: 'create-invoice', label: 'Create invoice', icon: 'plus', quick: true, panel: false, hidden: (row: any) => notJob(row) || !this.canInvoice(row) },
        { id: 'preview-proforma', label: 'Preview proforma', icon: 'customerBill', quick: true, panel: false, hidden: (row: any) => notJob(row) || !row.proforma },
        { id: 'download-proforma', label: 'Download proforma', icon: 'download', panel: false, hidden: (row: any) => notJob(row) || !row.proforma },
        { id: 'preview-invoice', label: 'Preview invoice', icon: 'documentText', quick: true, panel: false, hidden: (row: any) => notJob(row) || !this.hasInvoice(row) },
        { id: 'download-invoice', label: 'Download invoice', icon: 'download', panel: false, hidden: (row: any) => notJob(row) || !this.hasInvoice(row) },
        { id: 'payment-document', label: 'Payment document', icon: 'download', panel: false, hidden: (row: any) => notJob(row) || !row.proforma?.payment?.document?.fileName },
        { id: 'view-job', label: 'View job', icon: 'jobSheet', panel: false, hidden: (row: any) => notJob(row) },
      ];
    }
    return [
      { id: 'create-proforma', label: 'Create proforma', icon: 'plus', quick: true, panel: false, hidden: (row: any) => !!row.proforma },
      ...([
        { id: 'edit-proforma', label: 'Edit PI', icon: 'pencil', quick: true, panel: false, hidden: (row: any) => !row.proforma || !this.canCreate || row.proforma.status === 'Received' || row.proforma.status === 'Completed' },
        { id: 'update-status', label: 'Update status', icon: 'flag', quick: true, panel: false, hidden: (row: any) => !row.proforma || !this.canApprove || this.hasInvoice(row) },
        { id: 'confirm-payment', label: 'Confirm payment', icon: 'check', quick: true, panel: false, hidden: (row: any) => !this.canConfirmPayment(row) },
        { id: 'create-invoice', label: 'Create invoice', icon: 'plus', quick: true, panel: false, hidden: (row: any) => !this.canInvoice(row) },
        { id: 'preview-proforma', label: 'Preview proforma', icon: 'customerBill', quick: true, panel: false, hidden: (row: any) => !row.proforma },
        { id: 'download-proforma', label: 'Download proforma', icon: 'download', panel: false, hidden: (row: any) => !row.proforma },
      ]),
      { id: 'preview-invoice', label: 'Preview invoice', icon: 'documentText', quick: true, panel: false, hidden: (row: any) => !this.hasInvoice(row) },
      { id: 'download-invoice', label: 'Download invoice', icon: 'download', panel: false, hidden: (row: any) => !this.hasInvoice(row) },
      { id: 'payment-document', label: 'Payment document', icon: 'download', panel: false, hidden: (row: any) => !row.proforma?.payment?.document?.fileName },
      { id: 'view-job', label: 'View job', icon: 'jobSheet', panel: false },
    ];
  }


  private loadSub?: Subscription;
  private privSub?: Subscription;
  canCreate = false;
  canApprove = false;

  private updateStatus(pi: ProformaInvoice): void {
    this.modal.open<ProformaStatusPayload>(PiStatusModalComponent, { width: '560px', data: pi })
      .afterClosed().subscribe((payload) => {
        if (!payload) return;
        this.piService.updateStatus(pi._id, payload).subscribe({
          next: () => {
            this.notificationService.success(`${pi.piNo} moved to ${payload.status}`);
            this.historyCache.clear();
            this.load();
            this.loadCounts();
          },
          error: (err) => this.notificationService.error(err?.error?.message || 'Failed to update the status'),
        });
      });
  }

  private downloadPaymentDocument(pi: ProformaInvoice): void {
    const doc = pi?.payment?.document;
    if (!doc) return;
    this.fileService.downloadFileWithProgress(doc.fileName, doc.originalname, () => {}, () => this.notificationService.error('Failed to download the document'));
  }

  private async confirmPayment(pi: ProformaInvoice): Promise<void> {
    const { confirmed } = await this.confirmDialog.open({
      tone: 'approve',
      title: 'Confirm payment',
      message: `Confirm that the payment for ${pi.piNo} has been received. This will forward the job to the next stage so work can proceed.`,
      details: [
        { label: 'Proforma', value: pi.piNo },
        { label: 'Job', value: pi.jobId },
        { label: 'Client', value: pi.client?.name || '-' },
        { label: 'Amount', value: formatMoney(pi.expectedAmount || pi.amount, pi.currency) },
      ],
      consequence: 'The job leaves hold and moves into the next process. This cannot be undone.',
      confirmLabel: 'Confirm payment',
    });
    if (!confirmed) return;
    this.piService.confirmPayment(pi._id).subscribe({
      next: () => {
        this.notificationService.success(`Payment confirmed for ${pi.piNo}`);
        this.historyCache.clear();
        this.load();
        this.loadCounts();
      },
      error: (err) => this.notificationService.error(err?.error?.message || 'Failed to confirm the payment'),
    });
  }

  private createInvoice(pi: ProformaInvoice): void {
    this.invoiceDrawerPi = pi;
    this.invoiceDrawerOpen = true;
  }

  onInvoiceCreated(invoice: any): void {
    const pi = this.invoiceDrawerPi;
    this.invoiceDrawerOpen = false;
    this.notificationService.success(`Invoice ${invoice?.invoiceNo || ''} created${pi ? ' for ' + pi.piNo : ''}`);
    this.load();
    this.loadCounts();
  }

  ngOnInit(): void {
    this.privSub = this.employeeService.employeeData$.subscribe((employee) => {
      const elevated = /^(superadmin|admin)$/i.test(String(employee?.category?.role ?? ''));
      const invoice = employee?.category?.privileges?.invoice;
      this.canCreate = elevated || !!invoice?.piCreateEdit;
      this.canApprove = elevated || !!invoice?.piApprove;
    });
    this.load();
    this.loadCounts();
  }

  private setCount(id: string, count: number): void {
    this.views = this.views.map((v) => (v.id === id ? { ...v, count } : v));
  }

  /** Fills every tab's badge up front (search-independent), so they don't stay blank until each tab is opened. */
  private loadCounts(): void {
    this.employeeService.employeeData$.pipe(take(1)).subscribe((employee) => {
      const jobCount = (viewId: string) => {
        const { statuses, piState, onHoldType } = this.tabFilter(viewId);
        return this.jobService.getJobs({
          search: '', page: 1, row: 1, status: null,
          access: employee?.category?.privileges?.jobSheet?.viewReport, userId: employee?._id,
          allocateStatuses: statuses, piState, onHoldType,
        });
      };
      ['newjob', 'inprocess', 'received', 'completed'].forEach((id) =>
        jobCount(id).subscribe({ next: (d: JobTable) => this.setCount(id, d?.total ?? 0), error: () => {} }));
      jobCount('all').subscribe({ next: (d: JobTable) => this.setCount('all', d?.total ?? 0), error: () => {} });
    });
  }

  ngOnDestroy(): void {
    this.loadSub?.unsubscribe();
    this.privSub?.unsubscribe();
  }

  onQueryChange(query: DataGridQuery): void {
    this.page = query.page;
    this.pageSize = query.pageSize;
    this.search = query.search;
    const viewId = query.viewId || 'all';
    const viewChanged = viewId !== this.viewId || !this.columnsView;
    this.viewId = viewId;
    if (viewChanged) {
      this.columnsView = viewId;
      this.columns = this.allColumns();
    }
    this.rowActions = this.actionsFor(this.viewId);
    this.historyCache.clear();
    this.load();
  }

  onRowAction({ action, row }: DataGridRowActionEvent<any>): void {
    switch (action.id) {
      case 'create-proforma': this.drawerJob = row; this.drawerPi = null; this.drawerOpen = true; break;
      case 'edit-proforma': this.drawerJob = row; this.drawerPi = row.proforma; this.drawerOpen = true; break;
      case 'update-status': this.updateStatus(row.proforma); break;
      case 'preview-proforma': this.renderProforma(row.proforma, false); break;
      case 'download-proforma': this.renderProforma(row.proforma, true); break;
      case 'payment-document': this.downloadPaymentDocument(row.proforma); break;
      case 'confirm-payment': void this.confirmPayment(row.proforma); break;
      case 'create-invoice': this.createInvoice(row.proforma); break;
      case 'preview-invoice': this.renderInvoice(row.proforma, false); break;
      case 'download-invoice': this.renderInvoice(row.proforma, true); break;
      case 'view-job': this.router.navigate(['/job-sheet/view', row.job?._id || row._id], { state: { returnUrl: this.router.url } }); break;
    }
  }

  private load(): void {
    this.isLoading = true;
    // A newer request supersedes an older one, so a slow earlier response can never overwrite the current page.
    this.loadSub?.unsubscribe();
    this.loadSub = this.employeeService.employeeData$.pipe(
      take(1),
      switchMap((employee) => {
        const { statuses, piState, onHoldType } = this.tabFilter(this.viewId);
        return this.jobService.getJobs({
          search: this.search, page: this.page, row: this.pageSize, status: null,
          access: employee?.category?.privileges?.jobSheet?.viewReport, userId: employee?._id,
          allocateStatuses: statuses, piState, onHoldType,
        });
      }),
      // Advances: attach each job's latest proforma so already-billed rows offer preview/download.
      switchMap((data: JobTable) => {
        const jobs = data?.job ?? [];
        const none = { data, pis: [] as ProformaInvoice[], invoiced: new Map<string, string>() };
        if (!jobs.length) return of(none);
        return this.piService.list({ page: 1, limit: 100, jobs: jobs.map((j: any) => j._id) }).pipe(
          switchMap((res) => {
            const pis = res?.data ?? [];
            const received = pis.filter((p) => p.status === 'Received' || p.status === 'Completed').map((p) => p._id);
            if (!received.length) return of({ data, pis, invoiced: new Map<string, string>() });
            // Which received proformas already have their invoice, so "Create invoice" is offered once.
            return this.customerInvoiceService.list({ page: 1, limit: 100, search: '', proformaInvoices: received.join(',') }).pipe(
              map((r) => ({ data, pis, invoiced: new Map<string, string>((r?.data ?? []).map((i: any) => [String(i.proformaInvoice?._id ?? i.proformaInvoice), String(i._id)] as [string, string])) })),
              catchError(() => of({ data, pis, invoiced: new Map<string, string>() })),
            );
          }),
          catchError(() => of(none)),
        );
      }),
    ).subscribe({
      next: ({ data, pis, invoiced }) => {
        this.invoicedPis = invoiced;
        const latest = new Map<string, ProformaInvoice>();
        // The API returns newest first, so the first one seen per job is the latest.
        pis.forEach((pi) => { const key = String((pi as any).job?._id ?? pi.job); if (!latest.has(key)) latest.set(key, pi); });
        this.rows = data?.job ? data.job.map((j: any) => {
          const proforma = latest.get(String(j._id)) ?? null;
          // PI Id / PI Status come from the attached proforma, so set them after it is known.
          return { ...this.jobToAllRow(j), proforma, piNo: proforma?.piNo || '-', piStatus: proforma?.status || '' };
        }) : [];
        this.total = data?.total ?? 0;
        this.setCount(this.viewId, this.total);
        this.isLoading = false;
      },
      error: () => {
        this.notificationService.error('Failed to load jobs');
        this.isLoading = false;
      },
    });
  }

  /** Loads the invoice raised for this PI and prints it with the standard invoice layout. */
  private renderInvoice(pi: ProformaInvoice, download: boolean): void {
    const id = this.invoicedPis.get(String(pi._id));
    if (!id) return;
    this.customerInvoiceService.get(id).subscribe({
      next: (res) => {
        const inv = res?.data ?? res;
        const customer = inv?.customer && typeof inv.customer === 'object' && inv.customer.companyName ? inv.customer : { ...(typeof inv?.customer === 'object' ? inv.customer : {}), companyName: pi.client?.name };
        const invoice = { ...inv, customer, date: inv?.createdAt || inv?.date, shipTo: inv?.shipTo || pi.shipTo, paymentTerms: inv?.paymentTerms || pi.paymentTerms, jobId: inv?.jobId?.jobId ? inv.jobId : { jobId: pi.jobId }, currency: inv?.currency || pi.currency || 'QAR', lpoRef: inv?.lpoRef || pi.lpoNo, subject: inv?.subject || pi.subject };
        this.invoiceService.generateInvoicePDF(invoice, download)
          .then((pdf) => download
            ? pdf.download(`${String(invoice.invoiceNo || pi.piNo).replace(/\//g, '-')}.pdf`)
            : pdf.getBlob((blob: Blob) => this.dialog.open(PdfPreviewComponent, {
              height: '90vh',
              maxWidth: '1200px',
              data: { url: window.URL.createObjectURL(blob), formatedQuote: invoice, type: 'invoice' },
            })))
          .catch(() => this.notificationService.error('Failed to generate the invoice PDF'));
      },
      error: () => this.notificationService.error('Failed to load the invoice'),
    });
  }

  private renderProforma(pi: ProformaInvoice, download: boolean): void {
    const invoice = proformaToInvoice(pi);
    this.invoiceService.generateInvoicePDF(invoice, download)
      .then((pdf) => download
        ? pdf.download(`${pi.piNo.replace(/\//g, '-')}.pdf`)
        : pdf.getBlob((blob: Blob) => this.dialog.open(PdfPreviewComponent, {
          height: '90vh',
          maxWidth: '1200px',
          data: { url: window.URL.createObjectURL(blob), formatedQuote: invoice, type: 'invoice' },
        })))
      .catch(() => this.notificationService.error('Failed to generate the proforma PDF'));
  }
}
