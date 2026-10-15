import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { Observable, Subject, Subscription, catchError, forkJoin, map, of, switchMap } from 'rxjs';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { JobService } from 'src/app/core/services/job/job.service';
import { ProjectService } from 'src/app/core/services/project.service';
import { QuotationService } from 'src/app/core/services/quotation/quotation.service';
import { TechnicalService } from 'src/app/core/services/technical.service';
import { ApproveDealComponent } from 'src/app/modules/deal-sheet/pages/approve-deal/approve-deal.component';
import { allocateType } from 'src/app/modules/job-sheet/pages/allocate-type-modal/allocate-type-modal.component';
import { ConfirmDialogService } from 'src/app/shared/components/confirm-dialog';
import { DataGridComponent } from 'src/app/shared/components/data-grid/data-grid.component';
import {
  DataGridBreadcrumb,
  DataGridColumn,
  DataGridDetailTab,
  DataGridFilter,
  DataGridQuery,
  DataGridRowAction,
  DataGridRowActionEvent,
  DataGridView,
} from 'src/app/shared/components/data-grid/data-grid.model';
import { DetailOverviewComponent } from 'src/app/shared/components/detail-panel/detail-overview.component';
import { DetailOverviewSection } from 'src/app/shared/components/detail-panel/detail-panel.model';
import { PdfPreviewComponent } from 'src/app/shared/components/pdf-preview/pdf-preview.component';
import { ProjectStatus } from 'src/app/shared/interfaces/project.interface';
import { CreateProjectComponent } from '../../create-project/create-project.component';
import { AssignEngineerDialogComponent } from '../../dialogs/assign-engineer-dialog/assign-engineer-dialog.component';
import { TransferEngineerComponent } from '../../dialogs/transfer-engineer/transfer-engineer.component';

type ViewId = 'openToWork' | 'pendingProjects' | 'pendingAmc' | 'materials';

interface PageResult {
  rows: any[];
  total: number;
}

const VIEW_IDS: ViewId[] = ['openToWork', 'pendingProjects', 'pendingAmc', 'materials'];

const PRIORITY_BADGE_CLASSES: Record<string, string> = {
  High: 'bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900',
  Medium: 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900',
  Low: 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900',
};

@Component({
  selector: 'app-technical-project',
  standalone: true,
  imports: [CommonModule, DataGridComponent, DetailOverviewComponent],
  templateUrl: './project.component.html',
  styleUrl: './project.component.css',
})
export class TechnicalProjectComponent implements OnInit, OnDestroy {
  @ViewChild('grid') grid?: DataGridComponent<any>;

  private jobService = inject(JobService);
  private projectService = inject(ProjectService);
  private technicalService = inject(TechnicalService);
  private quotationService = inject(QuotationService);
  private employeeService = inject(EmployeeService);
  private confirmDialog = inject(ConfirmDialogService);
  private toaster = inject(ToastrService);
  private dialog = inject(MatDialog);
  private router = inject(Router);
  private subscriptions = new Subscription();
  private load$ = new Subject<void>();

  rows: any[] = [];
  total = 0;
  isLoading = true;
  loadError = '';

  columns: DataGridColumn<any>[] = [];
  rowActions: DataGridRowAction<any>[] = [];
  views: DataGridView<any>[] = [];
  detailTabs: DataGridDetailTab[] = [{ id: 'overview', label: 'Details', icon: 'info' }];
  breadcrumbs: DataGridBreadcrumb[] = [{ label: 'Home', link: '/' }, { label: 'Projects' }, { label: 'Technical' }];

  activeViewId: ViewId = 'openToWork';
  page = 1;
  row = 15;
  searchQuery = '';
  filters: DataGridFilter[] = [];
  sortKey: string | null = null;
  sortDir: 'asc' | 'desc' | null = null;

  canAssign = false;
  canTransfer = false;
  canApproveMr = false;
  private userId = '';
  private engineerOptions: { label: string; value: string }[] = [];
  private counts: Partial<Record<ViewId, number>> = {};
  private privilegesLoaded = false;
  private initialLoadDone = false;

