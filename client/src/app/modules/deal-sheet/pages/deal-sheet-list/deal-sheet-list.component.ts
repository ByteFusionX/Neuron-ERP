import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import {
  DatePipe,
  AsyncPipe,
  NgClass,
  NgIf,
  NgSwitch,
  NgSwitchCase,
} from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpEventType } from '@angular/common/http';
import { inject } from '@angular/core';
import saveAs from 'file-saver';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Observable, Subscription, map, take, catchError, of, filter, switchMap } from 'rxjs';

import { QuotationService } from 'src/app/core/services/quotation/quotation.service';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { CustomerService } from 'src/app/core/services/customer/customer.service';
import { ProfileService } from 'src/app/core/services/profile/profile.service';
import { JobService } from 'src/app/core/services/job/job.service';
import {
  getDealSheet,
  Quotatation,
} from 'src/app/shared/interfaces/quotation.interface';
import { NumberFormatterPipe } from 'src/app/shared/pipes/numFormatter.pipe';

import { DataGridComponent } from 'src/app/shared/components/data-grid/data-grid.component';
import {
  DataGridColumn,
  DataGridFooterTotal,
  DataGridDetailTab,
  DataGridFilter,
  DataGridQuery,
  DataGridRowAction,
  DataGridRowActionEvent,
  DataGridView,
} from 'src/app/shared/components/data-grid/data-grid.model';
import { DetailOverviewComponent } from 'src/app/shared/components/detail-panel/detail-overview.component';
import { DetailTableComponent } from 'src/app/shared/components/detail-panel/detail-table.component';
import { DetailDocumentsComponent } from 'src/app/shared/components/detail-panel/detail-documents.component';
import { QuoteNoteModalComponent, QuoteNoteModalResult } from 'src/app/modules/quotations/pages/quote-notes/quote-note-modal.component';
import { QuoteNotesPanelComponent } from 'src/app/modules/quotations/pages/quote-notes/quote-notes-panel.component';
import { DetailTimelineComponent } from 'src/app/shared/components/detail-panel/detail-timeline.component';
import { DetailCommentsComponent } from 'src/app/shared/components/detail-panel/detail-comments.component';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import {
  DetailOverviewField,
  DetailOverviewSection,
  DetailTableColumn,
  DetailFootRow,
  DetailDocument,
  DetailTimelineEntry,
  DetailComment,
} from 'src/app/shared/components/detail-panel/detail-panel.model';
import { AuditLogService } from 'src/app/core/services/audit-log.service';
import { toTimelineEntries } from 'src/app/shared/utils/audit-timeline.util';
import { ConfirmDialogService } from 'src/app/shared/components/confirm-dialog';
import { DealDecisionService, DEAL_STATUSES, canDecideDeal, describeDealWaiting } from '../../services/deal-decision.service';
import { canDoDealSheet, dealSheetPrivileges } from 'src/app/shared/utils/privilege-fallback';
import { describeApprovalGateError } from 'src/app/shared/utils/approval-gate-error.util';
import { dealSheetPriceDetails, selectedDealItems } from 'src/app/shared/utils/deal-pricing.util';
import { statusLabel } from 'src/app/shared/utils/text-format.util';
import { ModalService } from 'src/app/shared/components/modal';
import { DocumentUploadModalComponent, DocumentUploadModalResult } from 'src/app/shared/components/detail-panel/document-upload-modal/document-upload-modal.component';
import { ALLOWED_UPLOAD_TYPES } from 'src/app/shared/constants/upload-types';
import { ViewToggleComponent } from 'src/app/shared/components/view-toggle/view-toggle.component';
import { ResetWorkflowComponent, ResetWorkflowModalData } from 'src/app/modules/presales/pages/reset-workflow/reset-workflow.component';
import { WorkflowService } from 'src/app/core/services/workflow.service';
import { ApprovalStep, WorkflowFeature } from 'src/app/shared/interfaces/workflow.interface';
import { DealFormComponent, UpdateDealsheetData } from 'src/app/modules/quotations/pages/deal-form/deal-form.component';

import { filtersToParams, listFiltersToParams, listParamsToFilters, splitMultiValues, UrlFilterSpec } from 'src/app/shared/components/filter-bar/url-filters';

/** Deal grid filters the Report tab shares through the URL (same param names the report reads). */
const DEAL_URL_FILTERS: UrlFilterSpec[] = [
  { key: 'date', date: true },
  { key: 'dealStatus', param: 'status' },
  { key: 'salesPerson', param: 'salesPerson' },
  { key: 'customerName', param: 'customer' },
  { key: 'department', param: 'department' },
];

/** Matches the grid's default page size so the Rows selector is never blank. */
const DEFAULT_PAGE_SIZE = 15;

/**
 * Merged Pending/Approved deal sheet grid, replacing the two separate Material list pages with one
 * DataGridComponent instance and "Pending"/"Approved" view tabs — mirrors the quotation-list migration.
 * Approve/Reject reuse the generic StatusChangeModalComponent (status + note) instead of the bespoke
 * RejectDealComponent, and Revoke uses ConfirmDialogService instead of ConfirmationDialogComponent.
 */
import { FileService } from 'src/app/core/services/file.service';
@Component({
  selector: 'app-deal-sheet-list',
  templateUrl: './deal-sheet-list.component.html',
  styleUrls: ['./deal-sheet-list.component.css'],
  providers: [NumberFormatterPipe, DatePipe],
  imports: [
    ViewToggleComponent,
    DealFormComponent,
    NgIf,
    AsyncPipe,
    NgClass,
    NgSwitch,
    NgSwitchCase,
    DatePipe,
    FormsModule,
    DataGridComponent,
    DetailOverviewComponent,
    DetailTableComponent,
    DetailDocumentsComponent,
    DetailTimelineComponent,
    QuoteNotesPanelComponent,
    DetailCommentsComponent,
    ActionButtonComponent,
  ],
})
export class DealSheetListComponent implements OnInit, OnDestroy {
  private fileOpener = inject(FileService);
  @ViewChild('grid') grid!: DataGridComponent<Quotatation>;

