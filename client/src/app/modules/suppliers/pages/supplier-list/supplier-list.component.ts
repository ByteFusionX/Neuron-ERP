import { Component, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { DatePipe, DecimalPipe, NgClass, NgIf, NgSwitch, NgSwitchCase } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { ToastrService } from 'ngx-toastr';

import { SupplierService } from 'src/app/core/services/supplier.service';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { Supplier, SupplierListResponse, SupplierStatus } from 'src/app/shared/interfaces/suppliers.interface';
import { ConfirmDialogService } from 'src/app/shared/components/confirm-dialog';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { NumberFormatterPipe } from 'src/app/shared/pipes/numFormatter.pipe';

import { DataGridComponent } from 'src/app/shared/components/data-grid/data-grid.component';
import {
  DataGridBreadcrumb, DataGridCellEditEvent, DataGridColumn, DataGridDetailTab,
  DataGridQuery, DataGridRowAction, DataGridRowActionEvent, DataGridView,
} from 'src/app/shared/components/data-grid/data-grid.model';
import { DetailOverviewComponent } from 'src/app/shared/components/detail-panel/detail-overview.component';
import { DetailTableComponent } from 'src/app/shared/components/detail-panel/detail-table.component';
import { DetailTimelineComponent } from 'src/app/shared/components/detail-panel/detail-timeline.component';
import { DetailOverviewSection, DetailTableColumn, DetailTimelineEntry } from 'src/app/shared/components/detail-panel/detail-panel.model';
import { ViewToggleComponent } from 'src/app/shared/components/view-toggle/view-toggle.component';
import { SupplierFormDrawerComponent } from '../supplier-form-drawer/supplier-form-drawer.component';

/**
 * Suppliers module main page, rebuilt on the same data-grid + detail-panel pattern as
 * `quotation-list.component.ts`: one grid for the list, tabs-as-views, quick row actions, an
 * in-page detail panel (Detail / Banking Info / History) and a shared create+edit drawer.
 */
@Component({
  selector: 'app-supplier-list',
  templateUrl: './supplier-list.component.html',
  styleUrls: ['./supplier-list.component.css'],
  providers: [DatePipe, NumberFormatterPipe],
  imports: [
    NgIf, NgClass, NgSwitch, NgSwitchCase, DatePipe, DecimalPipe, FormsModule,
    DataGridComponent, DetailOverviewComponent, DetailTableComponent, DetailTimelineComponent,
    ActionButtonComponent, ViewToggleComponent, SupplierFormDrawerComponent,
  ],
})
export class SupplierListComponent implements OnInit, OnDestroy {
  @ViewChild('grid') grid!: DataGridComponent<Supplier>;

  isLoading = true;
  isFiltered = false;
  canCreate = false;
  canApproveSupplier = false;
  isSuperAdmin = false;

  rows: Supplier[] = [];
  total = 0;
  columns: DataGridColumn<Supplier>[] = [];
  rowActions: DataGridRowAction<Supplier>[] = [];
  views: DataGridView<Supplier>[] = [
    { id: 'all', label: 'All' },
    { id: 'pending', label: 'Pending', filters: [{ id: 1, key: 'status', op: 'eq', value: SupplierStatus.PENDING }] },
    { id: 'approved', label: 'Approved', filters: [{ id: 1, key: 'status', op: 'eq', value: SupplierStatus.APPROVED }] },
    { id: 'rejected', label: 'Rejected', filters: [{ id: 1, key: 'status', op: 'eq', value: SupplierStatus.REJECTED }] },
  ];
  breadcrumbs: DataGridBreadcrumb[] = [{ label: 'Home', link: '/' }, { label: 'Purchase' }, { label: 'Suppliers' }];

  detailTabs: DataGridDetailTab[] = [
    { id: 'detail', label: 'Detail', icon: 'info' },
    { id: 'banking', label: 'Banking Info', icon: 'wallet' },
    { id: 'history', label: 'History', icon: 'activity' },
  ];

  readonly productColumns: DetailTableColumn[] = [
    { key: 'productName', label: 'Product' },
    { key: 'contactName', label: 'Contact' },
    { key: 'contactEmail', label: 'Email' },
    { key: 'contactNo', label: 'Phone' },
    { key: 'paymentTerm', label: 'Payment Term' },
  ];

  readonly statusBadgeClasses: Record<string, string> = {
    [SupplierStatus.APPROVED]: 'bg-emerald-50 text-emerald-700 ring-emerald-200 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900 dark:border-emerald-900',
    [SupplierStatus.PENDING]: 'bg-amber-50 text-amber-700 ring-amber-200 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900 dark:border-amber-900',
    [SupplierStatus.REJECTED]: 'bg-red-50 text-red-700 ring-red-200 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900 dark:border-red-900',
  };

  supplierTitle = (r: Supplier) => r.supplierId ?? '';
  supplierSubtitle = (r: Supplier) => r.supplierName ?? '';

  private activeViewId = 'all';
  page = 1;
  row = 10;
  sortKey: string | null = null;
  sortDir: 'asc' | 'desc' | null = null;
  searchQuery = '';
  selectedStatus: string | null = null;
  selectedCategory: string | null = null;
  selectedSupplierType: string | null = null;
  fromDate: string | null = null;
  toDate: string | null = null;

  private confirm = inject(ConfirmDialogService);
  private subscriptions = new Subscription();

  // --- create/edit drawer -----------------------------------------------------------------
  formOpen = false;
  formMode: 'create' | 'edit' = 'create';
  formSupplier: Supplier | null = null;

  constructor(
    private _supplierService: SupplierService,
    private _employeeService: EmployeeService,
    private _router: Router,
    private _route: ActivatedRoute,
    private toaster: ToastrService,
    private datePipe: DatePipe,
    private numberFormat: NumberFormatterPipe,
  ) {}

  ngOnInit(): void {
    this.checkPermission();
    this.buildColumns();
    this.buildRowActions();

    this._route.queryParams.subscribe((params) => {
      this.page = params['page'] ? parseInt(params['page'], 10) : 1;
      this.row = params['row'] ? parseInt(params['row'], 10) : 10;
      if (this.grid) this.grid.page = this.page;
      this.searchQuery = params['search'] || '';
      this.fromDate = params['fromDate'] || null;
      this.toDate = params['toDate'] || null;
      this.selectedCategory = params['category'] || null;
      this.selectedSupplierType = params['supplierType'] || null;

      this.isFiltered = !!(this.searchQuery || this.fromDate || this.toDate || this.selectedCategory || this.selectedSupplierType);
      this.getSuppliers();
    });
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  private checkPermission(): void {
    this._employeeService.employeeData$.subscribe((employee) => {
      this.canCreate = true;
      this.canApproveSupplier = !!employee?.category?.privileges?.supplier?.canApproveSupplier;
      this.isSuperAdmin = employee?.category?.role === 'superAdmin';
    });
  }

  private buildColumns(): void {
    this.columns = [
      { key: 'supplierId', label: 'Supplier ID', sortable: true },
      { key: 'supplierName', label: 'Supplier Name', sortable: true },
      { key: 'category', label: 'Category', valueGetter: (r) => r.category?.departmentName },
      { key: 'supplierType', label: 'Type' },
      { key: 'location', label: 'Location', valueGetter: (r) => r.address?.location },
      { key: 'creditDays', label: 'Credit Days', type: 'number', align: 'right' },
      { key: 'creditValue', label: 'Credit Limit', type: 'number', align: 'right', valueGetter: (r) => Math.round(r.creditValue) },
      { key: 'status', label: 'Status', type: 'badge', badgeClasses: this.statusBadgeClasses },
      { key: 'createdDate', label: 'Created Date', type: 'date', sortable: true },
    ];
  }

  private buildRowActions(): void {
    this.rowActions = [
      {
        id: 'approve', label: 'Approve', icon: 'check', quick: true, panel: true,
        hidden: (r) => r.status !== SupplierStatus.PENDING || !this.canApproveSupplier,
      },
      {
        id: 'reject', label: 'Reject', icon: 'close', quick: true, panel: true,
        hidden: (r) => r.status !== SupplierStatus.PENDING || !this.canApproveSupplier,
      },
      {
        id: 'edit', label: 'Edit', icon: 'pencil', quick: true,
        hidden: (r) => r.status !== SupplierStatus.PENDING,
      },
      {
        id: 'block', label: 'Block Supplier', icon: 'close',
        hidden: (r) => r.status !== SupplierStatus.APPROVED || !!r.isBlocked,
      },
      {
        id: 'unblock', label: 'Unblock Supplier', icon: 'check',
        hidden: (r) => r.status !== SupplierStatus.APPROVED || !r.isBlocked,
      },
    ];
  }

  onRowAction(event: DataGridRowActionEvent<Supplier>): void {
    const { action, row } = event;
    switch (action.id) {
      case 'approve': this.approveSupplier(row); break;
      case 'reject': this.rejectSupplier(row); break;
      case 'edit': this.openEditDrawer(row); break;
      case 'block': this.toggleBlock(row); break;
      case 'unblock': this.toggleBlock(row); break;
    }
  }

  async approveSupplier(row: Supplier): Promise<void> {
    const { confirmed, reason } = await this.confirm.open({
      tone: 'approve',
      title: 'Approve Supplier',
      message: `Approve "${row.supplierName}"? It will become available for purchase orders.`,
      reason: 'optional',
    });
    if (!confirmed) return;
    this._supplierService.updateSupplierStatus(row._id, SupplierStatus.APPROVED, reason).subscribe({
      next: (res) => { row.status = res.data.status; this.grid.notify('Supplier approved'); },
      error: () => this.toaster.error('Failed to approve supplier'),
    });
  }

  async rejectSupplier(row: Supplier): Promise<void> {
    const { confirmed, reason } = await this.confirm.open({
      tone: 'reject',
      title: 'Reject Supplier',
      message: `Reject "${row.supplierName}"?`,
      reason: true,
      reasonLabel: 'Reason for rejection',
    });
    if (!confirmed) return;
    this._supplierService.updateSupplierStatus(row._id, SupplierStatus.REJECTED, reason).subscribe({
      next: (res) => { row.status = res.data.status; this.grid.notify('Supplier rejected'); },
      error: () => this.toaster.error('Failed to reject supplier'),
    });
  }

  async toggleBlock(row: Supplier): Promise<void> {
    const willBlock = !row.isBlocked;
    const { confirmed } = await this.confirm.open({
      tone: 'warning',
      title: willBlock ? 'Block Supplier' : 'Unblock Supplier',
      message: willBlock
        ? 'Blocking prevents any new purchase orders from being created for this supplier; existing orders are unaffected.'
        : 'This will allow new purchase orders to be created for this supplier again.',
    });
    if (!confirmed || !row._id) return;
    this._supplierService.blockSupplier(row._id).subscribe({
      next: (res) => { row.isBlocked = res.isBlocked; this.grid.notify(willBlock ? 'Supplier blocked' : 'Supplier unblocked'); },
      error: (error) => this.toaster.error(error?.error?.message || 'Failed to update supplier block status'),
    });
  }

  // --- create/edit drawer -----------------------------------------------------------------

  openCreateDrawer(): void {
    this.formMode = 'create';
    this.formSupplier = null;
    this.formOpen = true;
  }

  openEditDrawer(row: Supplier): void {
    this.formMode = 'edit';
    this.formSupplier = row;
    this.formOpen = true;
  }

  onFormClosed(): void {
    this.formOpen = false;
  }

  onCreateSupplier(): void {
    this.openCreateDrawer();
  }

  // --- grid wiring -------------------------------------------------------------------------

  onViewChange(view: DataGridView<Supplier>): void {
    this.activeViewId = view.id;
    this.refreshViewCounts();
  }

  private refreshViewCounts(): void {
    this.views = this.views.map((v) => ({ ...v, count: v.id === this.activeViewId ? this.total : undefined, hideCount: v.id !== this.activeViewId }));
  }

  onQueryChange(query: DataGridQuery): void {
    this.searchQuery = query.search;
    this.page = query.page;
    this.row = query.pageSize;
    this.sortKey = query.sort.key;
    this.sortDir = query.sort.direction;

    this.selectedStatus = null;
    this.selectedCategory = null;
    this.selectedSupplierType = null;
    this.fromDate = null;
    this.toDate = null;

    for (const f of query.filters) {
      switch (f.key) {
        case 'status': this.selectedStatus = f.value; break;
        case 'category': this.selectedCategory = f.value; break;
        case 'supplierType': this.selectedSupplierType = f.value; break;
        case 'createdDate':
          if (f.op === 'after' || f.op === 'on') this.fromDate = f.value;
          if (f.op === 'before' || f.op === 'on') this.toDate = f.value;
          break;
      }
    }

    this.isFiltered = !!(this.searchQuery || this.fromDate || this.toDate || this.selectedCategory || this.selectedSupplierType);
    this.getSuppliers();
    this.updateUrlParams();
  }

  private updateUrlParams(): void {
    const queryParams: any = {
      page: this.page !== 1 ? this.page : null,
      row: this.row !== 10 ? this.row : null,
      search: this.searchQuery || null,
      category: this.selectedCategory,
      supplierType: this.selectedSupplierType,
      fromDate: this.fromDate,
      toDate: this.toDate,
    };
    this._router.navigate([], { relativeTo: this._route, queryParams, queryParamsHandling: 'merge', replaceUrl: true });
  }

  getSuppliers(): void {
    this.isLoading = true;
    const params = {
      page: this.page,
      row: this.row,
      status: this.selectedStatus ? [this.selectedStatus] : undefined,
      category: this.selectedCategory || undefined,
      supplierType: this.selectedSupplierType || undefined,
      fromDate: this.fromDate || undefined,
      toDate: this.toDate || undefined,
      search: this.searchQuery || undefined,
    };
    this.subscriptions.add(
      this._supplierService.getSuppliers(params).subscribe({
        next: (res: SupplierListResponse) => {
          this.rows = res?.data?.suppliers ? [...res.data.suppliers] : [];
          this.total = res?.data?.pagination?.total ?? 0;
          this.refreshViewCounts();
          this.isLoading = false;
        },
        error: () => { this.isLoading = false; },
      })
    );
  }

  onRowOpen(): void {}

  onCellEdit(_e: DataGridCellEditEvent<Supplier>): void {}

  /** Filters handed to the Report tab, so switching keeps the same slice of data. */
  get reportQueryParams(): Record<string, string | null> {
    return { category: this.selectedCategory, supplierType: this.selectedSupplierType, fromDate: this.fromDate, toDate: this.toDate };
  }

  // --- detail panel content ------------------------------------------------------------------

  overviewSections(row: Supplier): DetailOverviewSection[] {
    return [
      {
        title: 'General',
        columns: '2',
        fields: [
          { type: 'field', label: 'Supplier Id', value: row.supplierId, numeric: true },
          { type: 'field', label: 'Status', value: row.status, pill: true, tone: this.statusTone(row.status) },
          { type: 'field', label: 'Category', value: row.category?.departmentName },
          { type: 'field', label: 'Supplier Type', value: row.supplierType },
          { type: 'field', label: 'Credit Days', value: row.creditDays, numeric: true },
          { type: 'field', label: 'Credit Limit', value: this.numberFormat.transform(row.creditValue), numeric: true },
          { type: 'field', label: 'Created Date', value: this.datePipe.transform(row.createdDate as any, 'dd MMM yyyy') },
          { type: 'field', label: 'Blocked', value: row.isBlocked ? 'Yes' : 'No', visible: row.status === SupplierStatus.APPROVED },
        ],
      },
      {
        title: 'Address',
        columns: '2',
        fields: [
          { type: 'field', label: 'Location', value: row.address?.location },
          { type: 'field', label: 'City', value: row.address?.city },
          { type: 'field', label: 'Street No', value: row.address?.streetNo },
          { type: 'field', label: 'Building No', value: row.address?.buildingNo },
          { type: 'field', label: 'Zone No', value: row.address?.zoneNo },
          { type: 'field', label: 'PO Box', value: row.address?.poBox },
        ],
      },
      {
        title: 'Contact',
        columns: '2',
        fields: [
          { type: 'field', label: 'Name', value: row.contactDetails?.name },
          { type: 'field', label: 'Email', value: row.contactDetails?.email },
          { type: 'field', label: 'Phone', value: row.contactDetails?.phoneNumber },
        ],
      },
    ];
  }

  bankingSections(row: Supplier): DetailOverviewSection[] {
    const bank = row.bankDetails;
    return [
      {
        title: 'Bank Details',
        columns: '2',
        visible: !!bank,
        emptyMessage: 'No banking information on file for this supplier.',
        fields: [
          { type: 'field', label: 'Bank Name', value: bank?.bankName },
          { type: 'field', label: 'Branch', value: bank?.branch },
          { type: 'field', label: 'Account Name', value: bank?.accountName },
          { type: 'field', label: 'Account Number', value: bank?.accountNumber, numeric: true },
          { type: 'field', label: 'IBAN', value: bank?.iban, numeric: true },
          { type: 'field', label: 'Swift Code', value: bank?.swiftCode },
          { type: 'field', label: 'Currency', value: bank?.currency },
          { type: 'field', label: 'Bank Country', value: bank?.bankCountry },
          { type: 'field', label: 'Bank Address', value: bank?.bankAddress },
        ],
      },
    ];
  }

  productRows(row: Supplier): Record<string, any>[] {
    return row.products || [];
  }

  /** Approved and rejected histories merged into one timeline, newest first. */
  historyEntries(row: Supplier): DetailTimelineEntry[] {
    const approved = (row.approvedHistory || []).map((h) => ({
      date: h.date,
      text: 'Approved',
      by: h.approvedBy ? `${h.approvedBy.firstName} ${h.approvedBy.lastName}` : '',
      reason: h.reason,
      tone: 'good' as const,
    }));
    const rejected = (row.rejectHistory || []).map((h) => ({
      date: h.date,
      text: 'Rejected',
      by: h.rejectedBy ? `${h.rejectedBy.firstName} ${h.rejectedBy.lastName}` : '',
      reason: h.reason,
      tone: 'bad' as const,
    }));
    return [...approved, ...rejected]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .map((h) => ({
        text: `${h.text}${h.by ? ` by ${h.by}` : ''}`,
        meta: [this.datePipe.transform(h.date as any, 'dd MMM yyyy, HH:mm'), h.reason].filter(Boolean).join(' · '),
        tone: h.tone,
      }));
  }

  private statusTone(status: SupplierStatus): 'good' | 'warn' | 'bad' {
    if (status === SupplierStatus.APPROVED) return 'good';
    if (status === SupplierStatus.REJECTED) return 'bad';
    return 'warn';
  }
}
