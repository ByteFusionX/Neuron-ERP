import { Component, ViewChild, inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { MatDialog } from '@angular/material/dialog';
import { forkJoin, Subscription } from 'rxjs';
import { PurchaseService } from 'src/app/core/services/purchase/purchase.service';
import { ApprovalStatusComponent, ApprovalStatusData } from 'src/app/shared/components/approval-status/approval-status.component';
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
import { DetailTimelineComponent } from 'src/app/shared/components/detail-panel/detail-timeline.component';
import { DetailOverviewSection, DetailTableColumn, DetailTimelineEntry } from 'src/app/shared/components/detail-panel/detail-panel.model';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { CreatePurchaseComponent } from '../create-purchase/create-purchase.component';

type SourceType = 'job' | 'manual';

const ALL_STATUSES = ['Pending', 'Drafted', 'Rejected', 'Approved'];
const PENDING_STATUSES = ['Pending', 'Drafted', 'Rejected'];
const APPROVED_STATUSES = ['Approved'];
const DRAFT_STATUSES = ['Drafted'];

const STATUS_BADGE_CLASSES: Record<string, string> = {
  Approved: 'bg-emerald-50 text-emerald-700 ring-emerald-200 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900 dark:border-emerald-900',
  Pending: 'bg-amber-50 text-amber-700 ring-amber-200 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900 dark:border-amber-900',
  Drafted: 'bg-gray-100 text-gray-700 ring-gray-200 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700 dark:border-gray-700',
  Rejected: 'bg-red-50 text-red-700 ring-red-200 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900 dark:border-red-900',
};

@Component({
  selector: 'app-purchase-request-list',
  imports: [CommonModule, DataGridComponent, DetailOverviewComponent, DetailTableComponent, DetailTimelineComponent, ActionButtonComponent, CreatePurchaseComponent],
  providers: [DatePipe],
  templateUrl: './purchase-request-list.component.html',
  styleUrl: './purchase-request-list.component.css',
})
export class PurchaseRequestListComponent {
  @ViewChild('grid') grid!: DataGridComponent<any>;

  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private purchaseService = inject(PurchaseService);
  private notificationService = inject(ToastrService);
  private dialog = inject(MatDialog);
  private datePipe = inject(DatePipe);
  private subscriptions = new Subscription();

  detailLoading = false;
  detailTabs: DataGridDetailTab[] = [
    { id: 'overview', label: 'Details', icon: 'info' },
    { id: 'items', label: 'Items', icon: 'card' },
    { id: 'history', label: 'History', icon: 'activity' },
  ];

  readonly itemColumns: DetailTableColumn[] = [
    { key: 'item', label: 'Item' },
    { key: 'qty', label: 'Qty', type: 'number' },
    { key: 'price', label: 'Price', type: 'currency' },
    { key: 'amount', label: 'Amount', type: 'currency', total: true },
  ];

  rows: any[] = [];
  total = 0;
  isLoading = false;

  breadcrumbs: DataGridBreadcrumb[] = [{ label: 'Home', link: '/' }, { label: 'Purchase' }, { label: 'PR' }];
  views: DataGridView<any>[] = [
    { id: 'all', label: 'All' },
    { id: 'pending', label: 'Pending' },
    { id: 'approved', label: 'Approved' },
    { id: 'draft', label: 'Draft' },
    { id: 'general', label: 'General' },
  ];
  columns: DataGridColumn<any>[] = [];
  rowActions: DataGridRowAction<any>[] = [];

  private activeViewId = 'all';

  page = 1;
  row = 10;
  searchQuery = '';
  sortKey: string | null = null;
  sortDir: 'asc' | 'desc' | null = null;

  ngOnInit(): void {
    this.buildColumns();
    this.buildRowActions();

    this.route.queryParams.subscribe((params) => {
      this.page = params['page'] ? parseInt(params['page'], 10) : 1;
      this.row = params['row'] ? parseInt(params['row'], 10) : 10;
      this.searchQuery = params['search'] || '';
      if (this.grid) this.grid.page = this.page;

      this.getPurchases();
    });
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  private buildColumns(): void {
    this.columns = [
      { key: 'date', label: 'Date', type: 'date', sortable: true, width: '120px', valueGetter: (r) => r.approvedDate || r.createdAt },
      { key: 'customerName', label: 'Customer Name', valueGetter: (r) => r.customerId?.companyName },
      { key: 'purchaseNo', label: 'PR NO' },
      { key: 'jobId', label: 'Job ID', valueGetter: (r) => r.jobId?.jobId },
      {
        key: 'totalLpo', label: 'LPO Value',
        valueGetter: (r) => {
          const value = typeof r.totalLpo === 'number' ? r.totalLpo : parseFloat(r.totalLpo) || 0;
          const formatted = value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          return r.currency ? `${formatted} ${r.currency}` : formatted;
        },
      },
      { key: 'createdBy', label: 'Created By', valueGetter: (r) => r.createdBy ? `${r.createdBy.firstName} ${r.createdBy.lastName}` : '-' },
      { key: 'supplier', label: 'Supplier', valueGetter: (r) => r.supplierId?.supplierName || '-' },
      {
        key: 'procurementPerson', label: 'Procurement Person',
        valueGetter: (r) => r.procurementPerson?.firstName ? `${r.procurementPerson.firstName} ${r.procurementPerson.lastName}` : '-',
      },
      {
        key: 'status', label: 'Status', type: 'badge',
        valueGetter: (r) => r.status === 'Drafted' ? 'Drafted' : (r.overallStatus || r.status || 'Pending'),
        badgeClasses: STATUS_BADGE_CLASSES,
      },
    ];
  }

  private buildRowActions(): void {
    this.rowActions = [
      { id: 'viewApprovalStatus', label: 'View Approval Status', icon: 'eye', quick: true },
      { id: 'edit', label: 'Edit', icon: 'pencil', quick: true },
      {
        id: 'initiateLpo', label: 'Initiate LPO', icon: 'send', quick: true,
        hidden: (r) => (r.overallStatus || r.status) !== 'Approved',
      },
    ];
  }

  private statusesForView(viewId: string): string[] {
    switch (viewId) {
      case 'pending': return PENDING_STATUSES;
      case 'approved': return APPROVED_STATUSES;
      case 'draft': return DRAFT_STATUSES;
      default: return ALL_STATUSES;
    }
  }

  /** Only "General" scopes to manual (job-less) PRs; All/Pending/Approved span both sources. */
  private sourceTypeForView(viewId: string): SourceType | undefined {
    return viewId === 'general' ? 'manual' : undefined;
  }

  onQueryChange(query: DataGridQuery): void {
    this.searchQuery = query.search;
    this.page = query.page;
    this.row = query.pageSize;
    this.sortKey = query.sort.key;
    this.sortDir = query.sort.direction;
    this.activeViewId = query.viewId || 'all';

    this.getPurchases();
    this.updateUrlParams();
  }

  getPurchases(): void {
    this.isLoading = true;

    const filterParams = {
      page: this.page,
      row: this.row,
      status: this.statusesForView(this.activeViewId),
      search: this.searchQuery || undefined,
      sourceType: this.sourceTypeForView(this.activeViewId),
    };

    this.subscriptions.add(
      this.purchaseService.getPurchases(filterParams).subscribe({
        next: (response) => {
          this.rows = response.purchase.data;
          this.total = response.purchase.total;
          this.isLoading = false;
        },
        error: (error) => {
          this.notificationService.error('Failed to load purchases');
          console.error('Error loading purchases:', error);
          this.isLoading = false;
        },
      })
    );

    this.loadViewCounts();
  }

  private loadViewCounts(): void {
    const requests = this.views.reduce((acc, view) => {
      acc[view.id] = this.purchaseService.getPurchases({
        page: 1,
        row: 1,
        status: this.statusesForView(view.id),
        search: this.searchQuery || undefined,
        sourceType: this.sourceTypeForView(view.id),
      });
      return acc;
    }, {} as Record<string, ReturnType<PurchaseService['getPurchases']>>);

    this.subscriptions.add(
      forkJoin(requests).subscribe({
        next: (results) => {
          this.views = this.views.map((view) => ({
            ...view,
            count: results[view.id]?.purchase?.total ?? view.count,
          }));
        },
        error: (error) => console.error('Error loading view counts:', error),
      })
    );
  }

  updateUrlParams(): void {
    const queryParams: any = {
      page: this.page !== 1 ? this.page : null,
      row: this.row !== 10 ? this.row : null,
      search: this.searchQuery || null,
      view: this.activeViewId && this.activeViewId !== 'all' ? this.activeViewId : null,
    };

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  onRowAction(event: DataGridRowActionEvent<any>): void {
    const { action, row } = event;
    switch (action.id) {
      case 'viewApprovalStatus':
        this.viewApprovalStatus(row);
        break;
      case 'initiateLpo':
        this.router.navigate(['/purchase/initiate-lpo', row._id]);
        break;
      case 'edit':
        this.onEditPr(row);
        break;
    }
  }

  onRowOpen(): void {
    this.detailLoading = true;
    setTimeout(() => (this.detailLoading = false), 250);
  }

  openFullPurchase(row: any, event?: Event): void {
    event?.stopPropagation();
    this.router.navigate(['/purchase/view-purchase', row._id]);
  }

  prTitle = (r: any) => r.purchaseNo ?? '';
  prSubtitle = (r: any) => r.customerId?.companyName ?? '';

  formatAmount(row: any): string {
    const value = typeof row?.totalLpo === 'number' ? row.totalLpo : parseFloat(row?.totalLpo) || 0;
    const formatted = value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return row?.currency ? `${formatted} ${row.currency}` : formatted;
  }

  itemRows(row: any): Record<string, any>[] {
    const rows: Record<string, any>[] = [];
    (row.items ?? []).forEach((item: any) => {
      (item.itemDetails ?? []).forEach((d: any) => {
        rows.push({ item: d.detail, qty: d.quantity, price: d.unitCost, amount: (d.quantity ?? 0) * (d.unitCost ?? 0) });
      });
    });
    return rows;
  }

  historyEntries(row: any): DetailTimelineEntry[] {
    const approvalStatus: any[] = row?.approvalStatus ?? [];
    return approvalStatus.map((approval) => {
      const by = approval.updatedBy ? `${approval.updatedBy.firstName} ${approval.updatedBy.lastName}` : 'Pending';
      const when = approval.updatedAt ? this.datePipe.transform(approval.updatedAt, 'dd MMM yyyy, h:mm a') : '';
      const tone = approval.status === 'approved' ? 'good' : approval.status === 'rejected' ? 'bad' : 'neutral';
      return {
        text: `Step ${approval.step} ${approval.status || 'pending'}`,
        meta: [by, when].filter(Boolean).join(' · '),
        tone,
      } as DetailTimelineEntry;
    });
  }

  overviewSections(row: any): DetailOverviewSection[] {
    return [
      {
        title: 'General',
        columns: '2',
        fields: [
          { type: 'field', label: 'PR No', value: row.purchaseNo, numeric: true },
          { type: 'dg', key: 'status' },
          { type: 'field', label: 'Customer', value: row.customerId?.companyName },
          { type: 'field', label: 'Job ID', value: row.jobId?.jobId },
          { type: 'field', label: 'Supplier', value: row.supplierId?.supplierName || '-' },
          { type: 'field', label: 'Date', value: this.datePipe.transform(row.approvedDate || row.createdAt, 'dd MMM yyyy') },
          { type: 'field', label: 'Created By', value: row.createdBy ? `${row.createdBy.firstName} ${row.createdBy.lastName}` : '-' },
          { type: 'field', label: 'Procurement Person', value: row.procurementPerson?.firstName ? `${row.procurementPerson.firstName} ${row.procurementPerson.lastName}` : '-' },
        ],
      },
      {
        title: 'Overview',
        fields: [
          { type: 'field', label: 'LPO Value', value: `${(row.totalLpo ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${row.currency ?? ''}`, numeric: true, noHover: true },
        ],
      },
    ];
  }

  viewApprovalStatus(purchase: any): void {
    if (!purchase) {
      this.notificationService.error('Purchase data is missing');
      return;
    }
    try {
      const dialogData: ApprovalStatusData = { entity: purchase, entityType: 'purchaseRequest' };
      this.dialog.open(ApprovalStatusComponent, { width: '800px', maxHeight: '90vh', data: dialogData });
    } catch (error) {
      console.error('Error opening approval status dialog:', error);
      this.notificationService.error('Failed to open approval status');
    }
  }

  // --- Create PR drawer ---------------------------------------------------------

  /** Mounted only while open, so each opening starts the form fresh. */
  createDrawerOpen = false;
  createDrawerWithoutJob = false;

  onCreatePr(): void {
    this.createDrawerWithoutJob = this.activeViewId === 'general';
    this.createDrawerOpen = true;
  }

  onCreateDrawerSaved(): void {
    this.getPurchases();
  }

  onCreateDrawerClosed(): void {
    this.createDrawerOpen = false;
  }

  // --- Edit PR drawer -------------------------------------------------------------

  /** Mounted only while open, so each opening starts from a fresh load of that PR. */
  editDrawerOpen = false;
  editDrawerPurchaseId: string | null = null;

  onEditPr(row: any, event?: Event): void {
    event?.stopPropagation();
    this.editDrawerPurchaseId = row._id;
    this.editDrawerOpen = true;
  }

  onEditDrawerSaved(): void {
    this.getPurchases();
  }

  onEditDrawerClosed(): void {
    this.editDrawerOpen = false;
    this.editDrawerPurchaseId = null;
  }
}
