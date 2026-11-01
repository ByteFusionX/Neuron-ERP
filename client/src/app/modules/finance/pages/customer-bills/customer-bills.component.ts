import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Observable, Subscription, catchError, forkJoin, of, switchMap, take } from 'rxjs';
import { AuditLogService } from 'src/app/core/services/audit-log.service';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { InvoiceService } from 'src/app/core/services/invoice.service';
import { JobService } from 'src/app/core/services/job/job.service';
import { ProformaInvoice, ProformaInvoiceService, ProformaStatusPayload } from 'src/app/core/services/proforma-invoice.service';
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
import { DetailMetaItem, DetailOverviewSection, DetailTableColumn, DetailTimelineEntry } from 'src/app/shared/components/detail-panel/detail-panel.model';
import { DetailMetaComponent } from 'src/app/shared/components/detail-panel/detail-meta.component';
import { DetailTimelineComponent } from 'src/app/shared/components/detail-panel/detail-timeline.component';
import { PdfPreviewComponent } from 'src/app/shared/components/pdf-preview/pdf-preview.component';
import { allocateStatus, getJob, JobTable } from 'src/app/shared/interfaces/job.interface';
import { toTimelineEntries } from 'src/app/shared/utils/audit-timeline.util';
import { FileService } from 'src/app/core/services/file.service';
import { PiStatusModalComponent } from './pi-status-modal/pi-status-modal.component';
import { PiFormDrawerComponent, piDefaultsFromJob } from './pi-form-drawer/pi-form-drawer.component';

const JOB_STATUS_CLASSES: Record<string, string> = {
  [allocateStatus.Pending]: 'bg-amber-50 text-amber-700 ring-amber-200 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900 dark:border-amber-900',
  [allocateStatus.OnHold]: 'bg-orange-50 text-orange-700 ring-orange-200 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:ring-orange-900 dark:border-orange-900',
};

const PI_STATUS_CLASSES: Record<string, string> = {
  Pending: 'bg-amber-50 text-amber-700 ring-amber-200 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900 dark:border-amber-900',
  Sent: 'bg-sky-50 text-sky-700 ring-sky-200 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:ring-sky-900 dark:border-sky-900',
  Accepted: 'bg-violet-50 text-violet-700 ring-violet-200 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-900 dark:border-violet-900',
  Received: 'bg-emerald-50 text-emerald-700 ring-emerald-200 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900 dark:border-emerald-900',
};

/** Jobs that still wait on finance: awaiting allocation (Pending) or paused (On Hold). */
const BILLABLE_STATUSES = [allocateStatus.Pending, allocateStatus.OnHold];

const fullName = (e?: { firstName?: string; lastName?: string } | null) => (e ? `${e.firstName ?? ''} ${e.lastName ?? ''}`.trim() : '');
const formatDateTime = (value?: string | Date | null) =>
  value ? new Date(value).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