  private confirm = inject(ConfirmDialogService);
  private _decision = inject(DealDecisionService);
  private modal = inject(ModalService);
  private _workflowService = inject(WorkflowService);
  private _customerService = inject(CustomerService);
  private _profileService = inject(ProfileService);
  /** Deal Sheet workflow stages a Super Admin can give another chance when resetting a deal. */
  private dealWorkflowSteps: ApprovalStep[] = [];

  isLoading = true;
  userId: string | undefined;
  isSuperAdmin = false;
  private canApprove = false;
  private canReject = false;
  private canRevoke = false;
  private canUpdate = false;
  private roleId: string | undefined;

  rows: Quotatation[] = [];
  total = 0;
  page = 1;
  row = DEFAULT_PAGE_SIZE;
  searchQuery = '';
  /** Column filters and sort from the grid toolbar; sent to the server with every page request. */
  gridFilters: Omit<DataGridFilter, 'id'>[] = [];
  sortKey: string | null = null;
  sortDir: 'asc' | 'desc' | null = null;
  searchCriteria: 'all' | 'dealId' | 'customer' | 'salesperson' = 'all';

  columns: DataGridColumn<Quotatation>[] = [];
  rowActions: DataGridRowAction<Quotatation>[] = [];
  views: DataGridView<Quotatation>[] = [
    { id: 'all', label: 'All' },
    { id: 'pending', label: 'Pending' },
    { id: 'approved', label: 'Approved' },
    { id: 'rejected', label: 'Rejected' },
    { id: 'revoked', label: 'Revoked' },
  ];
  activeViewId:
    | 'all'
    | 'pending'
    | 'approved'
    | 'rejected'
    | 'revoked'
    | 'revenue' = 'pending';

  detailLoading = false;
  detailTabs: DataGridDetailTab[] = [
    { id: 'overview', label: 'Details', icon: 'info' },
    { id: 'items', label: 'Items', icon: 'card' },
    { id: 'costs', label: 'Costs', icon: 'card' },
    { id: 'documents', label: 'Documents', icon: 'eye' },
    { id: 'notes', label: 'Notes', icon: 'chat' },
    { id: 'comments', label: 'Comments', icon: 'chat' },
    { id: 'history', label: 'History', icon: 'clock' },
  ];

  readonly itemColumns: DetailTableColumn[] = [
    { key: 'item', label: 'Item', type: 'html', truncate: true, tooltipKey: 'itemText' },
    { key: 'qty', label: 'Qty', type: 'number' },
    { key: 'price', label: 'Price', type: 'currency' },
    { key: 'sellingPrice', label: 'Selling Price', type: 'currency' },
    { key: 'amount', label: 'Amount', type: 'currency' },
  ];

  readonly costColumns: DetailTableColumn[] = [
    { key: 'type', label: 'Type', type: 'text' },
    { key: 'name', label: 'Name', type: 'text', wrap: true },
    { key: 'value', label: 'Value', type: 'currency', align: 'right', total: true },
  ];

  readonly dealStatusBadgeClasses: Record<string, string> = {
    pending:
      'bg-amber-50 text-amber-700 ring-amber-200 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900 dark:border-amber-900',
    approved:
      'bg-emerald-50 text-emerald-700 ring-emerald-200 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900 dark:border-emerald-900',
    rejected:
      'bg-red-50 text-red-700 ring-red-200 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900 dark:border-red-900',
  };

  rowAccent = (r: Quotatation): 'warning' | null =>
    r.dealData && !r.dealData.seenByApprover ? 'warning' : null;

  statusText = statusLabel;

  dealTitle = (r: Quotatation) => r.dealData?.dealId ?? '';
  dealSubtitle = (r: Quotatation) => r.client?.companyName ?? '';

  private subscriptions = new Subscription();
  private historyCache = new Map<string, BehaviorSubject<DetailTimelineEntry[]>>();

  constructor(
    private _quoteService: QuotationService,
    private _employeeService: EmployeeService,
    private _jobService: JobService,
    private _router: Router,
    private _route: ActivatedRoute,
    private _dialog: MatDialog,
    private toaster: ToastrService,
    private numberFormat: NumberFormatterPipe,
    private datePipe: DatePipe,
    private auditLog: AuditLogService,
  ) {}

