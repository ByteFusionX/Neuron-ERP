import { CommonModule, DatePipe } from '@angular/common';
import { Component, ViewChild, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { forkJoin, Subscription } from 'rxjs';
import { PurchaseService } from 'src/app/core/services/purchase/purchase.service';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { ApprovalStatusComponent, ApprovalStatusData } from 'src/app/shared/components/approval-status/approval-status.component';
import { ModalService } from 'src/app/shared/components/modal';
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
import { DetailOverviewSection, DetailTableColumn, DetailTimelineEntry } from 'src/app/shared/components/detail-panel/detail-panel.model';
import { DetailOverviewComponent } from 'src/app/shared/components/detail-panel/detail-overview.component';
import { DetailTableComponent } from 'src/app/shared/components/detail-panel/detail-table.component';
import { DetailTimelineComponent } from 'src/app/shared/components/detail-panel/detail-timeline.component';
import { CreatePurchaseComponent } from '../create-purchase/create-purchase.component';

const ALL_STATUSES = ['Pending', 'Drafted', 'Approved'];
const DRAFT_STATUSES = ['Drafted'];
const PENDING_STATUSES = ['Pending'];
const APPROVED_STATUSES = ['Approved'];

const STATUS_BADGE_CLASSES: Record<string, string> = {
  Approved: 'bg-emerald-50 text-emerald-700 ring-emerald-200 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900 dark:border-emerald-900',
  Pending: 'bg-amber-50 text-amber-700 ring-amber-200 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900 dark:border-amber-900',
  Drafted: 'bg-gray-100 text-gray-700 ring-gray-200 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700 dark:border-gray-700',
};

@Component({
  selector: 'app-general-purchase-list',
  imports: [CommonModule, DataGridComponent, DetailOverviewComponent, DetailTableComponent, DetailTimelineComponent, ActionButtonComponent, CreatePurchaseComponent],
  providers: [DatePipe],
  templateUrl: './general-purchase-list.component.html',
  styleUrl: './general-purchase-list.component.css',
})
export class GeneralPurchaseListComponent {
  @ViewChild('grid') grid!: DataGridComponent<any>;

  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private purchaseService = inject(PurchaseService);
  private notificationService = inject(ToastrService);
  private modal = inject(ModalService);
  private datePipe = inject(DatePipe);
  private subscriptions = new Subscription();

  rows: any[] = [];
  total = 0;
  isLoading = false;
  detailLoading = false;

  breadcrumbs: DataGridBreadcrumb[] = [{ label: 'Home', link: '/' }, { label: 'Purchase' }, { label: 'General' }];
  views: DataGridView<any>[] = [
    { id: 'all', label: 'All' },
    { id: 'draft', label: 'Draft' },
    { id: 'pending', label: 'Pending' },
    { id: 'approved', label: 'Approved' },
    { id: 'completed', label: 'Completed' },
  ];
  detailTabs: DataGridDetailTab[] = [
    { id: 'overview', label: 'Details', icon: 'info' },
    { id: 'items', label: 'Items', icon: 'card' },
    { id: 'history', label: 'History', icon: 'activity' },
  ];
  itemColumns: DetailTableColumn[] = [
    { key: 'item', label: 'Item' },
    { key: 'qty', label: 'Qty', type: 'number' },
    { key: 'price', label: 'Price', type: 'currency' },
    { key: 'amount', label: 'Amount', type: 'currency', total: true },
  ];
  columns: DataGridColumn<any>[] = [];
  rowActions: DataGridRowAction<any>[] = [];

  private activeViewId = 'all';
  page = 1;
  row = 15;
  searchQuery = '';

  ngOnInit(): void {
    this.buildColumns();
    this.buildRowActions();

    this.route.queryParams.subscribe((params) => {
      this.page = params['page'] ? parseInt(params['page'], 10) : 1;
      this.row = params['row'] ? parseInt(params['row'], 10) : 10;
      this.searchQuery = params['search'] || '';
      this.activeViewId = params['view'] || 'all';
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
      { key: 'purchaseNo', label: 'Purchase No' },
      { key: 'supplier', label: 'Supplier', valueGetter: (r) => r.supplierId?.supplierName || '-' },
      { key: 'createdBy', label: 'Created By', valueGetter: (r) => this.createdBy(r) },
      {
        key: 'totalLpo', label: 'LPO Value',
        valueGetter: (r) => this.formatAmount(r),
      },
      { key: 'remainingPoQuantity', label: 'Remaining', align: 'right', valueGetter: (r) => r.remainingPoQuantity ?? '-' },
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
      case 'draft': return DRAFT_STATUSES;
      case 'pending': return PENDING_STATUSES;
      case 'completed':
      case 'approved': return APPROVED_STATUSES;
      default: return ALL_STATUSES;
    }
  }

  private poProgressForView(viewId: string): 'completed' | undefined {
    return viewId === 'completed' ? 'completed' : undefined;
  }

  onQueryChange(query: DataGridQuery): void {
    this.searchQuery = query.search;
    this.page = query.page;
    this.row = query.pageSize;
    this.activeViewId = query.viewId || 'all';
    this.getPurchases();
    this.updateUrlParams();
  }

  getPurchases(): void {
    this.isLoading = true;
    this.subscriptions.add(
      this.purchaseService.getPurchases({
        page: this.page,
        row: this.row,
        status: this.statusesForView(this.activeViewId),
        search: this.searchQuery || undefined,
        sourceType: 'manual',
        poProgress: this.poProgressForView(this.activeViewId),
      }).subscribe({
        next: (response) => {
          this.rows = response.purchase.data;
          this.total = response.purchase.total ?? 0;
          this.isLoading = false;
        },
        error: (error) => {
          this.notificationService.error('Failed to load general requests');
          console.error('Error loading general requests:', error);
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
        sourceType: 'manual',
        poProgress: this.poProgressForView(view.id),
      });
      return acc;
    }, {} as Record<string, ReturnType<PurchaseService['getPurchases']>>);

    this.subscriptions.add(
      forkJoin(requests).subscribe({
        next: (results) => {
          this.views = this.views.map((view) => ({
            ...view,
            count: results[view.id]?.purchase?.total ?? 0,
          }));
        },
        error: (error) => console.error('Error loading general counts:', error),
      })
    );
  }

  private updateUrlParams(): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        page: this.page !== 1 ? this.page : null,
        row: this.row !== 10 ? this.row : null,
        search: this.searchQuery || null,
        view: this.activeViewId !== 'all' ? this.activeViewId : null,
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  onRowAction(event: DataGridRowActionEvent<any>): void {
    const { action, row } = event;
    if (action.id === 'viewApprovalStatus') this.viewApprovalStatus(row);
    if (action.id === 'edit') this.onEditPurchase(row);
    if (action.id === 'initiateLpo') this.router.navigate(['/purchase/initiate-lpo', row._id]);
  }

  onRowOpen(): void {
    this.detailLoading = true;
    setTimeout(() => (this.detailLoading = false), 250);
  }

  openFullPurchase(row: any, event?: Event): void {
    event?.stopPropagation();
    this.router.navigate(['/purchase/view-purchase', row._id]);
  }

  purchaseTitle = (r: any) => r.purchaseNo ?? '';
  purchaseSubtitle = (r: any) => r.supplierId?.supplierName || this.createdBy(r);

  createdBy(row: any): string {
    return row.createdBy ? `${row.createdBy.firstName} ${row.createdBy.lastName}`.trim() : '-';
  }

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
          { type: 'field', label: 'Purchase No', value: row.purchaseNo, numeric: true },
          { type: 'dg', key: 'status' },
          { type: 'field', label: 'Supplier', value: row.supplierId?.supplierName || '-' },
          { type: 'field', label: 'Created By', value: this.createdBy(row) },
          { type: 'field', label: 'Date', value: this.datePipe.transform(row.approvedDate || row.createdAt, 'dd MMM yyyy') },
          { type: 'field', label: 'Remaining PO Qty', value: row.remainingPoQuantity ?? 0, numeric: true, noHover: true },
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
    const dialogData: ApprovalStatusData = { entity: purchase, entityType: 'purchaseRequest' };
    this.modal.open<void, ApprovalStatusData>(ApprovalStatusComponent, { width: '800px', data: dialogData });
  }

  createDrawerOpen = false;
  editDrawerOpen = false;
  editDrawerPurchaseId: string | null = null;

  onCreatePurchase(): void {
    this.createDrawerOpen = true;
  }

  onCreateDrawerSaved(): void {
    this.getPurchases();
  }

  onCreateDrawerClosed(): void {
    this.createDrawerOpen = false;
  }

  onEditPurchase(row: any, event?: Event): void {
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
