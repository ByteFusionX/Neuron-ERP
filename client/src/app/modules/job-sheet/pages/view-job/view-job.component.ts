import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, formatDate } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpEventType } from '@angular/common/http';
import { MatDialog } from '@angular/material/dialog';
import { ToastrService } from 'ngx-toastr';
import saveAs from 'file-saver';

import { JobService } from 'src/app/core/services/job/job.service';
import { JobHistoryService } from 'src/app/core/services/job/job-history.service';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { ModalService } from 'src/app/shared/components/modal';
import { allocateStatus, getJob, JobStatus } from 'src/app/shared/interfaces/job.interface';
import { TimelineEvent } from 'src/app/shared/interfaces/job-history.interface';
import { QuoteItemDetail } from 'src/app/shared/interfaces/quotation.interface';
import { dealSheetPriceDetails, selectedDealItems } from 'src/app/shared/utils/deal-pricing.util';
import { NumberFormatterPipe } from 'src/app/shared/pipes/numFormatter.pipe';
import { environment } from 'src/environments/environment';
import { StatusChangeModalComponent, StatusChangeResult } from 'src/app/shared/components/status-change-modal/status-change-modal.component';
import { AllocateTypeModalComponent, AllocateTypeResult } from '../allocate-type-modal/allocate-type-modal.component';
import { MarkLostModalComponent } from '../mark-lost-modal/mark-lost-modal.component';

import { DetailViewShellComponent, DetailViewStat } from 'src/app/shared/components/detail-view-shell/detail-view-shell.component';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { DetailSectionComponent } from 'src/app/shared/components/detail-panel/detail-section.component';
import { DetailFieldComponent } from 'src/app/shared/components/detail-panel/detail-field.component';
import { DetailFieldsMenuComponent, DetailFieldsMenuItem } from 'src/app/shared/components/detail-panel/detail-fields-menu.component';
import { DetailTableComponent } from 'src/app/shared/components/detail-panel/detail-table.component';
import { DetailDocumentsComponent } from 'src/app/shared/components/detail-panel/detail-documents.component';
import { DetailTimelineComponent } from 'src/app/shared/components/detail-panel/detail-timeline.component';
import { DetailDocument, DetailFootRow, DetailTableColumn, DetailTimelineEntry } from 'src/app/shared/components/detail-panel/detail-panel.model';
import { AuditLogService } from 'src/app/core/services/audit-log.service';
import { toTimelineEntries } from 'src/app/shared/utils/audit-timeline.util';
import { DETAIL_TONE, DetailTone } from 'src/app/shared/components/detail-panel/detail-tone';

/** A label/value in the Details section; ids link out, statuses show as dot + text. */
interface JobFact {
  label: string;
  value: string;
  link?: any[];
  queryParams?: Record<string, any>;
  state?: { dot: string; text: string };
}

type PanelTab = 'costs' | 'documents' | 'workflow' | 'history';

const ALLOCATE_STATUS_LABELS: Record<string, string> = {
  [allocateStatus.Pending]: 'Pending',
  [allocateStatus.OpenToWork]: 'Open To Work',
  [allocateStatus.WorkInProgress]: 'In Progress',
  [allocateStatus.Completed]: 'Completed',
  [allocateStatus.OnHold]: 'On Hold',
  [allocateStatus.Lost]: 'Lost',
};
/** Same set the job list offers in its status modal. */
const JOB_STATUSES: readonly JobStatus[] = [
  JobStatus.WorkInProgress, JobStatus.Delivered, JobStatus.partiallyDelivered, JobStatus.partiallyInvoiced, JobStatus.invoiced, JobStatus.completed, JobStatus.onHold,
];
const jobStatusLabel = (v: unknown): string => (v === JobStatus.WorkInProgress ? 'In Progress' : v ? String(v) : '—');

@Component({
  selector: 'app-view-job',
  templateUrl: './view-job.component.html',
  styleUrls: ['./view-job.component.css'],
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    DetailViewShellComponent,
    ActionButtonComponent,
    DetailSectionComponent,
    DetailFieldComponent,
    DetailFieldsMenuComponent,
    DetailTableComponent,
    DetailDocumentsComponent,
    DetailTimelineComponent,
  ],
})
export class ViewJobComponent implements OnInit {
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private jobService = inject(JobService);
  private jobHistoryService = inject(JobHistoryService);
  private employeeService = inject(EmployeeService);
  private toast = inject(ToastrService);
  private modal = inject(ModalService);
  private matDialog = inject(MatDialog);
  private auditLog = inject(AuditLogService);

