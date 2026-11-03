import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, formatDate } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpEventType } from '@angular/common/http';
import { MatDialog } from '@angular/material/dialog';
import { ToastrService } from 'ngx-toastr';
import saveAs from 'file-saver';

import { JobService } from 'src/app/core/services/job/job.service';
import { QuotationService } from 'src/app/core/services/quotation/quotation.service';
import { DomSanitizer } from '@angular/platform-browser';
import { ParseBoldTextPipe } from 'src/app/shared/pipes/boldParse.pipe';
import { ParseBracketsTextPipe } from 'src/app/shared/pipes/highlightParse.pipe';
import { JobHistoryService, StageKey, StageLine } from 'src/app/core/services/job/job-history.service';
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

/** One row of the Pricing tab. */
interface PricingLine {
  label: string;
  note?: string;
  value: string;
  /** Rows that reduce the total are tinted orange, rows that add to it green. */
  tone?: 'add' | 'reduce';
  emphasis?: boolean;
  divider?: boolean;
}

type PanelTab = 'costs' | 'documents' | StageKey | 'workflow' | 'history';

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
  private quoteService = inject(QuotationService);
  private boldPipe = new ParseBoldTextPipe();
  private bracketsPipe = new ParseBracketsTextPipe(inject(DomSanitizer));

  loading = true;
  job: getJob | null = null;
  /** The job's quotation with client, owner and department filled in from the job lookup. */
  quote: any = null;
  returnUrl = '/job-sheet';
  get returnPath(): string { return this.returnUrl.split('?')[0]; }

  panelOpen = true;
  panelTab: PanelTab = 'costs';
  readonly panelTabs: { id: PanelTab; label: string }[] = [
    { id: 'costs', label: 'Pricing' },
    { id: 'documents', label: 'Documents' },
    { id: 'workflow', label: 'Workflow' },
    { id: 'pr', label: 'PR' },
    { id: 'po', label: 'PO' },
    { id: 'grn', label: 'GRN' },
    { id: 'dn', label: 'DN' },
    { id: 'invoice', label: 'Invoice' },
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
  pricingLines: PricingLine[] = [];
  documents: DetailDocument[] = [];
  private docFiles = new Map<string, any>();

  workflow: TimelineEvent[] = [];
  workflowStatus: 'idle' | 'loading' | 'ready' | 'error' = 'idle';

  stages: Record<StageKey, StageLine[]> = { pr: [], po: [], grn: [], dn: [], invoice: [] };
  stageRows: Record<StageKey, Record<string, any>[]> = { pr: [], po: [], grn: [], dn: [], invoice: [] };
  private readonly stageColumnCache: Partial<Record<StageKey, DetailTableColumn[]>> = {};
  stageColumns(tab: StageKey): DetailTableColumn[] {
    return (this.stageColumnCache[tab] ??= this.makeStageColumns(tab));
  }
  private makeStageColumns(tab: StageKey): DetailTableColumn[] {
    const dateCol: DetailTableColumn = { key: 'date', label: 'Date', type: 'date' };
    // PR lines are grouped under their supplier, so the supplier column and the received-qty columns give way to PO qty.
    if (tab === 'pr') return [
      { key: 'docNo', label: 'PR No', type: 'text', width: '1%' },
      { key: 'description', label: 'Item Description', type: 'text', truncate: true, hoverOnly: true, width: '100%' },
      { key: 'totalQty', label: 'Total Qty', type: 'number', align: 'right' },
      { key: 'poQty', label: 'PO Qty', type: 'number', align: 'right' },
      { key: 'margin', label: 'Margin %', type: 'text', align: 'right' },
      { key: 'value', label: 'Cost', type: 'currency', align: 'right', total: true },
      { key: 'party', label: 'Supplier', type: 'text' },
      { key: 'status', label: 'Status', type: 'badge' },
      dateCol,
    ];
    if (tab === 'po') return [
      { key: 'docNo', label: 'PO No', type: 'text', width: '1%' },
      { key: 'description', label: 'Item Description', type: 'text', truncate: true, hoverOnly: true, width: '100%' },
      { key: 'totalQty', label: 'Total Qty', type: 'number', align: 'right' },
      { key: 'approvedQty', label: 'Approved', type: 'number', align: 'right' },
      { key: 'rejectedQty', label: 'Rejected', type: 'number', align: 'right' },
      { key: 'value', label: 'Cost', type: 'currency', align: 'right', total: true },
      { key: 'party', label: 'Supplier', type: 'text' },
      { key: 'status', label: 'Status', type: 'badge' },
      dateCol,
    ];
    if (tab === 'grn') return [
      { key: 'docNo', label: 'GRN No', type: 'text', width: '1%' },
      { key: 'description', label: 'Item Description', type: 'text', truncate: true, hoverOnly: true, width: '100%' },
      { key: 'totalQty', label: 'Qty', type: 'number', align: 'right' },
      { key: 'value', label: 'Cost', type: 'currency', align: 'right', total: true },
      { key: 'status', label: 'Status', type: 'badge' },
      dateCol,
    ];
    if (tab === 'dn') return [
      { key: 'docNo', label: 'DN No', type: 'text', width: '1%' },
      { key: 'description', label: 'Item Description', type: 'text', truncate: true, hoverOnly: true, width: '100%' },
      { key: 'totalQty', label: 'Qty', type: 'number', align: 'right' },
      { key: 'rejectedQty', label: 'Rejected', type: 'number', align: 'right' },
      { key: 'value', label: 'Cost', type: 'currency', align: 'right', total: true },
      { key: 'status', label: 'Status', type: 'badge' },
      dateCol,
    ];
    if (tab === 'invoice') return [
      { key: 'docNo', label: 'INVOICE No', type: 'text', width: '1%' },
      { key: 'description', label: 'Item Description', type: 'text', truncate: true, hoverOnly: true, width: '100%' },
      { key: 'totalQty', label: 'Qty', type: 'number', align: 'right' },
      { key: 'value', label: 'Cost', type: 'currency', align: 'right', total: true },
      { key: 'status', label: 'Status', type: 'badge' },
      dateCol,
    ];
    return [
      { key: 'docNo', label: `${String(tab).toUpperCase()} No`, type: 'text', width: '1%' },
      { key: 'description', label: 'Item Description', type: 'text', truncate: true, width: '100%' },
      { key: 'totalQty', label: 'Total Qty', type: 'number', align: 'right' },
      { key: 'acceptedQty', label: 'Accepted Qty', type: 'number', align: 'right' },
      { key: 'rejectedQty', label: 'Rejected Qty', type: 'number', align: 'right' },
      { key: 'value', label: 'Value', type: 'currency', align: 'right', total: true },
      { key: 'party', label: tab === 'dn' || tab === 'invoice' ? 'Customer' : 'Supplier', type: 'text' },
      { key: 'status', label: 'Status', type: 'badge' },
    ];
  }
  stageFoot: Record<StageKey, DetailFootRow[]> = { pr: [], po: [], grn: [], dn: [], invoice: [] };
  private buildStageRows(): Record<StageKey, Record<string, any>[]> {
    const out = { pr: [], po: [], grn: [], dn: [], invoice: [] } as Record<StageKey, Record<string, any>[]>;
    (Object.keys(out) as StageKey[]).forEach((k) => {
      out[k] = (this.stages[k] ?? []).map((l) => ({ ...l, _link: l.docId ? this.stageLink(k, l) : null, acceptedQty: l.acceptedQty ?? '-', rejectedQty: l.rejectedQty ?? '-', description: l.description || '-', party: l.party || '-', status: l.status || '-' }));
    });
    // PR: follow the job's item order; an item split across suppliers becomes a parent row (summed) with one sub row per supplier.
    const norm = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
    const order = new Map<string, number>();
    const itemByKey = new Map<string, Record<string, any>>();
    this.itemRows.forEach((r, i) => { if (!r['_group'] && !r['_sub']) { const k = norm(r['detailText']); if (!order.has(k)) { order.set(k, i); itemByKey.set(k, r); } } });
    // Selling price of a PR row = the job item's selling total, prorated by the row's share of the item qty.
    const sellOf = (r: Record<string, any>): number => {
      const it = itemByKey.get(norm(r['description']));
      const qty = Number(it?.['quantity']) || 0;
      return it && qty > 0 ? (Number(it['totalSellingPrice']) || 0) * ((Number(r['totalQty']) || 0) / qty) : 0;
    };
    const marginOf = (sell: number, cost: number) => (sell > 0 ? `${(((sell - cost) / sell) * 100).toFixed(2)}%` : '-');
    let totalSell = 0;
    const lines = new Map<string, Record<string, any>[]>();
    out.pr.forEach((r) => { const k = String(r['lineKey'] ?? Math.random()); (lines.get(k) ?? lines.set(k, []).get(k)!).push(r); });
    const sorted = [...lines.values()]
      .map((g, i) => ({ g, i, o: order.get(norm(g[0]['description'])) ?? Number.MAX_SAFE_INTEGER }))
      .sort((a, b) => a.o - b.o || a.i - b.i);
    const prRows: Record<string, any>[] = [];
    let total = 0;
    for (const { g } of sorted) {
      total += g.reduce((s, r) => s + (Number(r['value']) || 0), 0);
      g.forEach((r) => { r['_sell'] = sellOf(r); r['margin'] = marginOf(r['_sell'], Number(r['value']) || 0); });
      const gSell = g.reduce((s, r) => s + r['_sell'], 0);
      totalSell += gSell;
      if (g.length === 1) { prRows.push(g[0]); continue; }
      prRows.push({
        ...g[0], _link: null,
        totalQty: g.reduce((s, r) => s + (Number(r['totalQty']) || 0), 0),
        poQty: g.reduce((s, r) => s + (Number(r['poQty']) || 0), 0),
        value: g.reduce((s, r) => s + (Number(r['value']) || 0), 0),
        party: `${g.length} suppliers`,
        margin: marginOf(gSell, g.reduce((s, r) => s + (Number(r['value']) || 0), 0)),
      });
      g.forEach((r) => prRows.push({ ...r, _sub: true, docNo: r['docNo'], description: '' }));
    }
    out.pr = prRows;
    this.stageFoot.pr = [{ label: 'Total', emphasis: true, cells: { margin: { value: marginOf(totalSell, total), format: 'text' }, value: { value: total, format: 'currency' } } }];

    // PO: same item order as the PR; an item bought from several suppliers becomes a parent row (summed) with one sub row per supplier.
    const poLines = new Map<string, Record<string, any>[]>();
    out.po.forEach((r) => { const k = norm(r['description']); (poLines.get(k) ?? poLines.set(k, []).get(k)!).push(r); });
    const poSorted = [...poLines.entries()]
      .map(([k, g], i) => ({ g, i, o: order.get(k) ?? Number.MAX_SAFE_INTEGER }))
      .sort((a, b) => a.o - b.o || a.i - b.i);
    const sumOf = (g: Record<string, any>[], f: string) => g.reduce((s, r) => s + (Number(r[f]) || 0), 0);
    const poRows: Record<string, any>[] = [];
    for (const { g } of poSorted) {
      if (new Set(g.map((r) => r['party'])).size < 2) { poRows.push(...g); continue; }
      poRows.push({ ...g[0], _link: null, docNo: '', totalQty: sumOf(g, 'totalQty'), approvedQty: sumOf(g, 'approvedQty'), rejectedQty: sumOf(g, 'rejectedQty'), value: sumOf(g, 'value'), party: `${new Set(g.map((r) => r['party'])).size} suppliers`, status: '-' });
      g.forEach((r) => poRows.push({ ...r, _sub: true, description: '' }));
    }
    out.po = poRows;
    const poLeaf = poRows.filter((r) => !r['_sub']);
    this.stageFoot.po = [{ label: 'Total', emphasis: true, cells: {
      value: { value: sumOf(poLeaf, 'value'), format: 'currency' },
    } }];
    (['grn', 'dn', 'invoice'] as StageKey[]).forEach((k) => {
      this.stageFoot[k] = [{ label: 'Total', emphasis: true, cells: {
        value: { value: sumOf(out[k], 'value'), format: 'currency' },
      } }];
    });
    return out;
  }
  stagesStatus: 'idle' | 'loading' | 'ready' | 'error' = 'idle';
  private readonly stageRoutes: Record<StageKey, string> = {
    pr: '/purchase/view-purchase', po: '/purchase-order/view-lpo', grn: '/grn/view-grn', dn: '/dispatch/view',
    invoice: '/finance/vendor-bills',
  };

  private readonly allItemColumns: DetailTableColumn[] = [
    { key: 'itemCode', label: 'Item Code', hiddenByDefault: true },
    { key: 'detail', label: 'Item Details', type: 'html', truncate: true, tooltipKey: 'detailText' },
    { key: 'partNo', label: 'Part No', hiddenByDefault: true },
    { key: 'image', label: 'Image', type: 'image', imagePreview: true, align: 'center', width: '5rem' },
    { key: 'quantity', label: 'Qty', type: 'number', align: 'center' },
    { key: 'uom', label: 'UOM', align: 'center', hiddenByDefault: true },
    { key: 'margin', label: 'Margin', type: 'text', align: 'right' },
    { key: 'marginValue', label: 'Margin Value', type: 'currency', align: 'right', total: true, hiddenByDefault: true },
    { key: 'unitCost', label: 'Unit Cost', type: 'currency', align: 'right' },
    { key: 'totalCost', label: 'Total Cost', type: 'currency', align: 'right', total: true },
    { key: 'unitSellingPrice', label: 'Unit Selling Price', type: 'currency', align: 'right' },
    { key: 'totalSellingPrice', label: 'Total Selling Price', type: 'currency', align: 'right', total: true },
    { key: 'supplier', label: 'Supplier', type: 'text' },
    { key: 'availability', label: 'Availability', type: 'text', hiddenByDefault: true },
  ];
  itemColumns: DetailTableColumn[] = this.allItemColumns;

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
        if (this.isStageTab(this.panelTab)) this.loadStages(true);
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
    if (this.isStageTab(tab)) this.loadStages();
  }

  isStageTab(tab: PanelTab): tab is StageKey {
    return tab === 'pr' || tab === 'po' || tab === 'grn' || tab === 'dn' || tab === 'invoice';
  }

  /** One request fills all four stage tabs. */
  private loadStages(force = false): void {
    if (!this.job || (!force && (this.stagesStatus === 'loading' || this.stagesStatus === 'ready'))) return;
    this.stagesStatus = 'loading';
    this.jobHistoryService.getJobProcurement(this.job._id).subscribe({
      next: (res) => {
        this.stages = res.success ? { ...({ pr: [], po: [], grn: [], dn: [], invoice: [] } as Record<StageKey, StageLine[]>), ...res.data } : this.stages;
        this.stagesStatus = res.success ? 'ready' : 'error';
        this.stageRows = this.buildStageRows();
      },
      error: () => (this.stagesStatus = 'error'),
    });
  }

  stageLink(tab: StageKey, line: StageLine): any[] {
    return [this.stageRoutes[tab], line.docId];
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
    const price = dealSheetPriceDetails(d.updatedItems, d.additionalCosts, d.totalDiscount);
    const customerDiscount = (d.additionalCosts ?? [])
      .filter((c: any) => c.type === 'Customer Discount')
      .reduce((sum: number, c: any) => sum + (Number(c.value) || 0), 0);
    const quoteDiscount = Number(d.totalDiscount) || 0;
    const discount = quoteDiscount + customerDiscount;
    const sumOf = (type: string) => (d.additionalCosts ?? [])
      .filter((c: any) => c.type === type)
      .reduce((sum: number, c: any) => sum + (Number(c.value) || 0), 0);
    this.stats = [
      { label: `Total Price`, value: this.formatNumber(price.totalSellingPrice + discount) },
      { label: `Discount`, value: this.formatNumber(discount) },
      { label: `Net Total Price`, value: this.formatNumber(price.totalSellingPrice) },
      { label: 'Margin %', value: `${(price.perc || 0).toFixed(2)}%` },
      { label: `Margin`, value: this.formatNumber(price.profit) },
      { label: `Total Additional Cost`, value: this.formatNumber(sumOf('Additional Cost')) },
      { label: `Total Supplier Discount`, value: this.formatNumber(sumOf('Supplier Discount')) },
      { label: `Total Cost`, value: this.formatNumber(price.totalCost) },
    ];
    // Only the listed lines: deal-level additional costs and discounts belong to the Costs tab, not this table.
    let itemSell = 0;
    let itemCost = 0;
    for (const item of selectedDealItems(d.updatedItems) ?? []) {
      for (const detail of (item as any)?.itemDetails ?? []) {
        if (!detail.dealSelected) continue;
        itemSell += (Number(detail.unitSellingPrice) || 0) * (Number(detail.quantity) || 0);
        itemCost += (Number(detail.unitCost) || 0) * (Number(detail.quantity) || 0);
      }
    }
    this.itemFootRows = [
      { label: 'Total', emphasis: true, cells: {
        totalSellingPrice: { value: itemSell, format: 'currency' },
        totalCost: { value: itemCost, format: 'currency' },
        ...this.footMarginCells(itemSell, itemCost),
      } },
      { label: 'Discount', cells: { totalSellingPrice: { value: discount, format: 'currency' } } },
      { label: 'Net Total', emphasis: true, cells: { totalSellingPrice: { value: Math.max(itemSell - discount, 0), format: 'currency' } } },
    ];
    this.detailFacts = this.buildDetailFacts();
    this.detailItems = this.detailFacts.map((f) => ({ key: f.label, label: f.label, hiddenByDefault: f.label === 'Currency' || f.label === 'Department' }));
    this.itemRows = this.buildItemRows(selectedDealItems(d.updatedItems));
    this.buildCostBreakdown(d, price);
    const hasImage = this.itemRows.some((r) => !r['_group'] && r['image']);
    this.itemColumns = this.allItemColumns.filter((c) => c.key !== 'image' || hasImage);
    this.documents = this.buildDocuments();
  }

  /** Pricing tab: price, discount, net total, margin, then each additional cost and the resulting total cost. */
  private buildCostBreakdown(d: any, price: { totalCost: number; totalSellingPrice: number; profit: number; perc: number }): void {
    const quoteDiscount = Number(d.totalDiscount) || 0;
    const customerDiscount = (d.additionalCosts ?? [])
      .filter((c: any) => c.type === 'Customer Discount')
      .reduce((sum: number, c: any) => sum + (Number(c.value) || 0), 0);
    const discount = quoteDiscount + customerDiscount;
    const money = (n: number) => this.formatNumber(n);
    const lines: PricingLine[] = [
      { label: 'Total price', value: money(price.totalSellingPrice + discount) },
      { label: 'Discount', value: discount ? `− ${money(discount)}` : money(0), tone: discount ? 'reduce' : undefined },
      { label: 'Net total', value: money(price.totalSellingPrice), emphasis: true, divider: true },
      { label: 'Margin %', value: `${(price.perc || 0).toFixed(2)}%` },
      { label: 'Margin', value: money(price.profit) },
    ];
    let hasExtra = false;
    for (const c of d.additionalCosts ?? []) {
      const value = Number(c.value) || 0;
      if (!value) continue;
      if (c.type === 'Additional Cost') {
        lines.push({ label: c.name || 'Additional cost', note: 'Additional cost', value: `+ ${money(value)}`, tone: 'add', divider: !hasExtra });
        hasExtra = true;
      } else if (c.type === 'Supplier Discount') {
        lines.push({ label: c.supplierDetails?.supplierName || c.name || 'Supplier', note: 'Supplier discount', value: `− ${money(value)}`, tone: 'reduce', divider: !hasExtra });
        hasExtra = true;
      }
    }
    lines.push({ label: 'Total cost', value: money(price.totalCost), emphasis: true, divider: true });
    this.pricingLines = lines;
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
      { label: 'Customer ID', value: q.client?.clientRef || '' },
      { label: 'Company', value: q.client?.companyName || '' },
      { label: 'Contact', value: contact },
      { label: 'Email', value: attention?.email || q.client?.customerEmailId || '' },
      { label: 'Phone', value: attention?.phoneNo || (q.client?.contactNo ? String(q.client.contactNo) : '') },
      { label: 'Subject', value: q.subject || '' },
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

  /** Margin of one line (or the whole table) against its selling price, as the deal sheet view shows it. */
  private lineMarginCells(sell: number, cost: number): { marginValue: number; margin: string } {
    return { marginValue: sell - cost, margin: sell > 0 ? `${(((sell - cost) / sell) * 100).toFixed(2)}%` : '-' };
  }

  private footMarginCells(sell: number, cost: number): Record<string, { value: number | string; format: 'currency' | 'text' }> {
    const m = this.lineMarginCells(sell, cost);
    return { marginValue: { value: m.marginValue, format: 'currency' }, margin: { value: m.margin, format: 'text' } };
  }

  private buildItemRows(items: any[]): Record<string, any>[] {
    const rows: Record<string, any>[] = [];
    items.forEach((item: any) => {
      const selected = (item?.itemDetails || []).filter((detail: QuoteItemDetail) => detail.dealSelected);
      if (!selected.length) return;
      rows.push({ _group: true, label: item.itemName });
      selected.forEach((detail: any) => {
        rows.push({
          image: detail.image?.fileName ? this.quoteService.itemImageUrl(detail.image.fileName) : '',
          imageAlt: detail.image?.originalname || 'Item image',
          detail: (this.boldPipe.transform(this.bracketsPipe.transform(detail.detail) as string) as string) + this.componentsNote(detail),
          detailText: detail.detail,
          uom: detail.uom || '—',
          availability: detail.availability || '—',
          itemCode: detail.itemCode || '—',
          partNo: detail.partNo || '—',
          quantity: detail.quantity,
          unitSellingPrice: detail.unitSellingPrice,
          totalSellingPrice: detail.unitSellingPrice * detail.quantity,
          unitCost: detail.unitCost,
          totalCost: detail.quantity * detail.unitCost,
          ...this.lineMarginCells(detail.unitSellingPrice * detail.quantity, detail.quantity * detail.unitCost),
          supplier: detail.supplierName || detail.supplierDetails?.supplierName || '-',
        });
        // Parts of a split line follow it as sub rows; the line's own cost already covers them.
        (detail.components ?? []).forEach((c: any) => {
          const qty = (Number(c.quantity) || 0) * (Number(detail.quantity) || 0);
          rows.push({
            _sub: true,
            detail: this.boldPipe.transform(this.bracketsPipe.transform(c.description || '') as string),
            detailText: c.description,
            itemCode: c.itemCode || '—',
            partNo: c.partNo || '—',
            uom: c.uom || '—',
            quantity: qty,
            unitCost: c.unitCost,
            totalCost: qty * (Number(c.unitCost) || 0),
            supplier: c.supplierId?.supplierName || c.supplierName || '-',
          });
        });
      });
    });
    return rows;
  }

  /** The parts the deal split this line into, for the project and procurement teams. Their cost is already inside the line's. */
  private componentsNote(detail: any): string {
    const parts: any[] = detail.components ?? [];
    if (!parts.length) return '';
    const esc = (s: string) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));
    const list = parts.map((p) => `${esc(p.description)} × ${Number(p.quantity) * Number(detail.quantity)}`).join(' · ');
    return `<div style="margin-top:4px;font-size:12px;opacity:.7">Includes: ${list}</div>`;
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

  eventTone(_event: TimelineEvent): string {
    return 'border-gray-200 bg-white text-gray-900 dark:border-erp-border-dark dark:bg-transparent dark:text-gray-100';
  }

  eventPerformedBy(event: TimelineEvent): string {
    const p: any = event.performedBy;
    return p ? `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim() : '';
  }

  private formatNumber(value: number): string {
    return new NumberFormatterPipe().transform(value || 0);
  }
}
