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
import { DetailOverviewSection, DetailTableColumn } from 'src/app/shared/components/detail-panel/detail-panel.model';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { ModalService } from 'src/app/shared/components/modal';
import { ResetWorkflowComponent, ResetWorkflowModalData } from 'src/app/modules/presales/pages/reset-workflow/reset-workflow.component';
import { WorkflowService } from 'src/app/core/services/workflow.service';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { WorkflowFeature } from 'src/app/shared/interfaces/workflow.interface';
import { ConfirmDialogService } from 'src/app/shared/components/confirm-dialog';

const ALL_STATUSES = ['Pending for Approval', 'Approved', 'Placed', 'Closed', 'Rejected'];
const PENDING_STATUSES = ['Pending for Approval'];
const APPROVED_STATUSES = ['Approved', 'Placed'];
const CLOSED_STATUSES = ['Closed'];
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
  imports: [CommonModule, DataGridComponent, DetailOverviewComponent, DetailTableComponent, ActionButtonComponent],
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
  private poWorkflowSteps: { id: string; label: string }[] = [];
  isSuperAdmin = false;
  canInitiateLPO = false;
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
    { id: 'partiallyReceived', label: 'Partially Received' },
    { id: 'closed', label: 'Completed' },
    { id: 'rejected', label: 'Rejected' },
  ];
  columns: DataGridColumn<any>[] = [];
  rowActions: DataGridRowAction<any>[] = [];
  detailTabs: DataGridDetailTab[] = [
    { id: 'overview', label: 'Details', icon: 'info' },
    { id: 'items', label: 'Items', icon: 'card' },
  ];

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
      { key: 'receiptStatus', label: 'Receipt', type: 'badge', align: 'center', badgeClasses: RECEIPT_BADGE_CLASSES },
      { key: 'poStatus', label: 'Status', type: 'badge', align: 'center', badgeClasses: STATUS_BADGE_CLASSES, badgeLabel: statusLabel },
    ];
  }

  private buildRowActions(): void {
    this.rowActions = [
      { id: 'openFullLpo', label: 'Open full PO', icon: 'eye', quick: true, panel: true },
      { id: 'resetWorkflow', label: 'Reset Workflow', icon: 'refresh', quick: true, hidden: (r) => r.poStatus !== 'Pending for Approval' || !this.isSuperAdmin },
      { id: 'place', label: 'Place order', icon: 'check', quick: true, hidden: (r) => r.poStatus !== 'Approved' || !this.canInitiateLPO },
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
      case 'partiallyReceived':
        return ['Placed', 'Closed'];
      case 'closed':
        return CLOSED_STATUSES;
      case 'rejected':
        return REJECTED_STATUSES;
      default:
        return ALL_STATUSES;
    }
  }

  private receiptStatusForView(viewId: string): string | undefined {
    return viewId === 'partiallyReceived' ? 'Partially Received' : undefined;
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
        receiptStatus: this.receiptStatusForView(this.activeViewId),
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
        receiptStatus: this.receiptStatusForView(view.id),
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
  }

  async placeOrder(row: any): Promise<void> {
    const { confirmed } = await this.confirmDialog.open({
      tone: 'approve',
      title: 'Place order',
      message: 'Confirm the order has been sent to the supplier. Goods can be received against it after this.',
      details: [
        { label: 'PO no', value: row.poNo || '-' },
        { label: 'Supplier', value: row.supplierId?.supplierName || '-' },
        { label: 'Total', value: this.formatAmount(row) },
      ],
      confirmLabel: 'Place order',
    });
    if (!confirmed) return;
    this.purchaseOrderService.placePurchaseOrder(row._id).subscribe({
      next: () => {
        this.notificationService.success('Order placed');
        this.loadData();
      },
      error: (error) => this.notificationService.error(error.error?.message || 'Failed to place the order'),
    });
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