  loading = true;
  job: getJob | null = null;
  /** The job's quotation with client, owner and department filled in from the job lookup. */
  quote: any = null;
  returnUrl = '/job-sheet';
  get returnPath(): string { return this.returnUrl.split('?')[0]; }

  panelOpen = true;
  panelTab: PanelTab = 'costs';
  readonly panelTabs: { id: PanelTab; label: string }[] = [
    { id: 'costs', label: 'Costs' },
    { id: 'documents', label: 'Documents' },
    { id: 'workflow', label: 'Workflow' },
    { id: 'history', label: 'History' },
  ];
  historyEntries: DetailTimelineEntry[] = [];

  stats: DetailViewStat[] = [];
  detailFacts: JobFact[] = [];
  detailItems: DetailFieldsMenuItem[] = [];
  hiddenDetail = new Set<string>();
  detailOrder: string[] = [];
  get visibleDetail(): JobFact[] {
    const pos = (k: string) => { const i = this.detailOrder.indexOf(k); return i < 0 ? this.detailOrder.length : i; };
    return this.detailFacts.filter((f) => !this.hiddenDetail.has(f.label)).sort((a, b) => pos(a.label) - pos(b.label));
  }
  trackFact = (_: number, f: JobFact) => f.label;

  itemRows: Record<string, any>[] = [];
  itemFootRows: DetailFootRow[] = [];
  costRows: Record<string, any>[] = [];
  documents: DetailDocument[] = [];
  private docFiles = new Map<string, any>();

  workflow: TimelineEvent[] = [];
  workflowStatus: 'idle' | 'loading' | 'ready' | 'error' = 'idle';

  readonly itemColumns: DetailTableColumn[] = [
    { key: 'itemCode', label: 'Item Code', hiddenByDefault: true },
    { key: 'detail', label: 'Item Details', type: 'text', wrap: true },
    { key: 'partNo', label: 'Part No', hiddenByDefault: true },
    { key: 'quantity', label: 'Qty', type: 'number', align: 'center' },
    { key: 'unitCost', label: 'Unit Cost', type: 'currency', align: 'right' },
    { key: 'totalCost', label: 'Total Cost', type: 'currency', align: 'right', total: true },
    { key: 'unitSellingPrice', label: 'Unit Selling Price', type: 'currency', align: 'right' },
    { key: 'totalSellingPrice', label: 'Total Selling Price', type: 'currency', align: 'right', total: true },
    { key: 'supplier', label: 'Supplier', type: 'text' },
  ];
  readonly costColumns: DetailTableColumn[] = [
    { key: 'type', label: 'Type', type: 'text' },
    { key: 'name', label: 'Name', type: 'text', wrap: true },
    { key: 'value', label: 'Value', type: 'currency', align: 'right', total: true },
  ];

  private isSuperAdmin = false;
  private canAllocateJobs = false;
  private canUpdateJobStatus = false;

  ngOnInit(): void {
    const state = history.state as { returnUrl?: string };
    if (state?.returnUrl) this.returnUrl = state.returnUrl;

    // Same privilege reading as the job list.
    this.employeeService.employeeData$.subscribe((data) => {
      this.isSuperAdmin = /^superadmin$/i.test(String(data?.category?.role ?? ''));
      this.canAllocateJobs = this.isSuperAdmin || data?.category?.privileges?.jobSheet?.allocateJobs || false;
      this.canUpdateJobStatus = this.isSuperAdmin || data?.category?.privileges?.jobSheet?.statusUpdate !== false;
    });

    this.load();
  }