const formatMoney = (value: number | undefined, currency = 'QAR') =>
  `${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;

@Component({
  selector: 'app-customer-bills',
  standalone: true,
  imports: [CommonModule, DataGridComponent, DetailOverviewComponent, DetailMetaComponent, DetailTimelineComponent, PiFormDrawerComponent],
  templateUrl: './customer-bills.component.html',
})
export class CustomerBillsComponent implements OnInit, OnDestroy {
  @ViewChild('grid') grid!: DataGridComponent<any>;

  private readonly jobService = inject(JobService);
  private readonly employeeService = inject(EmployeeService);
  private readonly invoiceService = inject(InvoiceService);
  private readonly piService = inject(ProformaInvoiceService);
  private readonly auditLog = inject(AuditLogService);
  private readonly notificationService = inject(ToastrService);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly fileService = inject(FileService);

  /** Jobs on the New tab, proforma invoices on every other tab. */
  rows: any[] = [];
  total = 0;
  isLoading = false;
  page = 1;
  pageSize = 15;
  search = '';
  activeViewId = 'new';

  canCreate = false;
  canApprove = false;

  drawerOpen = false;
  drawerJob: getJob | null = null;
  drawerPi: ProformaInvoice | null = null;

  readonly breadcrumbs: DataGridBreadcrumb[] = [{ label: 'Home', link: '/' }, { label: 'Finance' }, { label: 'Customer Bills' }];
  views: DataGridView<any>[] = [
    { id: 'new', label: 'New' },
    { id: 'all', label: 'All' },
    { id: 'pending', label: 'Pending' },
    { id: 'sent', label: 'Sent' },
    { id: 'accepted', label: 'Accepted' },
    { id: 'received', label: 'Received' },
  ];
  readonly detailTabs: DataGridDetailTab[] = [
    { id: 'overview', label: 'Details', icon: 'info' },
    { id: 'history', label: 'History', icon: 'clock' },
  ];

  /** Same layout as the Job Sheet list, narrowed to the jobs waiting for a proforma. */
  private readonly jobColumns: DataGridColumn<any>[] = [
    { key: 'updatedDate', label: 'Last Updated', type: 'date', width: '125px' },
    { key: 'jobId', label: 'Job Id', locked: true },
    { key: 'allocateStatus', label: 'Status', type: 'badge', badgeClasses: JOB_STATUS_CLASSES },
    { key: 'customerName', label: 'Customer', valueGetter: (r) => r.clientDetails?.companyName || '-' },
    { key: 'description', label: 'Subject', valueGetter: (r) => r.quotation?.subject || '-' },
    { key: 'lpoValue', label: 'LPO Value (QAR)', type: 'currency', currencyCode: 'QAR', align: 'right', valueGetter: (r) => r.lpoValue ?? 0 },
    { key: 'salesPerson', label: 'Sales Person', valueGetter: (r) => fullName(r.salesPersonDetails?.[0]) || '-' },
    { key: 'department', label: 'Department', valueGetter: (r) => r.departmentDetails?.[0]?.departmentName || '-' },
    { key: 'quoteId', label: 'Quote Id', valueGetter: (r) => r.quotation?.quoteId || '-' },
    { key: 'dealId', label: 'Deal Id', valueGetter: (r) => r.quotation?.dealData?.dealId || '-' },
  ];

  private readonly piColumns: DataGridColumn<any>[] = [
    { key: 'createdAt', label: 'Created', type: 'date', width: '125px' },
    { key: 'piNo', label: 'PI No', locked: true },
    { key: 'jobId', label: 'Job Id' },
    { key: 'client', label: 'Client', valueGetter: (r) => r.client?.name || '-' },
    { key: 'attention', label: 'Attention', valueGetter: (r) => r.attention || '-' },
    { key: 'paymentTerms', label: 'Payment Terms', valueGetter: (r) => r.paymentTerms || '-' },
    { key: 'shipTo', label: 'Ship To', visible: false, valueGetter: (r) => r.shipTo || '-' },
    { key: 'lpoNo', label: 'LPO No', valueGetter: (r) => r.lpoNo || '-' },
    { key: 'amount', label: 'Amount', align: 'right', valueGetter: (r) => formatMoney(r.amount, r.currency) },
    { key: 'status', label: 'Status', type: 'badge', badgeClasses: PI_STATUS_CLASSES },
    { key: 'paymentMethod', label: 'Payment Method', visible: false, valueGetter: (r) => (r.payment?.method === 'Other' ? r.payment.otherMethod : r.payment?.method) || '-' },
    { key: 'referenceNo', label: 'Reference No', visible: false, valueGetter: (r) => r.payment?.referenceNo || '-' },
    { key: 'createdBy', label: 'Created By', valueGetter: (r) => fullName(r.createdBy) || '-' },
  ];

  columns: DataGridColumn<any>[] = this.jobColumns;

  readonly rowActions: DataGridRowAction<any>[] = [
    { id: 'create-pi', label: 'Create PI', icon: 'plus', quick: true, panel: false, hidden: (row) => this.isPi(row) || !this.canCreate },
    { id: 'view-job', label: 'View job', icon: 'jobSheet', panel: false },
    { id: 'preview-pi', label: 'Preview PI', icon: 'customerBill', quick: true, panel: false, hidden: (row) => !this.isPi(row) },
    { id: 'download-pi', label: 'Download PI', icon: 'download', panel: false, hidden: (row) => !this.isPi(row) },
    { id: 'edit-pi', label: 'Edit PI', icon: 'pencil', quick: true, panel: false, hidden: (row) => !this.isPi(row) || !this.canCreate || row.status === 'Received' },
    { id: 'update-status', label: 'Update status', icon: 'flag', quick: true, panel: false, hidden: (row) => !this.isPi(row) || !this.canApprove },
    { id: 'payment-document', label: 'Payment document', icon: 'download', panel: false, hidden: (row) => !row.payment?.document?.fileName },
  ];

  readonly itemColumns: DetailTableColumn[] = [
    { key: 'description', label: 'Description', wrap: true },
    { key: 'quantity', label: 'Qty', type: 'number' },
    { key: 'unitPrice', label: 'Unit Price', type: 'currency' },
    { key: 'amount', label: 'Total', type: 'currency', total: true },
  ];

  readonly title = (row: any) => (this.isPi(row) ? row.piNo : row.jobId) || '';
  readonly subtitle = (row: any) => (this.isPi(row) ? row.client?.name : row.clientDetails?.companyName) || '';

  private counts: Record<string, number> = {};
  private loadSub?: Subscription;
  private readonly subs = new Subscription();
  private historyCache = new Map<string, BehaviorSubject<DetailTimelineEntry[]>>();

  ngOnInit(): void {
    this.subs.add(this.employeeService.employeeData$.subscribe((employee) => {
      const role = String(employee?.category?.role ?? '');
      const elevated = /^(superadmin|admin)$/i.test(role);
      const invoice = employee?.category?.privileges?.invoice;
      this.canCreate = elevated || !!invoice?.piCreateEdit;
      this.canApprove = elevated || !!invoice?.piApprove;
    }));
    this.load();
    this.refreshCounts();
  }

  ngOnDestroy(): void {
    this.loadSub?.unsubscribe();
    this.subs.unsubscribe();
  }

  isPi(row: any): boolean {
    return !!row?.piNo;
  }

  onQueryChange(query: DataGridQuery): void {
    const viewId = query.viewId || 'new';
    const modeChanged = (viewId === 'new') !== (this.activeViewId === 'new');
    this.page = query.page;
    this.pageSize = query.pageSize;
    this.search = query.search;
    this.activeViewId = viewId;
    if (modeChanged) {
      // Rows of the other shape must not render under the new columns.
      this.rows = [];
      this.total = 0;
      this.columns = viewId === 'new' ? this.jobColumns : this.piColumns;
    }
    this.piColumns.filter((c) => c.key === 'paymentMethod' || c.key === 'referenceNo').forEach((c) => { c.visible = viewId === 'received'; });
    this.load();
  }

  onRowAction({ action, row }: DataGridRowActionEvent<any>): void {
    switch (action.id) {
      case 'create-pi': this.openDrawer(row, null); break;
      case 'edit-pi': this.openDrawer(null, row); break;
      case 'view-job': this.router.navigate(['/job-sheet/view', this.isPi(row) ? row.job : row._id], { state: { returnUrl: this.router.url } }); break;
      case 'preview-pi': this.renderPi(row, false); break;
      case 'download-pi': this.renderPi(row, true); break;
      case 'update-status': this.updateStatus(row); break;
      case 'payment-document': this.downloadPaymentDocument(row); break;
    }
  }

  openDrawer(job: getJob | null, pi: ProformaInvoice | null): void {
    this.drawerJob = job;
    this.drawerPi = pi;
    this.drawerOpen = true;
  }

  closeDrawer(): void {
    this.drawerOpen = false;
  }

  onDrawerSaved(): void {
    this.drawerOpen = false;
    this.historyCache.clear();
    this.load();
    this.refreshCounts();
  }

  // ---- data ----

  private load(): void {
    this.isLoading = true;
    // A newer request supersedes an older one, so a slow earlier response can never overwrite the current tab.
    this.loadSub?.unsubscribe();
    this.loadSub = (this.activeViewId === 'new' ? this.loadJobs() : this.loadPis()).subscribe({
      next: () => { this.isLoading = false; },
      error: () => {
        this.notificationService.error('Failed to load customer bills');
        this.isLoading = false;
      },
    });
  }

  private loadJobs(): Observable<void> {
    return this.employeeService.employeeData$.pipe(
      take(1),
      switchMap((employee) => this.jobService.getJobs({
        search: this.search, page: this.page, row: this.pageSize, status: null,
        access: employee?.category?.privileges?.jobSheet?.viewReport, userId: employee?._id,
        allocateStatuses: BILLABLE_STATUSES,
        withoutPi: true,
      })),
      switchMap((data: JobTable) => {
        this.rows = data?.job ? [...data.job] : [];
        this.total = data?.total ?? 0;
        this.setCount('new', (data?.viewCounts?.[allocateStatus.Pending] ?? 0) + (data?.viewCounts?.[allocateStatus.OnHold] ?? 0));
        return of(void 0);
      }),
    );
  }

  private loadPis(): Observable<void> {
    return this.piService.list({
      page: this.page, limit: this.pageSize, search: this.search || undefined,
      status: this.activeViewId === 'all' ? undefined : this.activeViewId[0].toUpperCase() + this.activeViewId.slice(1),
    }).pipe(switchMap((res) => {
      this.rows = res?.data ?? [];
      this.total = res?.total ?? 0;
      this.applyPiCounts(res?.viewCounts);
      return of(void 0);
    }));
  }

  /** Counts for every tab: the active tab's own response supplies one side, this call supplies the other. */
  private refreshCounts(): void {
    forkJoin({
      pis: this.piService.list({ page: 1, limit: 1 }).pipe(catchError(() => of(null))),
      jobs: this.employeeService.employeeData$.pipe(
        take(1),
        switchMap((employee) => this.jobService.getJobs({
          search: '', page: 1, row: 1, status: null,
          access: employee?.category?.privileges?.jobSheet?.viewReport, userId: employee?._id,
          allocateStatuses: BILLABLE_STATUSES,
          withoutPi: true,
        })),
        catchError(() => of(null)),
      ),
    }).subscribe(({ pis, jobs }) => {
      if (pis) this.applyPiCounts(pis.viewCounts);
      if (jobs) this.setCount('new', (jobs.viewCounts?.[allocateStatus.Pending] ?? 0) + (jobs.viewCounts?.[allocateStatus.OnHold] ?? 0));
    });
  }

  private applyPiCounts(viewCounts?: Record<string, number>): void {
    const pending = viewCounts?.['Pending'] ?? 0;
    const sent = viewCounts?.['Sent'] ?? 0;
    const accepted = viewCounts?.['Accepted'] ?? 0;
    const received = viewCounts?.['Received'] ?? 0;
    this.counts = { ...this.counts, all: pending + sent + accepted + received, pending, sent, accepted, received };
    this.syncViews();
  }

  private setCount(id: string, count: number): void {
    this.counts = { ...this.counts, [id]: count };
    this.syncViews();
  }

  private syncViews(): void {
    this.views = this.views.map((v) => ({ ...v, count: this.counts[v.id] }));
  }

  // ---- status ----

  private updateStatus(pi: ProformaInvoice): void {
    this.dialog.open<PiStatusModalComponent, ProformaInvoice, ProformaStatusPayload | null>(PiStatusModalComponent, { width: '520px', data: pi })
      .afterClosed().subscribe((payload) => {
        if (!payload) return;
        this.piService.updateStatus(pi._id, payload).subscribe({
          next: () => {
            this.notificationService.success(`${pi.piNo} moved to ${payload.status}`);
            this.historyCache.clear();
            this.load();
            this.refreshCounts();
          },
          error: (err) => this.notificationService.error(err?.error?.message || 'Failed to update the status'),
        });
      });
  }

  private downloadPaymentDocument(pi: ProformaInvoice): void {
    const doc = pi.payment?.document;
    if (!doc) return;
    this.fileService.downloadFileWithProgress(doc.fileName, doc.originalname, () => {}, () => this.notificationService.error('Failed to download the document'));
  }

  // ---- PDF ----

  /** The stored PI is shaped like an invoice so the invoice PDF can print it in the proforma layout. */
  private invoiceFromPi(pi: ProformaInvoice): any {
    return {
      invoiceNo: pi.piNo,
      isProforma: true,
      documentTitle: 'PROFORMA INVOICE',
      attention: pi.attention,
      date: pi.createdAt,
      customer: { companyName: pi.client?.name },
      jobId: { jobId: pi.jobId },
      items: pi.items.map((i) => ({ description: i.description, quantity: i.quantity, amount: i.amount ?? i.quantity * i.unitPrice })),
      amount: pi.amount,
      discount: pi.summary?.customerDiscount || 0,
      claimAmount: pi.expectedAmount || Math.max(0, pi.amount - (pi.summary?.customerDiscount || 0)),
      subTotal: pi.amount,
      taxAmount: 0,
      paymentTerms: pi.paymentTerms,
      shipTo: pi.shipTo,
      dnNumbers: '',
      lpoRef: pi.lpoNo,
      subject: pi.subject,
      currency: pi.currency || 'QAR',
      quoteCompany: pi.quoteCompany || '',
      isPreview: true,
    };
  }

  private renderPi(pi: ProformaInvoice, download: boolean): void {
    const invoice = this.invoiceFromPi(pi);
    this.invoiceService.generateInvoicePDF(invoice, download)
      .then((pdf) => download
        ? pdf.download(`${pi.piNo.replace(/\//g, '-')}.pdf`)
        : pdf.getBlob((blob: Blob) => this.dialog.open(PdfPreviewComponent, {
          height: '90vh',
          maxWidth: '1200px',
          data: { url: window.URL.createObjectURL(blob), formatedQuote: invoice, type: 'invoice' },
        })))
      .catch(() => this.notificationService.error('Failed to generate the proforma invoice PDF'));
  }

  // ---- detail panel ----

  /** Price after the customer discount already given on the quote. */
  netTotal(row: any): number {
    return Math.max(0, (row.amount || 0) - (row.summary?.customerDiscount || 0));
  }

  metaFor(row: any): DetailMetaItem[] {
    if (!this.isPi(row)) {
      const d = piDefaultsFromJob(row);
      return [
        { label: 'Job Id', value: row.jobId },
        { label: 'Status', value: row.allocateStatus },
        { label: 'Customer', value: d.client.name },
        { label: 'Payment terms', value: d.paymentTerms },
      ];
    }
    return [
      { label: 'Status', value: row.status },
      { label: 'Total price', value: this.netTotal(row), format: 'currency' },
      { label: 'Expected amount', value: row.expectedAmount, format: 'currency' },
      { label: 'Expected date', value: row.expectedDate, format: 'date' },
    ];
  }

  overviewSections(row: any): DetailOverviewSection[] {
    if (!this.isPi(row)) {
      const d = piDefaultsFromJob(row);
      return [
        {
          title: 'Job', columns: '2',
          fields: [
            { type: 'field', label: 'Job Id', value: row.jobId || '-' },
            { type: 'field', label: 'Status', value: row.allocateStatus || '-' },
            { type: 'field', label: 'Customer', value: d.client.name || '-' },
            { type: 'field', label: 'Subject', value: d.subject || '-' },
            { type: 'field', label: 'Customer PO', value: d.lpoNo || '-' },
            { type: 'field', label: 'Payment terms', value: d.paymentTerms || '-' },
          ],
        },
      ];
    }
    return [
      {
        title: 'Overview', columns: '2',
        fields: [
          { type: 'field', label: 'PI No', value: row.piNo },
          { type: 'field', label: 'Status', value: row.status },
          { type: 'field', label: 'Job Id', value: row.jobId || '-' },
          { type: 'field', label: 'Created by', value: fullName(row.createdBy) || '-' },
          { type: 'field', label: 'Created', value: formatDateTime(row.createdAt) },
          { type: 'field', label: 'Status updated by', value: fullName(row.statusUpdatedBy) || '-', visible: !!row.statusUpdatedBy },
        ],
      },
      // Left out entirely until received, so a hidden section doesn't leave a double gap.
      ...(row.status === 'Received' && row.payment ? [<DetailOverviewSection>{
        title: 'Payment', columns: '2',
        fields: [
          { type: 'field', label: 'Method', value: (row.payment?.method === 'Other' ? row.payment?.otherMethod : row.payment?.method) || '-' },
          { type: 'field', label: 'Reference no', value: row.payment?.referenceNo || '-' },
          { type: 'field', label: 'Received', value: formatDateTime(row.payment?.receivedAt) },
          { type: 'field', label: 'Document', value: row.payment?.document?.originalname || 'None' },
        ],
      }] : []),
      {
        title: 'Cost summary', columns: '2',
        fields: [
          { type: 'field', label: 'Items price', value: formatMoney(row.summary?.itemsPrice ?? row.amount, row.currency) },
          { type: 'field', label: 'Customer discount', value: formatMoney(row.summary?.customerDiscount || 0, row.currency) },
          { type: 'field', label: 'Total price', value: formatMoney(this.netTotal(row), row.currency), tone: 'active' },
          { type: 'field', label: 'Expected amount', value: formatMoney(row.expectedAmount || 0, row.currency) },
          { type: 'field', label: 'Expected date', value: row.expectedDate ? new Date(row.expectedDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '-' },
        ],
      },
      {
        title: 'Client and terms', columns: '2',
        fields: [
          { type: 'field', label: 'Client', value: row.client?.name || '-' },
          { type: 'field', label: 'Attention', value: row.attention || '-' },
          { type: 'field', label: 'Ship to', value: row.shipTo || '-' },
          { type: 'field', label: 'LPO No', value: row.lpoNo || '-' },
          { type: 'field', label: 'Payment terms', value: row.paymentTerms || '-' },
        ],
      },
    ];
  }

  itemRows(row: any): Record<string, any>[] {
    if (this.isPi(row)) {
      return (row.items || []).map((i: any) => ({ description: i.description, quantity: i.quantity, unitPrice: i.unitPrice, amount: i.amount }));
    }
    return piDefaultsFromJob(row).items.map((i) => ({ ...i, amount: i.quantity * i.unitPrice }));
  }

  currencyOf(row: any): string {
    return (this.isPi(row) ? row.currency : row.quotation?.currency) || 'QAR';
  }

  /** Recorded events from the global audit log; jobs without a PI yet have none. */
  historyFor(row: any): Observable<DetailTimelineEntry[]> {
    if (!this.isPi(row)) return of([]);
    let subject = this.historyCache.get(row._id);
    if (!subject) {
      subject = new BehaviorSubject<DetailTimelineEntry[]>([]);
      this.historyCache.set(row._id, subject);
      this.auditLog.getHistory('proformaInvoice', row._id).subscribe({
        next: (entries) => subject!.next(toTimelineEntries(entries)),
        error: () => this.historyCache.delete(row._id),
      });
    }
    return subject.asObservable();
  }
}