  ngOnInit(): void {
    this.buildColumns();
    this.buildRowActions();
    this.loadSalesPersonOptions();

    this._route.data.subscribe((data) => {
      if (
        ['all', 'pending', 'approved', 'rejected', 'revoked'].includes(
          data['view'],
        )
      ) {
        const changed = this.activeViewId !== data['view'];
        this.activeViewId = data['view'];
        // The route data can land after the query params; a dashboard drill-down must stay on its Revenue tab.
        this.ensureRevenueView();
        if (this.grid) this.grid.activeViewId = this.activeViewId;
        // Same component is reused when the URL segment changes (sidebar link, back button).
        if (changed && this.grid) {
          this.page = 1;
          this.grid.page = 1;
          this.getDeals();
        }
      }
    });

    this._route.queryParams.subscribe((params) => {
      this.page = params['page'] ? parseInt(params['page'], 10) : 1;
      this.row = params['row'] ? parseInt(params['row'], 10) || DEFAULT_PAGE_SIZE : DEFAULT_PAGE_SIZE;
      this.searchQuery = params['search'] || '';
      this.searchCriteria = params['searchCriteria'] || 'all';
      this.wonFrom = params['wonFrom'] || null;
      this.wonTo = params['wonTo'] || null;
      this.wonPerson = params['person'] || null;
      // `customer` is the dashboard's revenue customer only on a dashboard drill-down; otherwise it is the report's customer filter.
      const fromDashboard = !!(this.wonFrom || this.wonTo || this.wonPerson);
      this.wonCustomer = fromDashboard ? params['customer'] || null : null;
      this.ensureRevenueView();
      this.uiFilters = listParamsToFilters(fromDashboard ? { ...params, customer: null } : params, DEAL_URL_FILTERS);
      this.gridFilters = splitMultiValues(this.uiFilters);
      this.sortKey = params['sortKey'] || null;
      this.sortDir = params['sortDir'] === 'asc' || params['sortDir'] === 'desc' ? params['sortDir'] : null;
      if (this.grid) {
        this.grid.page = this.page;
        this.grid.pageSize = this.row;
        this.grid.setQueryState(this.searchQuery, this.uiFilters, {
          key: this.sortKey,
          direction: this.sortDir,
        });
      }
      this.getDeals();
    });

    this.subscriptions.add(
      this._workflowService.getWorkflows({ feature: WorkflowFeature.DEAL_SHEET }).subscribe((response) => {
        const steps = (response?.data?.[0]?.steps ?? []).filter((st) => st.enabled !== false && !/^superadmin$/i.test((st.role as any)?.role ?? ''));
        this.dealWorkflowSteps = [...steps].sort((a, b) => b.order - a.order);
      }),
    );

    this._employeeService.employeeData$.subscribe((employee) => {
      this.userId = employee?._id;
      this.isSuperAdmin = /^superadmin$/i.test(String(employee?.category.role ?? ''));
      this.roleId = (employee?.category as any)?._id;
      this.canApprove = canDoDealSheet(employee, 'approve');
      this.canReject = canDoDealSheet(employee, 'reject');
      this.canRevoke = canDoDealSheet(employee, 'revoke');
      this.canUpdate = canDoDealSheet(employee, 'update');
    });
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  private buildColumns(): void {
    this.columns = [
      {
        key: 'date',
        sortable: true,
        label: 'Date',
        type: 'date',
        valueGetter: (r) => r.dealData?.savedDate,
      },
      {
        key: 'dealId',
        sortable: true,
        label: 'Deal Id',
        valueGetter: (r) => r.dealData?.dealId,
      },
      { key: 'quoteId', sortable: true, label: 'Quote Id' },
      {
        key: 'customerName',
        sortable: true,
        label: 'Customer',
        valueGetter: (r) => r.client?.companyName,
      },
      {
        key: 'description',
        sortable: true,
        label: 'Subject',
        valueGetter: (r) => r.subject,
      },
      {
        key: 'salesPerson',
        sortable: true,
        label: 'Sales Person',
        valueGetter: (r) =>
          r.createdBy ? `${r.createdBy.firstName} ${r.createdBy.lastName}` : '',
      },
      {
        key: 'actionedBy',
        label: 'Actioned By',
        valueGetter: (r) => (r.dealData as any)?.actionedBy || '-',
      },
      {
        key: 'department',
        sortable: true,
        label: 'Department',
        valueGetter: (r) => r.department?.departmentName,
      },
      {
        key: 'paymentTerms',
        sortable: true,
        label: 'Payment Terms',
        width: '240px',
        valueGetter: (r) => r.dealData?.paymentTerms,
      },
      {
        key: 'cost',
        label: 'Total Cost',
        valueGetter: (r) => r.dealData ? `${this.numberFormat.transform(this.costValue(r))} ${r.currency}` : '',
      },
      {
        key: 'amount',
        sortable: true,
        label: 'LPO Value',
        valueGetter: (r) => this.formatAmount(r),
      },
      {
        key: 'dealStatus',
        sortable: true,
        label: 'Status',
        type: 'badge',
        valueGetter: (r) => r.dealData?.status ?? null,
        badgeClasses: this.dealStatusBadgeClasses,
        badgeLabel: statusLabel,
        // Server-paged grid: the filter menu cannot infer every status from the one loaded page.
        filterOptions: DEAL_STATUSES.map((v) => ({
          label: statusLabel(v),
          value: v,
        })),
      },
    ];
  }

  /** Pick lists for the people, customer and department filters (same sources as the quotation list); a failed load leaves a plain text filter. */
  private loadSalesPersonOptions(): void {
    const set = (keys: string[], editorOptions: { label: string; value: any }[]) =>
      (this.columns = this.columns.map((c) => (keys.includes(c.key) ? { ...c, editorOptions } : c)));
    this.subscriptions.add(
      this._employeeService.getAllEmployees().pipe(catchError(() => of([]))).subscribe((people) =>
        set(['salesPerson', 'actionedBy'], (people ?? []).map((p) => ({ label: `${p.firstName} ${p.lastName}`, value: p._id })))),
    );
    this.subscriptions.add(
      this._employeeService.employeeData$.pipe(
        filter((e) => !!e?._id),
        take(1),
        switchMap((e) => this._customerService.getAllCustomers(e!._id as string, true)),
        catchError(() => of([])),
      ).subscribe((customers) => set(['customerName'], (customers ?? []).map((c) => ({ label: c.companyName, value: c._id })))),
    );
    this.subscriptions.add(
      this._profileService.getDepartments().pipe(catchError(() => of([]))).subscribe((departments) =>
        set(['department'], (departments ?? []).map((d: any) => ({ label: d.departmentName, value: d._id })))),
    );
  }

  private buildRowActions(): void {
    this.rowActions = [
      {
        id: 'detailView',
        label: 'Detail View',
        icon: 'eye',
        quick: true,
      },
      {
        id: 'viewDocuments',
        label: 'View Documents',
        icon: 'files',
        hidden: (r) => !this.dealDocuments(r).length,
      },
      {
        id: 'approve',
        label: 'Approve',
        icon: 'check',
        quick: true,
        hidden: (r) => r.dealData?.status !== 'pending' || !this.canApprove || !this.canDecide(r),
      },
      {
        id: 'reject',
        label: 'Reject',
        icon: 'close',
        variant: 'danger',
        quick: true,
        hidden: (r) => r.dealData?.status !== 'pending' || !this.canReject || !this.canDecide(r),
      },
      {
        id: 'resetWorkflow',
        label: 'Reset Workflow',
        icon: 'refresh',
        hidden: (r) => r.dealData?.status !== 'pending' || !this.isSuperAdmin,
      },
      {
        id: 'update',
        label: 'Update Deal',
        icon: 'pencil',
        quick: true,
        hidden: (r) => r.dealData?.status === 'approved' || !this.canUpdate,
      },
      {
        id: 'revoke',
        label: 'Revoke Deal',
        icon: 'refresh',
        hidden: (r) => r.dealData?.status !== 'approved' || !this.canRevoke,
      },
    ];
  }

  /** A deal that moved up after its time limit can only be decided by the role it moved to (or a Super Admin). */
  private canDecide(r: Quotatation): boolean {
    return canDecideDeal(r.dealData?.waiting, { _id: this.userId, roleId: this.roleId, isSuperAdmin: this.isSuperAdmin });
  }

  onQueryChange(query: DataGridQuery): void {
    this.searchQuery = query.search;
    this.page = query.page;
    this.row = query.pageSize;
    this.gridFilters = (query.filters ?? []).map((f) => ({ key: f.key, op: f.op, value: f.value, or: f.or }));
    // Unsplit filters (multi-picks kept together), for the URL and the Report tab.
    this.uiFilters = (this.grid?.filters ?? []).map((f) => ({ key: f.key, op: f.op, value: f.value, or: f.or }));
    this.sortKey = query.sort?.key ?? null;
    this.sortDir = query.sort?.direction ?? null;
    this.getDeals();
    this.updateUrlParams();
  }

  private static readonly viewSegments: Record<
    'all' | 'pending' | 'approved' | 'rejected' | 'revoked' | 'revenue',
    string
  > = {
    all: 'dealsheets',
    pending: 'pendings',
    approved: 'approved',
    revenue: 'approved',
    rejected: 'rejected',
    revoked: 'revokeds',
  };

  onViewChange(view: DataGridView<Quotatation>): void {
    this.activeViewId = view.id as
      | 'all'
      | 'pending'
      | 'approved'
      | 'rejected'
      | 'revoked'
      | 'revenue';
    this.page = 1;
    if (this.grid) this.grid.page = 1;
    // The grid emits queryChange right after viewChange, which reloads the data and syncs the URL once.
  }

  /** The server returns a total per tab; the active tab falls back to the page total. */
  private refreshViewCounts(viewCounts?: Record<string, number>): void {
    this.views = this.views.map((v) => {
      const count = v.id === this.activeViewId ? this.total : viewCounts?.[v.id];
      return { ...v, count, hideCount: count === undefined };
    });
  }

  private updateUrlParams(): void {
    // Absolute path (view segment + params) so a view switch and the query sync can never cancel each other.
    const segment = DealSheetListComponent.viewSegments[this.activeViewId];
    this._router.navigate(['/deal-sheet', segment], {
      queryParams: {
        page: this.page !== 1 ? this.page : null,
        row: this.row !== DEFAULT_PAGE_SIZE ? this.row : null,
        search: this.searchQuery || null,
        searchCriteria:
          this.searchCriteria !== 'all' ? this.searchCriteria : null,
        ...listFiltersToParams(this.uiFilters, DEAL_URL_FILTERS),
        sortKey: this.sortKey || null,
        sortDir: this.sortDir || null,
        wonFrom: this.wonFrom,
        wonTo: this.wonTo,
        person: this.wonPerson,
        ...(this.hasDashboardFilter ? { customer: this.wonCustomer } : {}),
      },
      replaceUrl: true,
    });
  }

  /** Skips a reload when the URL-driven and grid-driven triggers ask for the same query back to back. */
  private lastQueryKey = '';

  /** Set when opened from the sales dashboard Won revenue card: narrows Approved to that card's deals. */
  wonFrom: string | null = null;
  wonTo: string | null = null;
  wonPerson: string | null = null;
  wonCustomer: string | null = null;

  get hasDashboardFilter(): boolean {
    return !!(this.wonFrom || this.wonTo || this.wonPerson);
  }

  /** Grid filters as the user set them, kept in the URL and handed to the Report tab. */
  uiFilters: Omit<DataGridFilter, 'id'>[] = [];

  /** The report reads the same params, so it opens on exactly the list's filters. */
  get reportQueryParams(): Record<string, any> {
    const key = JSON.stringify(this.uiFilters);
    if (key !== this.reportParamsKey) {
      this.reportParamsKey = key;
      this.reportParamsCache = filtersToParams(this.uiFilters, DEAL_URL_FILTERS);
    }
    return this.reportParamsCache;
  }
  private reportParamsKey = '';
  private reportParamsCache: Record<string, any> = {};

  /** Adds the closable "Revenue" tab for deals opened from the dashboard, and opens it when the Approved list was requested. */
  private ensureRevenueView(): void {
    if (!this.hasDashboardFilter) return;
    if (!this.views.some((v) => v.id === 'revenue')) {
      this.views = [...this.views, { id: 'revenue', label: 'Revenue', closable: true, hidePill: true }];
    }
    if (this.activeViewId === 'approved') {
      this.activeViewId = 'revenue';
      if (this.grid) this.grid.activeViewId = 'revenue';
    }
  }

  closeRevenueView(): void {
    this.wonFrom = this.wonTo = this.wonPerson = this.wonCustomer = null;
    this.views = this.views.filter((v) => v.id !== 'revenue');
    if (this.activeViewId === 'revenue') {
      this.activeViewId = 'approved';
      if (this.grid) this.grid.activeViewId = 'approved';
    }
    this.page = 1;
    this.getDeals(true);
    this.updateUrlParams();
  }

  /** Builds the same role-scoped, tab-scoped request as the list for any page/row size. */
  private dealRequest(page: number, row: number): Observable<getDealSheet> {
    let access: string | undefined;
    let userId: string | undefined;
    let role: string | undefined;
    this._employeeService.employeeData$.pipe(take(1)).subscribe((employee) => {
      access = dealSheetPrivileges(employee?.category.privileges).viewReport;
      role = employee?.category.role;
      userId = employee?._id;
      this.userId = userId;
    });
    const filterData: any = {
      page,
      row,
      access,
      userId,
      role,
      searchQuery: this.searchQuery,
      searchCriteria: this.searchCriteria,
      view: this.activeViewId === 'revenue' ? 'approved' : this.activeViewId,
      filters: this.gridFilters,
      sortKey: this.sortKey,
      sortDir: this.sortDir,
      ...(this.activeViewId === 'revenue' ? { wonFrom: this.wonFrom, wonTo: this.wonTo, salesPerson: this.wonPerson, customer: this.wonCustomer } : {}),
    };
    return this.activeViewId === 'approved' || this.activeViewId === 'revenue'
      ? this._quoteService.getApprovedDealSheet(filterData)
      : this._quoteService.getDealSheet(filterData);
  }

  /** Export pages through every deal in the current tab/filters, not just the visible page. */
  exportFetch = (page: number, row: number) =>
    this.dealRequest(page, row).pipe(map((data) => ({ rows: data?.dealSheet ?? [], total: data?.total ?? 0 })));

  getDeals(force = false): void {
    const queryKey = [this.activeViewId, this.page, this.row, this.searchQuery, this.searchCriteria, JSON.stringify(this.gridFilters), this.sortKey, this.sortDir, this.wonFrom, this.wonTo, this.wonPerson, this.wonCustomer].join('|');
    if (!force && queryKey === this.lastQueryKey) return;
    this.lastQueryKey = queryKey;
    this.isLoading = true;
    const request = this.dealRequest(this.page, this.row);

    this.subscriptions.add(
      request.subscribe({
        next: (data: getDealSheet) => {
          this.rows = data?.dealSheet ? [...data.dealSheet] : [];
          this.total = data?.total ?? 0;
          this.refreshViewCounts(data?.viewCounts);
          this.isLoading = false;
        },
        error: () => {
          this.rows = [];
          this.total = 0;
          this.isLoading = false;
          this.lastQueryKey = '';
          this.toaster.error('Failed to load deal sheets');
        },
      }),
    );
  }

  onRowAction(event: DataGridRowActionEvent<Quotatation>): void {
    const { action, row } = event;
    switch (action.id) {
      case 'detailView':
        this.openDealSheetView(row);
        break;
      case 'viewDocuments':
        this.openDocumentsTab(row);
        break;
      case 'approve':
        this.approveDeal(row);
        break;
      case 'reject':
        this.rejectDeal(row);
        break;
      case 'update':
        this.updateDeal(row);
        break;
      case 'revoke':
        this.revokeDeal(row);
        break;
      case 'resetWorkflow':
        this.resetWorkflow(row);
        break;
    }
  }

  openDealSheetView(row: Quotatation): void {
    if (!row?._id) {
      this.toaster.error('Unable to open deal sheet: quotation ID is missing');
      return;
    }

    this._router.navigate(['/deal-sheet/view', row._id], {
      state: {
        approval: row.dealData?.status === 'pending',
        quoteData: row,
        quoteItems: selectedDealItems(row.dealData?.updatedItems),
        priceDetails: dealSheetPriceDetails(row.dealData?.updatedItems, row.dealData?.additionalCosts, row.dealData?.totalDiscount),
        jobId: row.job?._id,
        quoteView: false,
        returnUrl: this.currentListUrl(),
      },
    });
  }

  openDocumentsTab(row: Quotatation): void {
    this.grid?.openRow(row, 'documents');
  }

  /** Opening the detail panel is the new "viewed" signal, replacing the old IntersectionObserver. */
  onRowOpen(row: Quotatation): void {
    this.detailLoading = true;
    setTimeout(() => (this.detailLoading = false), 200);
    if (row._id && row.dealData && !row.dealData.seenByApprover) {
      this._quoteService.markDealAsViewed(row._id).subscribe();
      row.dealData.seenByApprover = true;
    }
  }

  approveDeal(row: Quotatation): void {
    this._decision.ask('approved', row.dealData?.dealId).subscribe((result) => {
      if (!result) return;
      this._quoteService
        .approveDeal(row._id, result.reason, this.userId)
        .subscribe({
          next: (res) => {
            this.toaster.success(res.awaitingNextApproval ? (res.message || 'Approved at your stage') : 'Deal approved');
            this.getDeals(true);
          },
          error: (err) => this.toaster.error(describeApprovalGateError(err, 'Failed to approve deal')),
        });
    });
  }

  resetWorkflow(row: Quotatation): void {
    const data: ResetWorkflowModalData = {
      jobId: row._id!,
      context: row.dealData?.dealId,
      contextLabel: 'Deal sheet',
      description: 'Tick the approval stages that get another chance on this deal sheet. Unticked stages are skipped for this deal only.',
      stages: this.dealWorkflowSteps.map((st) => ({ id: String((st.role as any)?._id ?? st.role), label: (st.role as any)?.categoryName ?? '—' })),
      restart: (ids) => this._quoteService.resetDealWorkflow(row._id!, ids),
    };
    this.modal.open<boolean>(ResetWorkflowComponent, { width: '520px', data })
      .afterClosed().subscribe((reset) => { if (reset) this.getDeals(true); });
  }

  rejectDeal(row: Quotatation): void {
    this._decision.ask('rejected', row.dealData?.dealId).subscribe((result) => {
      if (!result) return;
      this._quoteService.rejectDeal(result.reason, row._id).subscribe({
        next: () => {
          this.toaster.success('Deal rejected');
          this.getDeals(true);
        },
        error: (err) =>
          this.toaster.error(err?.error?.message || 'Failed to reject deal'),
      });
    });
  }

  private readonly allocateStatusOrder = [
    'Pending',
    'Work In Progress',
    'OpenToWork',
    'Completed',
  ];

  private canRevokeDeal(row: Quotatation): boolean {
    const allocateStatus = row.job?.allocateStatus;
    if (!allocateStatus) return true;
    return (
      this.allocateStatusOrder.indexOf(allocateStatus) <
      this.allocateStatusOrder.indexOf('OpenToWork')
    );
  }

  async revokeDeal(row: Quotatation): Promise<void> {
    if (!this.canRevokeDeal(row)) {
      this.toaster.error(
        'Deal cannot be revoked once the job has started allocation (Open to Work or later)',
      );
      return;
    }
    const { confirmed, reason } = await this.confirm.open({
      tone: 'warning',
      title: 'Revoke this deal?',
      message:
        'The deal goes back to pending and its job is put on hold with this reason. If the re-submitted deal is rejected, the job returns to the status it had.',
      reason: true,
      reasonLabel: 'Reason for revoking',
      reasonMaxLength: 500,
      confirmLabel: 'Revoke',
    });
    if (!confirmed || !reason) return;

    this._quoteService.revokeDeal(row._id, this.userId, reason).subscribe({
      next: () => {
        this.toaster.success('Deal revoked');
        this.getDeals(true);
      },
      error: (err) =>
        this.toaster.error(err?.error?.message || 'Failed to revoke deal'),
    });
  }

  /** `DealFormComponent` (update mode) seeds its form from `quoteItems` (the deal's own updated items,
   *  same as what the old view-dealsheet page passed via router state). */
  updateOpen = false;
  updateRow: Quotatation | null = null;
  updateData: UpdateDealsheetData | null = null;

  updateDeal(row: Quotatation): void {
    this.updateRow = row;
    this.updateData = {
      approval: false,
      quoteData: row,
      quoteItems: row.dealData?.updatedItems ?? [],
      priceDetails: {
        totalSellingPrice: this.sellingPrice(row),
        totalCost: 0,
        profit: 0,
        perc: 0,
      },
      quoteView: false,
    };
    this.updateOpen = true;
  }

  onUpdateSaved(dealData: FormData): void {
    const row = this.updateRow;
    if (!row) return;
    this._quoteService.saveDealSheet(dealData, row._id).subscribe({
      next: () => {
        this.updateOpen = false;
        this.toaster.success('Deal sheet updated');
        this.getDeals(true);
      },
      error: () => this.toaster.error('Failed to save deal sheet'),
    });
  }

  // --- detail panel content ---------------------------------------------------

  itemRows(row: Quotatation): Record<string, any>[] {
    const rows: Record<string, any>[] = [];
    const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    (row.dealData?.updatedItems ?? []).forEach((item) => {
      (item.itemDetails ?? []).forEach((d) => {
        if (!d.dealSelected) return;
        rows.push({
          item: esc(d.detail),
          itemText: d.detail,
          qty: d.quantity,
          price: d.unitCost,
          sellingPrice: d.unitSellingPrice,
          amount: (d.quantity ?? 0) * (d.unitSellingPrice ?? 0),
        });
        // parts of the line render as 1.1, 1.2 ... sub rows (not part of the totals)
        ((d as any).components ?? []).forEach((c: any) => {
          rows.push({
            _sub: true,
            item: esc(c.description),
            itemText: c.description,
            qty: (Number(c.quantity) || 0) * (Number(d.quantity) || 0),
            price: c.unitCost,
          });
        });
      });
    });
    return rows;
  }

  costRows(row: Quotatation): Record<string, any>[] {
    return (row.dealData?.additionalCosts ?? []).map((cost: any) => ({
      type: cost.type || 'Cost',
      name: cost.type === 'Supplier Discount'
        ? cost.supplierDetails?.supplierName || cost.name || 'Supplier discount'
        : cost.name || cost.type || 'Additional cost',
      value: cost.value || 0,
    }));
  }

  /** Item table footer: line subtotal, the discounts given to the customer, then the final deal value. */
  itemFootRows(row: Quotatation): DetailFootRow[] {
    const subtotal = this.itemRows(row).reduce((sum, r) => sum + (Number(r['amount']) || 0), 0);
    const quoteDiscount = Number(row.dealData?.totalDiscount) || 0;
    const customerDiscount = (row.dealData?.additionalCosts ?? [])
      .filter((c) => c.type === 'Customer Discount')
      .reduce((sum, c) => sum + (Number(c.value) || 0), 0);
    const rows: DetailFootRow[] = [{ label: 'Subtotal', cells: { amount: { value: subtotal, format: 'currency' } } }];
    if (quoteDiscount) rows.push({ label: 'Quotation discount', cells: { amount: { value: quoteDiscount, format: 'currency' } } });
    if (customerDiscount) rows.push({ label: 'Customer discount', cells: { amount: { value: customerDiscount, format: 'currency' } } });
    rows.push({ label: 'Net deal value', emphasis: true, cells: { amount: { value: subtotal - quoteDiscount - customerDiscount, format: 'currency' } } });
    const price = dealSheetPriceDetails(row.dealData?.updatedItems, row.dealData?.additionalCosts, row.dealData?.totalDiscount);
    rows.push({ label: 'Total cost', cells: { amount: { value: price.totalCost, format: 'currency' } } });
    rows.push({ label: 'Profit', cells: { amount: { value: price.profit, format: 'currency' } } });
    rows.push({ label: 'Profit margin', cells: { amount: { value: price.perc, format: 'percent' } } });
    return rows;
  }

  /** LPO files and convert-time attachments come from the quote and stay locked; deal uploads can be removed. */
  dealDocuments(row: Quotatation): DetailDocument[] {
    const docs: DetailDocument[] = [];
    (row.lpoFiles || []).forEach((file: any) => docs.push(this.fileDocument(file, 'LPO', 'LPO', false)));
    ((row.dealData as any)?.attachments || []).forEach((file: any) => docs.push(this.fileDocument(file, 'QUOTE', 'From quotation', false)));
    ((row as any).dealDocuments || []).forEach((file: any) => docs.push(this.fileDocument(file, 'DEAL', file.uploadedBy || 'Deal sheet', true, file.uploadedAt)));
    return docs;
  }

  private fileDocument(file: any, source: string, label: string, removable: boolean, date?: string): DetailDocument {
    const name = file.originalname || file.fileName || 'Document';
    return {
      id: `${source}:${file.fileName}`,
      name,
      uploadedBy: label,
      date,
      removable,
      kind: (name.split('.').pop() || 'FILE').toUpperCase().slice(0, 4),
    };
  }

  readonly acceptedFiles = ALLOWED_UPLOAD_TYPES;
  uploadingDealDocs = false;

  onAddNote(row: Quotatation): void {
    this.modal.open<QuoteNoteModalResult>(QuoteNoteModalComponent, {
      width: '520px',
      data: { context: row.dealData?.dealId || row.quoteId || row._id },
    }).afterClosed().subscribe((result) => {
      if (!result) return;
      this._quoteService.addQuoteNote(row._id as string, result).subscribe({
        next: (response) => { row.notes = response.notes; this.toaster.success('Note added'); },
        error: (err) => this.toaster.error(err?.error?.message || 'Could not save the note'),
      });
    });
  }

  startDealDocUpload(row: Quotatation): void {
    this.modal.open<DocumentUploadModalResult>(DocumentUploadModalComponent, {
      width: '680px',
      data: { context: row.dealData?.dealId || row.quoteId, acceptedFiles: this.acceptedFiles, title: 'Upload deal documents' },
    }).afterClosed().subscribe((result) => {
      if (!result?.files?.length || !row._id) return;
      this.uploadingDealDocs = true;
      this._quoteService.uploadDealDocuments(row._id, result.files).subscribe({
        next: (res) => {
          (row as any).dealDocuments = res.data || [];
          this.uploadingDealDocs = false;
          this.toaster.success('Documents uploaded');
        },
        error: (err) => {
          this.uploadingDealDocs = false;
          this.toaster.error(err?.error?.message || 'Failed to upload documents');
        },
      });
    });
  }

  onDealDocRemove(row: Quotatation, doc: DetailDocument): void {
    const [source, ...rest] = doc.id.split(':');
    if (source !== 'DEAL' || !row._id) return;
    this._quoteService.removeDealDocument(row._id, rest.join(':')).subscribe({
      next: (res) => {
        (row as any).dealDocuments = res.data || [];
        this.toaster.success('Document deleted');
      },
      error: (err) => this.toaster.error(err?.error?.message || 'Failed to delete document'),
    });
  }

  onDealDocPreview(row: Quotatation, doc: DetailDocument): void {
    const file = this.findDocumentFile(row, doc.id);
    if (file) this.fileOpener.openFile(file.fileName, file.originalname || doc.name);
  }

  onDealDocDownload(row: Quotatation, doc: DetailDocument): void {
    const file = this.findDocumentFile(row, doc.id);
    if (file) this.previewOrDownload(file, 'download');
  }

  private findDocumentFile(row: Quotatation, id: string): any {
    const [source, ...rest] = id.split(':');
    const fileName = rest.join(':') || id;
    const pool = source === 'DEAL' ? (row as any).dealDocuments : source === 'QUOTE' ? (row.dealData as any)?.attachments : row.lpoFiles;
    return (pool || []).find((f: any) => f.fileName === fileName);
  }

  historyFor(row: Quotatation): Observable<DetailTimelineEntry[]> {
    const deal = row.dealData as any;
    const id = row._id || deal?._id || deal?.dealId;
    if (!id) return new BehaviorSubject<DetailTimelineEntry[]>([]).asObservable();
    let subject = this.historyCache.get(id);
    if (!subject) {
      subject = new BehaviorSubject<DetailTimelineEntry[]>([]);
      this.historyCache.set(id, subject);
      this.auditLog.getHistory('quotation', id).subscribe({
        next: (entries) => subject!.next(toTimelineEntries(entries)),
        error: () => this.historyCache.delete(id),
      });
    }
    return subject.asObservable();
  }

  dealComments(row: Quotatation): DetailComment[] {
    const comments = row.dealData?.comments ?? [];
    const by = this.approverName(row) || 'Deal reviewer';
    const date = row.dealData?.savedDate || row.date || new Date().toISOString();

    return comments
      .map((comment) => String(comment || '').trim())
      .filter(Boolean)
      .map((text) => ({ text, by, date }));
  }

  private previewOrDownload(file: any, mode: 'view' | 'download'): void {
    this._jobService.downloadFile(file.fileName).subscribe({
      next: (event) => {
        if (event.type !== HttpEventType.Response) return;
        const name = String(file.originalname || file.fileName || '').toLowerCase();
        const mimeByExt: Record<string, string> = {
          pdf: 'application/pdf',
          png: 'image/png',
          jpg: 'image/jpeg',
          jpeg: 'image/jpeg',
          gif: 'image/gif',
          webp: 'image/webp',
          txt: 'text/plain',
        };
        const type =
          event.body?.type ||
          mimeByExt[name.split('.').pop() || ''] ||
          'application/octet-stream';
        const blob = new Blob([event.body], { type });
        if (mode === 'download') {
          saveAs(blob, file.originalname);
        } else {
          const url = window.URL.createObjectURL(blob);
          window.open(url, '_blank');
          setTimeout(() => window.URL.revokeObjectURL(url), 60000);
        }
      },
      error: (error) => {
        if (error.status === 404)
          this.toaster.warning(
            'Sorry, the requested file was not found on the server.',
          );
        else this.toaster.error('An error occurred while opening the file.');
      },
    });
  }

  private sellingPrice(row: Quotatation): number {
    let total = 0;
    (row.dealData?.updatedItems ?? []).forEach((item) => {
      (item.itemDetails ?? []).forEach((d) => {
        if (d.dealSelected)
          total += (d.unitSellingPrice ?? 0) * (d.quantity ?? 0);
      });
    });
    (row.dealData?.additionalCosts ?? []).forEach((cost) => {
      if (cost.type === 'Customer Discount') total -= cost.value;
    });
    return total - (Number(row.dealData?.totalDiscount) || 0);
  }

  private currentListUrl(): string {
    const segment = DealSheetListComponent.viewSegments[this.activeViewId];
    const queryParams = new URLSearchParams();
    if (this.page !== 1) queryParams.set('page', String(this.page));
    if (this.row !== DEFAULT_PAGE_SIZE) queryParams.set('row', String(this.row));
    if (this.searchQuery) queryParams.set('search', this.searchQuery);
    if (this.searchCriteria !== 'all') {
      queryParams.set('searchCriteria', this.searchCriteria);
    }
    if (this.gridFilters.length) queryParams.set('filters', JSON.stringify(this.gridFilters));
    if (this.sortKey) queryParams.set('sortKey', this.sortKey);
    if (this.sortDir) queryParams.set('sortDir', this.sortDir);
    const query = queryParams.toString();
    return `/deal-sheet/${segment}${query ? `?${query}` : ''}`;
  }

  /** Cost and LPO value summed over the rows on the current page, one figure per currency. */
  get pageTotals(): DataGridFooterTotal[] {
    const lpo = new Map<string, number>();
    const cost = new Map<string, number>();
    for (const row of this.rows ?? []) {
      if (!row.dealData) continue;
      const cur = row.currency || 'QAR';
      cost.set(cur, (cost.get(cur) ?? 0) + this.costValue(row));
      lpo.set(cur, (lpo.get(cur) ?? 0) + this.sellingPrice(row));
    }
    const fmt = (m: Map<string, number>) =>
      m.size ? [...m].map(([cur, v]) => `${this.numberFormat.transform(v)} ${cur}`).join(' · ') : '0';
    return [
      { label: 'Total Cost', value: fmt(cost) },
      { label: 'Total LPO', value: fmt(lpo) },
    ];
  }

  /** Same total cost the deal's price breakdown shows. */
  private costValue(row: Quotatation): number {
    const d = row.dealData;
    return Number(dealSheetPriceDetails(d?.updatedItems, d?.additionalCosts, d?.totalDiscount).totalCost) || 0;
  }

  formatAmount(row: Quotatation): string {
    if (!row.dealData) return '';
    return `${this.numberFormat.transform(this.sellingPrice(row))} ${row.currency}`;
  }

  approverName(row: Quotatation): string {
    const approver = row.dealData?.approvedBy;
    if (approver && typeof approver === 'object')
      return `${approver.firstName ?? ''} ${approver.lastName ?? ''}`.trim();
    return '';
  }

  overviewSections(row: Quotatation): DetailOverviewSection[] {
    const deal: any = row.dealData;
    const enquiry = row.enqId as any;
    const contact = (row as any).attention || (row as any).contact || enquiry?.contact;
    const money = (v: number) => `${this.numberFormat.transform(v)} ${row.currency}`;
    const price = dealSheetPriceDetails(deal?.updatedItems, deal?.additionalCosts, deal?.totalDiscount);
    const quoteDiscount = Number(deal?.totalDiscount) || 0;
    const customerDiscount = (deal?.additionalCosts ?? [])
      .filter((c: any) => c.type === 'Customer Discount')
      .reduce((sum: number, c: any) => sum + (Number(c.value) || 0), 0);
    const amountField = (label: string, value: number, tone?: DetailOverviewField['tone']): DetailOverviewField =>
      ({ type: 'field', label, value: money(value), numeric: true, noHover: true, tone });
    return [
      {
        title: 'Deal',
        columns: '2',
        fields: [
          { type: 'field', label: 'Deal No.', value: deal?.dealId, numeric: true },
          { type: 'dg', key: 'dealStatus', label: 'Status', noHover: true },
          ...(deal?.waiting
            ? [{ type: 'field' as const, label: 'Waiting on', value: describeDealWaiting(deal.waiting), noHover: true }]
            : []),
          { type: 'field', label: 'Quote Id', value: row.quoteId, numeric: true },
          { type: 'field', label: 'Contact', value: this.contactName(contact) },
          { type: 'field', label: 'Priority', value: enquiry?.priority || '—' },
          { type: 'field', label: 'Payment Terms', value: deal?.paymentTerms || '—' },
          ...((row as any).job?.jobId
            ? [{ type: 'field' as const, label: 'Job ID', value: (row as any).job.jobId, numeric: true }]
            : []),
          { type: 'field' as const, label: 'Actioned By', value: (deal as any)?.actionedBy || '-', noHover: true },
        ],
      },
      {
        title: 'Financial summary',
        columns: '2',
        fields: [
          amountField('Subtotal', price.totalSellingPrice + quoteDiscount + customerDiscount),
          ...(quoteDiscount ? [amountField('Quotation discount', quoteDiscount)] : []),
          ...(customerDiscount ? [amountField('Customer discount', customerDiscount)] : []),
          amountField('Net deal value', price.totalSellingPrice, 'good'),
          amountField('Total cost', price.totalCost),
          amountField('Profit', price.profit),
          { type: 'field', label: 'Profit margin', value: `${price.perc.toFixed(1)}%`, numeric: true, noHover: true },
        ],
      },
    ];
  }

  private parseGridFilters(raw: unknown): Omit<DataGridFilter, 'id'>[] {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(String(raw));
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((f) => f && typeof f.key === 'string' && typeof f.op === 'string')
        .map((f) => ({ key: f.key, op: f.op as DataGridFilter['op'], value: f.value, or: f.or === true ? true : undefined }));
    } catch {
      return [];
    }
  }

  private contactName(contact: any): string {
    if (!contact) return '—';
    return `${contact.firstName ?? ''} ${contact.lastName ?? ''}`.trim() || '—';
  }
}