  private load(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.router.navigateByUrl(this.returnUrl);
      return;
    }
    this.loading = true;
    this.jobService.getOneJob(id).subscribe({
      next: (res) => {
        const job: any = Array.isArray(res) ? res[0] : res;
        this.loading = false;
        if (!job) return;
        this.job = job;
        this.quote = {
          ...job.quotation,
          client: job.clientDetails ?? job.quotation?.client,
          createdBy: job.salesPersonDetails?.[0] ?? job.quotation?.createdBy,
          department: job.departmentDetails?.[0] ?? job.quotation?.department,
          attention: job.attention ?? job.quotation?.attention,
        };
        this.rebuildView();
        if (this.panelTab === 'workflow') this.loadWorkflow(true);
        // Same job audit log as the job list's History tab.
        this.auditLog.getHistory('job', job._id).subscribe({
          next: (entries) => (this.historyEntries = toTimelineEntries(entries)),
          error: () => (this.historyEntries = []),
        });
      },
      error: () => {
        this.loading = false;
        this.toast.error('Could not load the job sheet. Please try again.');
      },
    });
  }

  selectTab(tab: PanelTab): void {
    this.panelTab = tab;
    if (tab === 'workflow') this.loadWorkflow();
  }

  private loadWorkflow(force = false): void {
    if (!this.job || (!force && (this.workflowStatus === 'loading' || this.workflowStatus === 'ready'))) return;
    this.workflowStatus = 'loading';
    this.jobHistoryService.getJobHistory(this.job._id).subscribe({
      next: (res) => {
        this.workflow = res.success
          ? [...(res.data?.timeline ?? [])].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
          : [];
        this.workflowStatus = res.success ? 'ready' : 'error';
      },
      error: () => (this.workflowStatus = 'error'),
    });
  }

  // ---- header ---------------------------------------------------------------------------

  get companyName(): string {
    return this.quote?.client?.companyName || '';
  }

  get salesPersonName(): string {
    const p = this.quote?.createdBy;
    return p && typeof p === 'object' ? `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim() : '';
  }

  /** Same rules as the job list's row actions. */
  get canChangeStatus(): boolean {
    return !!this.job && this.canUpdateJobStatus && this.job.status !== JobStatus.completed;
  }

  get canAllocate(): boolean {
    return !!this.job && this.canAllocateJobs && this.job.allocateStatus === allocateStatus.Pending;
  }

  get canMarkLost(): boolean {
    return !!this.job && this.canAllocateJobs && this.job.allocateStatus !== allocateStatus.Completed && this.job.allocateStatus !== allocateStatus.Lost;
  }

  onUpdateStatus(): void {
    const job = this.job;
    if (!job || !this.canChangeStatus) return;
    this.matDialog.open<StatusChangeModalComponent, any, StatusChangeResult<JobStatus> | null>(StatusChangeModalComponent, {
      width: '480px',
      data: {
        currentStatus: job.status,
        statuses: JOB_STATUSES,
        formatStatus: jobStatusLabel,
        requireReasonFor: [JobStatus.onHold],
        reasonLabels: { [JobStatus.onHold]: { label: 'Reason for holding', placeholder: 'Why is this job being put on hold?' } },
        warnings: {
          [JobStatus.completed]: 'The job moves to the Completed tab.',
          [JobStatus.onHold]: 'The job moves to the On Hold tab. Saving purchase requests will not resume it.',
        },
        title: `Update status — ${job.jobId}`,
        subtitle: 'Choose where this job stands now.',
      },
    }).afterClosed().subscribe((result) => {
      if (!result) return;
      this.jobService.updateJobStatus(job._id, result.status, result.reason).subscribe({
        next: () => {
          this.toast.success('Job status updated');
          this.load();
        },
        error: (err) => this.toast.error(err?.error?.message || 'Failed to update job status'),
      });
    });
  }

  onAllocate(): void {
    const job = this.job;
    if (!job || !this.canAllocate) return;
    this.modal.open<AllocateTypeResult>(AllocateTypeModalComponent, { width: '520px', data: job }).afterClosed().subscribe((result) => {
      if (!result) return;
      this.jobService.updateAllocateType(result).subscribe({
        next: (res) => {
          if (res.success) {
            this.toast.success('Job Allocated successfully');
            this.load();
          }
        },
        error: (err) => this.toast.error(err?.error?.message || 'Failed to allocate job'),
      });
    });
  }

  onMarkLost(): void {
    const job = this.job;
    if (!job || !this.canMarkLost) return;
    this.modal.open<string>(MarkLostModalComponent, { width: '520px', data: job }).afterClosed().subscribe((reason) => {
      if (!reason) return;
      this.jobService.markJobLost({ id: job._id, reason }).subscribe({
        next: (res) => {
          this.toast.success(res?.message || 'Job marked lost');
          this.load();
        },
        error: (err) => this.toast.error(err?.error?.message || 'Failed to mark job as lost'),
      });
    });
  }

  // ---- body -----------------------------------------------------------------------------

  private rebuildView(): void {
    const q = this.quote;
    const d = q?.dealData ?? {};
    const currency = q?.currency ? ` ${q.currency}` : '';
    const price = dealSheetPriceDetails(d.updatedItems, d.additionalCosts, d.totalDiscount);
    const customerDiscount = (d.additionalCosts ?? [])
      .filter((c: any) => c.type === 'Customer Discount')
      .reduce((sum: number, c: any) => sum + (Number(c.value) || 0), 0);
    const quoteDiscount = Number(d.totalDiscount) || 0;
    const discount = quoteDiscount + customerDiscount;
    this.stats = [
      { label: `Total Cost${currency}`, value: this.formatNumber(price.totalCost) },
      { label: `Subtotal${currency}`, value: this.formatNumber(price.totalSellingPrice + discount) },
      { label: `Profit${currency}`, value: this.formatNumber(price.profit) },
      { label: 'Profit %', value: `${(price.perc || 0).toFixed(2)}%` },
      { label: `Quotation Discount${currency}`, value: this.formatNumber(quoteDiscount) },
      ...(customerDiscount ? [{ label: `Customer Discount${currency}`, value: this.formatNumber(customerDiscount) }] : []),
      { label: `Total Discount${currency}`, value: this.formatNumber(discount) },
      { label: `Net Deal Value${currency}`, value: this.formatNumber(price.totalSellingPrice) },
    ];
    this.itemFootRows = [
      { label: 'Total', emphasis: true, cells: { totalSellingPrice: { value: price.totalSellingPrice, format: 'currency' }, totalCost: { value: price.totalCost, format: 'currency' } } },
    ];
    this.detailFacts = this.buildDetailFacts();
    this.detailItems = this.detailFacts.map((f) => ({ key: f.label, label: f.label, hiddenByDefault: f.label === 'Currency' || f.label === 'Department' }));
    this.itemRows = this.buildItemRows(selectedDealItems(d.updatedItems));
    this.costRows = (d.additionalCosts || []).map((cost: any) => ({
      type: cost.type || 'Cost',
      name: cost.type === 'Supplier Discount'
        ? cost.supplierDetails?.supplierName || cost.name || 'Supplier discount'
        : cost.name || cost.type || 'Additional cost',
      value: cost.value || 0,
    }));
    this.documents = this.buildDocuments();
  }

  private buildDetailFacts(): JobFact[] {
    const job: any = this.job;
    const q = this.quote ?? {};
    const d = q.dealData ?? {};
    const date = (v?: string | Date | null) => (v ? formatDate(v, 'dd MMM yyyy', 'en-US') : '');
    const jobTone = DETAIL_TONE[this.jobStatusTone(job.status)];
    const allocTone = DETAIL_TONE[this.allocateTone(job.allocateStatus)];
    const attention: any = q.attention;
    const contact = attention && typeof attention === 'object' ? [attention.firstName, attention.lastName].filter(Boolean).join(' ') : '';
    const procurement = job.procurementPerson && typeof job.procurementPerson === 'object'
      ? `${job.procurementPerson.firstName ?? ''} ${job.procurementPerson.lastName ?? ''}`.trim() : '';
    const facts: JobFact[] = [
      { label: 'Job Status', value: jobStatusLabel(job.status), state: { dot: jobTone.dot, text: jobTone.text } },
      { label: 'Allocate Status', value: ALLOCATE_STATUS_LABELS[job.allocateStatus] ?? job.allocateStatus ?? '', state: { dot: allocTone.dot, text: allocTone.text } },
      { label: 'Allocate Type', value: job.allocateType || '' },
      { label: 'Deal ID', value: d.dealId || '', link: q._id ? ['/deal-sheet/view', q._id] : undefined },
      { label: 'Quote ID', value: q.quoteId || '', link: q._id ? ['/quotations/view', q._id] : undefined },
      { label: 'Customer ID', value: q.client?.clientRef || '', link: q.client?.clientRef ? ['/customers'] : undefined, queryParams: { search: q.client?.companyName } },
      { label: 'Company', value: q.client?.companyName || '' },
      { label: 'Contact', value: contact },
      { label: 'Email', value: attention?.email || q.client?.customerEmailId || '' },
      { label: 'Phone', value: attention?.phoneNo || (q.client?.contactNo ? String(q.client.contactNo) : '') },
      { label: 'Description', value: q.subject || '' },
      { label: 'Procurement Person', value: procurement },
      { label: 'LPO Value', value: `${this.formatNumber(job.lpoValue ?? 0)} QAR` },
      { label: 'Department', value: q.department?.departmentName || '' },
      { label: 'Currency', value: q.currency || '' },
      { label: 'Created', value: date(job.createdDate) },
      { label: 'Last Updated', value: date(job.updatedDate) },
      { label: 'Payment terms', value: d.paymentTerms || '' },
      { label: 'Comment', value: job.comment || '' },
    ];
    return facts.filter((f) => !!f.value);
  }

  private buildItemRows(items: any[]): Record<string, any>[] {
    const rows: Record<string, any>[] = [];
    items.forEach((item: any) => {
      const selected = (item?.itemDetails || []).filter((detail: QuoteItemDetail) => detail.dealSelected);
      if (!selected.length) return;
      rows.push({ _group: true, label: item.itemName });
      selected.forEach((detail: any) => {
        rows.push({
          detail: detail.detail,
          detailText: detail.detail,
          itemCode: detail.itemCode || '—',
          partNo: detail.partNo || '—',
          quantity: detail.quantity,
          unitSellingPrice: detail.unitSellingPrice,
          totalSellingPrice: detail.unitSellingPrice * detail.quantity,
          unitCost: detail.unitCost,
          totalCost: detail.quantity * detail.unitCost,
          supplier: detail.supplierName || detail.supplierDetails?.supplierName || '-',
        });
      });
    });
    return rows;
  }

  private buildDocuments(): DetailDocument[] {
    this.docFiles.clear();
    return (this.quote?.lpoFiles || []).map((file: any) => {
      const name = file.originalname || file.fileName || 'Document';
      const id = `LPO:${file.fileName}`;
      this.docFiles.set(id, file);
      return { id, name, uploadedBy: 'LPO', kind: (name.split('.').pop() || 'FILE').toUpperCase().slice(0, 4) };
    });
  }

  onDocumentOpen(doc: DetailDocument): void {
    const file = this.docFiles.get(doc.id);
    if (!file) return;
    if (!file.fileName?.toLowerCase().endsWith('.pdf')) {
      window.open(`${environment.api}/file/${encodeURIComponent(file.fileName)}`, '_blank');
      return;
    }
    this.jobService.downloadFile(file.fileName).subscribe({
      next: (event) => {
        if (event.type === HttpEventType.Response) {
          const url = URL.createObjectURL(new Blob([event.body], { type: 'application/pdf' }));
          window.open(url, '_blank');
          setTimeout(() => URL.revokeObjectURL(url), 10000);
        }
      },
      error: (error) => {
        if (error.status === 404) this.toast.warning('Sorry, the requested file was not found on the server.');
        else this.toast.error('An error occurred while trying to view the file.');
      },
    });
  }

  onDocumentDownload(doc: DetailDocument): void {
    const file = this.docFiles.get(doc.id);
    if (!file) return;
    this.jobService.downloadFile(file.fileName).subscribe({
      next: (event) => {
        if (event.type === HttpEventType.Response) saveAs(new Blob([event.body]), file.originalname);
      },
      error: (error) => {
        if (error.status === 404) this.toast.warning('Sorry, the requested file was not found on the server.');
        else this.toast.error('An error occurred while downloading the file.');
      },
    });
  }

  // ---- tones ----------------------------------------------------------------------------

  private jobStatusTone(status?: string): DetailTone {
    if (status === JobStatus.completed || status === JobStatus.invoiced || status === JobStatus.Delivered) return 'good';
    if (status === JobStatus.cancelled) return 'bad';
    if (status === JobStatus.onHold || status === JobStatus.partiallyDelivered || status === JobStatus.partiallyInvoiced) return 'warn';
    return 'neutral';
  }

  private allocateTone(status?: string): DetailTone {
    if (status === allocateStatus.Completed) return 'good';
    if (status === allocateStatus.Lost) return 'bad';
    if (status === allocateStatus.Pending || status === allocateStatus.OnHold) return 'warn';
    return 'neutral';
  }

  eventTone(event: TimelineEvent): string {
    switch (event.status) {
      case 'success': return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900';
      case 'error': return 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900';
      case 'warning': return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900';
      default: return 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-900';
    }
  }

  eventPerformedBy(event: TimelineEvent): string {
    const p: any = event.performedBy;
    return p ? `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim() : '';
  }

  private formatNumber(value: number): string {
    return new NumberFormatterPipe().transform(value || 0);
  }
}