  readonly scopeOptions = [
    { label: 'Project With Supply', value: 'Project With Supply' },
    { label: 'AMC', value: 'AMC' },
  ];

  readonly priorityOptions = [
    { label: 'High', value: 'High' },
    { label: 'Medium', value: 'Medium' },
    { label: 'Low', value: 'Low' },
  ];

  ngOnInit(): void {
    this.buildRowActions();
    this.columns = this.columnsFor(this.activeViewId);

    // Only the latest request per view counts, so a slow reply for a previous tab never overwrites the current rows.
    this.subscriptions.add(
      this.load$.pipe(
        switchMap(() => {
          this.isLoading = true;
          return this.fetchView(this.activeViewId, this.page, this.row, this.searchQuery, true).pipe(
            map((result) => ({ result, failed: false })),
            catchError((error) => {
              if (error?.status !== 204) this.toaster.error('Failed to load records');
              return of({ result: { rows: [], total: 0 } as PageResult, failed: error?.status !== 204 });
            }),
          );
        }),
      ).subscribe(({ result, failed }) => {
        this.rows = result.rows;
        this.total = result.total;
        this.loadError = failed ? 'Could not load records.' : '';
        this.isLoading = false;
        this.counts[this.activeViewId] = this.searchQuery || this.filters.length ? this.counts[this.activeViewId] : result.total;
        this.refreshViews();
      }),
    );

    this.subscriptions.add(
      this.employeeService.employeeData$.subscribe((employee: any) => {
        if (!employee) return;
        const isSuperAdmin = /^superadmin$/i.test(employee?.category?.role ?? '');
        const technical = employee?.category?.privileges?.technical ?? {};
        const extra = employee?.extraPrivileges?.technical ?? {};
        const has = (key: string) => isSuperAdmin || technical[key] === true || extra[key] === true;
        this.userId = employee._id;
        this.canAssign = has('canViewOpenToWorkAndAssign');
        this.canTransfer = has('canTransferToEngineer');
        this.canApproveMr = has('canApproveMRRequests');
        if (this.canAssign && !this.engineerOptions.length) this.loadEngineers();
        this.privilegesLoaded = true;
        this.refreshViews();
        this.loadCounts();
      }),
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    this.load$.complete();
  }

  get createLabel(): string {
    return this.activeViewId === 'openToWork' && this.canAssign ? 'Add Project' : '';
  }

  get emptyMessage(): string {
    switch (this.activeViewId) {
      case 'openToWork': return 'No jobs are waiting to be assigned';
      case 'pendingProjects': return 'No pending projects found';
      case 'pendingAmc': return 'No pending AMC found';
      default: return 'No material approval requests found';
    }
  }

  // ---- views ----

  private visibleViewIds(): ViewId[] {
    return VIEW_IDS.filter((id) => (id === 'openToWork' ? this.canAssign : id === 'materials' ? this.canApproveMr : true));
  }

  private labelFor(id: ViewId): string {
    switch (id) {
      case 'openToWork': return 'Open To Work';
      case 'pendingProjects': return 'Pending Projects';
      case 'pendingAmc': return 'Pending AMC';
      default: return 'Materials';
    }
  }

  private refreshViews(): void {
    if (!this.privilegesLoaded) return;
    this.views = this.visibleViewIds().map((id) => ({ id, label: this.labelFor(id), count: this.counts[id], hideCount: this.counts[id] === undefined }));
  }

  /** Counts for every tab, so each shows how much is waiting without opening it. */
  private loadCounts(): void {
    const requests = this.visibleViewIds().reduce((acc, id) => {
      acc[id] = this.fetchView(id, 1, 1, '').pipe(map((r) => r.total), catchError(() => of(undefined)));
      return acc;
    }, {} as Record<string, Observable<number | undefined>>);

    this.subscriptions.add(
      forkJoin(requests).subscribe((results) => {
        (Object.keys(results) as ViewId[]).forEach((id) => (this.counts[id] = results[id]));
        this.refreshViews();
      }),
    );
  }

  /** Fires when the grid settles on a tab (first load, or a click before the query event). */
  onViewChange(view: DataGridView<any>): void {
    const id = view.id as ViewId;
    if (!VIEW_IDS.includes(id)) return;
    if (id !== this.activeViewId) {
      this.activeViewId = id;
      this.columns = this.columnsFor(id);
      this.rows = [];
      this.total = 0;
      this.page = 1;
      this.sortKey = null;
      this.sortDir = null;
      this.filters = [];
      this.loadError = '';
      this.isLoading = true;
    }
    if (!this.initialLoadDone) {
      this.initialLoadDone = true;
      this.load$.next();
    }
  }

  onQueryChange(query: DataGridQuery): void {
    const id = VIEW_IDS.includes(query.viewId as ViewId) ? (query.viewId as ViewId) : this.activeViewId;
    if (id !== this.activeViewId) {
      this.activeViewId = id;
      this.columns = this.columnsFor(id);
      this.rows = [];
    }
    this.initialLoadDone = true;
    this.page = query.page;
    this.row = query.pageSize;
    this.searchQuery = query.search;
    this.filters = query.filters;
    this.sortKey = query.sort.key;
    this.sortDir = query.sort.direction;
    this.load$.next();
  }

  reload(): void {
    this.load$.next();
    this.loadCounts();
  }

  // ---- data ----

  /** `withQuery` adds the grid sort and filters; the tab counts are fetched without them. */
  private fetchView(id: ViewId, page: number, row: number, search: string, withQuery = false): Observable<PageResult> {
    const text = search || undefined;
    const query = withQuery
      ? { filters: this.filters, sortKey: this.sortKey || undefined, sortDir: this.sortDir || undefined }
      : {};
    switch (id) {
      case 'openToWork':
        return this.jobService.getUnassignedToTechnical({ page, row, search: text, ...query }).pipe(
          map((res) => ({ rows: res?.data ?? [], total: res?.total ?? 0 })),
        );
      case 'pendingProjects':
      case 'pendingAmc':
        return this.projectService.getProjects({
          page,
          row,
          search: text,
          projectType: id === 'pendingProjects' ? 'project' : 'amc',
          status: [ProjectStatus.Pending],
          ...query,
        } as any).pipe(map((res) => ({ rows: res?.data ?? [], total: res?.total ?? res?.data?.length ?? 0 })));
      default:
        return this.technicalService.getPendingMaterialRequestProjects({
          page,
          row,
          search: text,
          viewId: 'pending',
          ...query,
        }).pipe(map((res) => ({ rows: res?.data ?? [], total: res?.total ?? res?.data?.length ?? 0 })));
    }
  }

  private loadEngineers(): void {
    this.subscriptions.add(
      this.technicalService.getEngineers().subscribe({
        next: (response) => {
          this.engineerOptions = (response?.data ?? []).map((engineer: any) => ({
            label: `${engineer.firstName} ${engineer.lastName}`,
            value: engineer._id,
          }));
        },
        error: () => this.toaster.error('Failed to load engineers'),
      }),
    );
  }

  // ---- columns ----

  private columnsFor(id: ViewId): DataGridColumn<any>[] {
    switch (id) {
      case 'openToWork':
        return [
          { key: 'jobId', label: 'Job ID', sortable: true, locked: true },
          { key: 'customer', label: 'Customer', sortable: true, valueGetter: (r) => r.clientDetails?.companyName || '-' },
          { key: 'description', label: 'Description', sortable: true, valueGetter: (r) => r.quotation?.subject || '-' },
          { key: 'salesPerson', label: 'Sales Person', sortable: true, valueGetter: (r) => this.personName(r.salesPersonDetails?.[0]) },
          { key: 'department', label: 'Department', sortable: true, valueGetter: (r) => r.departmentDetails?.[0]?.departmentName || '-' },
          { key: 'quotation', label: 'Quotation', sortable: true, valueGetter: (r) => r.quotation?.quoteId || '-' },
          { key: 'dealSheet', label: 'Deal Sheet', sortable: true, valueGetter: (r) => r.quotation?.dealData?.dealId || '-' },
          { key: 'allocateType', label: 'Scope', sortable: true, filterOptions: this.scopeOptions },
        ];
      case 'pendingProjects':
      case 'pendingAmc':
        return [
          { key: 'jobId', label: 'Job ID', sortable: true, locked: true, valueGetter: (r) => r.jobId?.jobId || '-' },
          { key: 'customer', label: 'Project Name', sortable: true, valueGetter: (r) => r.customer?.companyName || '-' },
          { key: 'assignedTo', label: 'Assigned Engineer', sortable: true, valueGetter: (r) => this.personName(r.assignedTo) },
          { key: 'assignedBy', label: 'Assigned By', sortable: true, valueGetter: (r) => this.personName(r.assignedBy) },
          { key: 'priority', label: 'Priority', type: 'badge', sortable: true, badgeClasses: PRIORITY_BADGE_CLASSES, filterOptions: this.priorityOptions, valueGetter: (r) => r.priority || '-' },
        ];
      default:
        return [
          { key: 'jobId', label: 'Job ID', sortable: true, locked: true, valueGetter: (r) => this.jobNumber(r) },
          { key: 'customer', label: 'Project Name', sortable: true, valueGetter: (r) => r.customer?.companyName || '-' },
          { key: 'materialRequest', label: 'Items', type: 'number', align: 'right', sortable: true, valueGetter: (r) => this.countOf(r.materialRequest) },
          { key: 'materialRequestAttachments', label: 'Files', type: 'number', align: 'right', sortable: true, valueGetter: (r) => this.countOf(r.materialRequestAttachements) },
          { key: 'updatedAt', label: 'Updated', type: 'date', sortable: true, width: '130px' },
        ];
    }
  }

  private buildRowActions(): void {
    const only = (id: ViewId) => () => this.activeViewId !== id;
    const pendingProjectView = () => this.activeViewId !== 'pendingProjects' && this.activeViewId !== 'pendingAmc';
    this.rowActions = [
      { id: 'assignEngineer', label: 'Assign to Engineer', icon: 'user', quick: true, panel: true, hidden: only('openToWork') },
      { id: 'viewQuotation', label: 'View Quotation', icon: 'files', hidden: (r) => this.activeViewId !== 'openToWork' || !r.quotation },
      { id: 'viewDealSheet', label: 'View Deal Sheet', icon: 'card', hidden: (r) => this.activeViewId !== 'openToWork' || !r.quotation?.dealData?.dealId },
      { id: 'editProject', label: 'Edit Project', icon: 'pencil', quick: true, panel: true, hidden: pendingProjectView },
      { id: 'transferEngineer', label: 'Transfer Engineer', icon: 'transfer', quick: true, hidden: (r) => pendingProjectView() || !this.canTransfer || !r.assignedTo },
      { id: 'deleteProject', label: 'Delete Project', icon: 'trash', variant: 'danger', divider: true, hidden: (r) => pendingProjectView() || r.status !== ProjectStatus.Pending },
      { id: 'viewMr', label: 'View MR', icon: 'eye', quick: true, panel: true, hidden: only('materials') },
    ];
  }

  // ---- actions ----

  onRowAction(event: DataGridRowActionEvent<any>): void {
    const { action, row } = event;
    switch (action.id) {
      case 'assignEngineer': this.openAssignEngineer(row); break;
      case 'viewQuotation': this.previewQuotation(row); break;
      case 'viewDealSheet': this.viewDealSheet(row); break;
      case 'editProject': this.router.navigate(['/technical/project', 'edit', row._id]); break;
      case 'transferEngineer': this.transferEngineer(row); break;
      case 'deleteProject': void this.deleteProject(row); break;
      case 'viewMr': this.router.navigate(['/technical/materials/view', row._id]); break;
    }
  }

  addProject(): void {
    this.dialog.open(CreateProjectComponent, { data: { isEditMode: false }, width: '900px' })
      .afterClosed().subscribe((result) => { if (result) this.reload(); });
  }

  private openAssignEngineer(job: any): void {
    const projectType = job.allocateType === allocateType.AMC ? 'amc' : job.allocateType === allocateType.ProjectWithSupply ? 'project' : '';
    this.dialog.open(AssignEngineerDialogComponent, {
      width: '400px',
      data: { engineerOptions: this.engineerOptions, priorityOptions: this.priorityOptions },
    }).afterClosed().subscribe((result) => {
      if (!result) return;
      this.technicalService.assignEngineer({
        jobId: job._id,
        engineerId: result.engineerId,
        comment: result.comment,
        assignedBy: this.userId,
        projectType,
        customerId: job.clientDetails._id,
        priority: result.priority,
      }).subscribe({
        next: () => {
          const engineer = this.engineerOptions.find((e) => e.value === result.engineerId)?.label || 'Engineer';
          this.toaster.success(`Assigned to ${engineer} for job: ${job.jobId}`);
          this.reload();
        },
        error: () => this.toaster.error('Failed to assign engineer'),
      });
    });
  }

  private transferEngineer(project: any): void {
    this.dialog.open(TransferEngineerComponent, {
      data: { projectId: project._id, currentEngineer: project.assignedTo },
      width: '500px',
      disableClose: true,
    }).afterClosed().subscribe((result) => {
      if (!result?.engineerId) return;
      this.projectService.transferEngineer(project._id, result.engineerId).subscribe({
        next: (response) => {
          if (response.success) {
            this.toaster.success('Engineer transferred successfully');
            this.reload();
          }
        },
        error: () => this.toaster.error('Failed to transfer engineer'),
      });
    });
  }

  private async deleteProject(project: any): Promise<void> {
    const { confirmed } = await this.confirmDialog.open({
      tone: 'reject',
      title: 'Delete project',
      message: 'This permanently deletes the project and cannot be undone.',
      details: [
        { label: 'Job ID', value: project.jobId?.jobId || '-' },
        { label: 'Project', value: project.customer?.companyName || '-' },
      ],
      confirmLabel: 'Delete',
    });
    if (!confirmed) return;
    this.projectService.deleteProject(project._id).subscribe({
      next: () => {
        this.toaster.success('Project deleted successfully');
        this.reload();
      },
      error: () => this.toaster.error('Failed to delete project'),
    });
  }

  private previewQuotation(job: any): void {
    const quote = job.quotation;
    quote.createdBy = job.salesPersonDetails?.[0];
    quote.client = job.clientDetails;
    quote.attention = job.attention;
    this.quotationService.generatePDF(quote, true).then((pdf: any) => {
      pdf.getBlob((blob: Blob) => {
        this.dialog.open(PdfPreviewComponent, { data: { url: window.URL.createObjectURL(blob), formatedQuote: quote } });
      });
    });
  }

  private viewDealSheet(job: any): void {
    const quoteData = job.quotation;
    quoteData.createdBy = job.salesPersonDetails?.[0];
    quoteData.client = job.clientDetails;
    const priceDetails = { totalSellingPrice: 0, totalCost: 0, profit: 0, perc: 0 };
    const quoteItems = (quoteData.dealData?.updatedItems ?? []).map((item: any) => {
      let itemSelected = 0;
      item.itemDetails.forEach((detail: any) => {
        if (!detail.dealSelected) return;
        itemSelected++;
        priceDetails.totalSellingPrice += detail.unitCost / (1 - (detail.profit / 100)) * detail.quantity;
        priceDetails.totalCost += detail.quantity * detail.unitCost;
      });
      return itemSelected ? item : undefined;
    });
    (quoteData.dealData?.additionalCosts ?? []).forEach((cost: any) => {
      if (cost.type === 'Supplier Discount') priceDetails.totalCost -= cost.value;
      else if (cost.type === 'Customer Discount') priceDetails.totalSellingPrice -= cost.value;
      else priceDetails.totalCost += cost.value;
    });
    priceDetails.profit = priceDetails.totalSellingPrice - priceDetails.totalCost;
    priceDetails.perc = priceDetails.totalSellingPrice ? (priceDetails.profit / priceDetails.totalSellingPrice) * 100 : 0;
    this.dialog.open(ApproveDealComponent, {
      data: { approval: false, quoteData, quoteItems, priceDetails },
      width: '1200px',
    });
  }

  // ---- detail panel ----

  detailTitle = (row: any): string => {
    if (this.activeViewId === 'openToWork') return row.jobId || 'Job';
    return this.jobNumber(row) || 'Project';
  };

  detailSubtitle = (row: any): string =>
    (this.activeViewId === 'openToWork' ? row.clientDetails?.companyName : row.customer?.companyName) || '';

  overviewSections(row: any): DetailOverviewSection[] {
    if (this.activeViewId === 'openToWork') {
      return [{
        title: 'Job',
        columns: '2',
        fields: [
          { type: 'field', label: 'Job ID', value: row.jobId || '-' },
          { type: 'field', label: 'Customer', value: row.clientDetails?.companyName || '-' },
          { type: 'field', label: 'Description', value: row.quotation?.subject || '-' },
          { type: 'field', label: 'Scope', value: row.allocateType || '-' },
          { type: 'field', label: 'Sales Person', value: this.personName(row.salesPersonDetails?.[0]) },
          { type: 'field', label: 'Department', value: row.departmentDetails?.[0]?.departmentName || '-' },
          { type: 'field', label: 'Quotation', value: row.quotation?.quoteId || '-' },
          { type: 'field', label: 'Deal Sheet', value: row.quotation?.dealData?.dealId || '-' },
        ],
      }];
    }
    if (this.activeViewId === 'materials') {
      return [
        {
          title: 'Project',
          columns: '2',
          fields: [
            { type: 'field', label: 'Job ID', value: this.jobNumber(row) || '-' },
            { type: 'field', label: 'Project Name', value: row.customer?.companyName || '-' },
            { type: 'field', label: 'Project Status', value: row.status || '-' },
            { type: 'field', label: 'Priority', value: row.priority || '-' },
          ],
        },
        {
          title: 'Material Request',
          columns: '2',
          fields: [
            { type: 'field', label: 'Pending Items', value: this.countOf(row.materialRequest), numeric: true },
            { type: 'field', label: 'Pending Files', value: this.countOf(row.materialRequestAttachements), numeric: true },
            { type: 'field', label: 'Last Updated', value: row.updatedAt || '-' },
          ],
        },
      ];
    }
    return [{
      title: 'Project',
      columns: '2',
      fields: [
        { type: 'field', label: 'Job ID', value: row.jobId?.jobId || '-' },
        { type: 'field', label: 'Project Name', value: row.customer?.companyName || '-' },
        { type: 'field', label: 'Assigned Engineer', value: this.personName(row.assignedTo) },
        { type: 'field', label: 'Assigned By', value: this.personName(row.assignedBy) },
        { type: 'field', label: 'Priority', value: row.priority || '-' },
        { type: 'field', label: 'Status', value: row.status || '-' },
      ],
    }];
  }

  // ---- helpers ----

  private personName(person: any): string {
    return person?.firstName ? `${person.firstName} ${person.lastName ?? ''}`.trim() : '-';
  }

  private jobNumber(row: any): string {
    return typeof row.jobId === 'string' ? row.jobId : row.jobId?.jobId || '';
  }

  private countOf(list: unknown): number {
    return Array.isArray(list) ? list.length : 0;
  }
}
