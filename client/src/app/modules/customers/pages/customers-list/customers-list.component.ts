import { Component, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription, forkJoin, of } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { CustomerService } from 'src/app/core/services/customer/customer.service';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { getEmployee } from 'src/app/shared/interfaces/employee.interface';
import { getCustomer, getFilteredCustomer } from 'src/app/shared/interfaces/customer.interface';
import { ConfirmDialogService } from 'src/app/shared/components/confirm-dialog';
import { DataGridComponent } from 'src/app/shared/components/data-grid/data-grid.component';
import {
  DataGridBreadcrumb, DataGridBulkAction, DataGridBulkActionEvent, DataGridColumn, DataGridDetailTab,
  DataGridQuery, DataGridRowAction, DataGridRowActionEvent, DataGridView,
} from 'src/app/shared/components/data-grid/data-grid.model';
import { DetailOverviewComponent } from 'src/app/shared/components/detail-panel/detail-overview.component';
import { DetailTableComponent } from 'src/app/shared/components/detail-panel/detail-table.component';
import { DetailOverviewSection, DetailTableColumn } from 'src/app/shared/components/detail-panel/detail-panel.model';
import { FormatStringPipe } from 'src/app/shared/pipes/formatString.pipe';
import { NgFor, NgIf, NgSwitch, NgSwitchCase } from '@angular/common';
import { ModalService } from 'src/app/shared/components/modal';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { DetailAvatarComponent } from 'src/app/shared/components/detail-panel/detail-avatar.component';
import { ShareTransferCustomerComponent, ShareTransferModalData, ShareTransferModalResult } from '../share-transfer-customer/share-transfer-customer.component';
import { CustomerFormDrawerComponent } from '../customer-form-drawer/customer-form-drawer.component';

@Component({
  selector: 'app-customers-list',
  templateUrl: './customers-list.component.html',
  styleUrls: ['./customers-list.component.css'],
  imports: [NgSwitch, NgSwitchCase, NgFor, NgIf, DataGridComponent, DetailOverviewComponent, DetailTableComponent, DetailAvatarComponent, ActionButtonComponent, CustomerFormDrawerComponent],
})
export class CustomersListComponent implements OnInit, OnDestroy {
  @ViewChild('grid') grid!: DataGridComponent<getCustomer>;

  userId: string | undefined;
  shareAccess: boolean | undefined = false;
  transferAccess: boolean | undefined = false;
  createCustomer: boolean | undefined = false;
  private viewReport: string | undefined;

  isLoading = true;
  rows: getCustomer[] = [];
  total = 0;
  page = 1;
  row = 10;
  searchQuery = '';
  selectedEmployee: string | null = null;

  columns: DataGridColumn<getCustomer>[] = [];
  rowActions: DataGridRowAction<getCustomer>[] = [];
  views: DataGridView<getCustomer>[] = [{ id: 'all', label: 'All' }];
  bulkActions: DataGridBulkAction[] = [{ id: 'delete', label: 'Delete', variant: 'danger' }];
  breadcrumbs: DataGridBreadcrumb[] = [{ label: 'Home', link: '/' }];
  private activeViewId = 'all';

  detailLoading = false;
  detailTabs: DataGridDetailTab[] = this.buildDetailTabs();
  readonly contactColumns: DetailTableColumn[] = [
    { key: 'name', label: 'Name' },
    { key: 'email', label: 'Email' },
    { key: 'phoneNo', label: 'Phone No.' },
    { key: 'department', label: 'Department' },
  ];

  customerTitle = (r: getCustomer) => r.companyName ?? '';
  customerSubtitle = (r: getCustomer) => r.clientRef ?? '';

  /** Full record per customer, fetched (with the access check) the first time its panel opens. */
  private details = new Map<string, getCustomer>();

  private formatString = new FormatStringPipe();
  private modal = inject(ModalService);
  private confirm = inject(ConfirmDialogService);
  private subscriptions = new Subscription();

  constructor(
    private _customerService: CustomerService,
    private _router: Router,
    private _route: ActivatedRoute,
    private _employeeService: EmployeeService,
    private toaster: ToastrService,
  ) { }

  ngOnInit() {
    this.checkPermission();
    this.buildColumns();
    this.buildRowActions();
    this.loadCreators();

    this.subscriptions.add(
      this._route.queryParams.subscribe((params) => {
        this.page = params['page'] ? parseInt(params['page']) : 1;
        this.row = params['row'] ? parseInt(params['row']) : 10;
        if (this.grid) this.grid.page = this.page;
        this.selectedEmployee = params['employee'] || null;
        this.searchQuery = params['search'] || '';
        this.getAllCustomers();
        // Other modules hand over here with ?create=1 to start a new customer; the flag is consumed once.
        if (params['create'] && this.createCustomer) {
          this.onCreateCustomer();
          this.updateUrlParams();
        }
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  private checkPermission() {
    this.subscriptions.add(
      this._employeeService.employeeData$.subscribe((employee) => {
        const privileges = employee?.category.privileges.customer;
        this.createCustomer = privileges?.create;
        this.shareAccess = privileges?.share;
        this.transferAccess = privileges?.transfer;
        this.viewReport = privileges?.viewReport;
        this.userId = employee?._id;
        this.detailTabs = this.buildDetailTabs();
        if (employee?._id && this.views.length === 1) {
          this.views = [
            ...this.views,
            { id: 'mine', label: 'My Customers', filters: [{ id: 1, key: 'createdBy', op: 'eq', value: employee._id }] },
          ];
        }
      })
    );
  }

  /** Share needs the share privilege; Transfer stays visible so the owner rule can explain itself per row. */
  private buildDetailTabs(): DataGridDetailTab[] {
    return [
      { id: 'overview', label: 'Details', icon: 'info' },
      { id: 'contacts', label: 'Contacts', icon: 'users' },
      ...(this.shareAccess ? [{ id: 'share', label: 'Share', icon: 'send' }] : []),
      { id: 'transfer', label: 'Transfer', icon: 'transfer' },
    ];
  }

  private buildColumns(): void {
    this.columns = [
      { key: 'clientRef', label: 'Client Ref.', width: '140px' },
      { key: 'companyName', label: 'Customer' },
      { key: 'customerType', label: 'Type', valueGetter: (r) => this.formatString.transform(r.customerType?.customerTypeName) },
      { key: 'createdBy', label: 'Created by / Owner', valueGetter: (r) => this.ownerName(r) },
      { key: 'department', label: 'Department', valueGetter: (r) => r.department?.departmentName },
      { key: 'customerEmailId', label: 'Email' },
      {
        key: 'shared', label: 'Shared', type: 'badge', width: '100px',
        valueGetter: (r) => (r.sharedWith?.length ? 'Shared' : null),
        badgeClasses: { Shared: 'bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300' },
      },
    ];
  }

  private buildRowActions(): void {
    this.rowActions = [
      { id: 'edit', label: 'Edit', icon: 'pencil', quick: true },
      { id: 'viewShared', label: 'Shared With', icon: 'eye', hidden: (r) => !this.shareAccess || !r.sharedWith?.length },
      { id: 'share', label: 'Share', icon: 'send', hidden: () => !this.shareAccess },
      { id: 'transfer', label: 'Transfer', icon: 'transfer', hidden: (r) => !this.canTransfer(r) },
      { id: 'delete', label: 'Delete', icon: 'trash', variant: 'danger', divider: true },
    ];
  }

  private loadCreators(): void {
    this.subscriptions.add(
      this._customerService.getCustomerCreators().subscribe((creators) => {
        const editorOptions = creators.map((c) => ({ label: c.fullName, value: c._id }));
        this.columns = this.columns.map((c) => (c.key === 'createdBy' ? { ...c, editorOptions } : c));
      })
    );
  }

  /** Transferring ownership requires the transfer privilege; owning the customer alone is not enough. */
  private canTransfer(_r: getCustomer): boolean {
    return !!this.transferAccess;
  }

  private ownerName(r: getCustomer): string {
    const owner = r.createdBy as any;
    return owner ? `${owner.firstName ?? ''} ${owner.lastName ?? ''}`.trim() : '';
  }

  // --- Data ----------------------------------------------------------------------

  getAllCustomers(afterLoad?: () => void) {
    this.isLoading = true;
    const filterData = {
      page: this.page,
      row: this.row,
      createdBy: this.selectedEmployee,
      access: this.viewReport,
      userId: this.userId,
      search: this.searchQuery,
    };

    this.subscriptions.add(
      this._customerService.getCustomers(filterData).subscribe({
        next: (data: getFilteredCustomer) => {
          this.rows = data ? [...data.customers] : [];
          this.total = data ? data.total : 0;
          this.details.clear();
          this.refreshViewCounts();
          this.isLoading = false;
          afterLoad?.();
        },
        error: () => {
          this.isLoading = false;
        },
      })
    );
  }

  onQueryChange(query: DataGridQuery): void {
    this.searchQuery = query.search;
    this.page = query.page;
    this.row = query.pageSize;
    this.selectedEmployee = null;
    for (const f of query.filters) {
      if (f.key === 'createdBy') this.selectedEmployee = f.value;
    }
    this.getAllCustomers();
    this.updateUrlParams();
  }

  private updateUrlParams() {
    this._router.navigate([], {
      relativeTo: this._route,
      queryParams: {
        page: this.page !== 1 ? this.page : null,
        row: this.row !== 10 ? this.row : null,
        employee: this.selectedEmployee,
        search: this.searchQuery ? this.searchQuery : null,
        create: null,
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  onViewChange(view: DataGridView<getCustomer>) {
    this.activeViewId = view.id;
    this.refreshViewCounts();
  }

  /** Only the active tab has a known total (rows are server-paged), so the others show no badge. */
  private refreshViewCounts() {
    this.views = this.views.map((v) => ({ ...v, count: v.id === this.activeViewId ? this.total : undefined, hideCount: v.id !== this.activeViewId }));
  }

  // --- Detail panel -------------------------------------------------------------

  /** The full record once loaded, the list row until then. */
  detail(row: getCustomer): getCustomer {
    return this.details.get(row._id) ?? row;
  }

  onRowOpen(row: getCustomer): void {
    if (this.details.has(row._id)) return;
    this.detailLoading = true;
    this._customerService.getCustomerByClientRef(row.clientRef, this.viewReport, this.userId).subscribe({
      next: (res) => {
        this.detailLoading = false;
        if (res?.access) {
          this.details.set(row._id, res.customerData);
        } else {
          this.toaster.warning('This customer detail cannot be displayed to you due to the permissions assigned');
          this.grid.closeDetail();
        }
      },
      error: () => {
        this.detailLoading = false;
      },
    });
  }

  overviewSections(row: getCustomer): DetailOverviewSection[] {
    const c = this.detail(row);
    return [
      {
        title: 'General',
        columns: '2',
        fields: [
          { type: 'field', label: 'Client Ref Id', value: c.clientRef, numeric: true, noHover: true },
          { type: 'field', label: 'Customer Type', value: this.formatString.transform(c.customerType?.customerTypeName), noHover: true },
          { type: 'field', label: 'Company Name', value: c.companyName, noHover: true },
          { type: 'field', label: 'Department', value: c.department?.departmentName, noHover: true },
          { type: 'field', label: 'Created by / Owner', value: this.ownerName(c), noHover: true },
        ],
      },
      {
        title: 'Contact',
        columns: '2',
        fields: [
          { type: 'field', label: 'Email', value: c.customerEmailId, noHover: true },
          { type: 'field', label: 'Contact No.', value: c.contactNo, noHover: true },
          { type: 'field', label: 'Company Address', value: c.companyAddress, noHover: true },
        ],
      },
    ];
  }

  contactRows(row: getCustomer): Record<string, any>[] {
    return (this.detail(row).contactDetails ?? []).map((c) => ({
      name: `${c.courtesyTitle ? c.courtesyTitle + '. ' : ''}${c.firstName} ${c.lastName}`.trim(),
      email: c.email,
      phoneNo: c.phoneNo,
      department: c.department?.departmentName ?? '',
    }));
  }

  // --- Actions -------------------------------------------------------------------

  // --- Customer form drawer (create and edit) --------------------------------------

  formOpen = false;
  formMode: 'create' | 'edit' = 'create';
  formCustomer: getCustomer | null = null;

  onCreateCustomer(): void {
    this.formMode = 'create';
    this.formCustomer = null;
    this.formOpen = true;
  }

  onFormSaved(): void {
    this.details.clear();
    this.getAllCustomers();
  }

  onRowAction({ action, row }: DataGridRowActionEvent<getCustomer>): void {
    switch (action.id) {
      case 'edit':
        this.formMode = 'edit';
        this.formCustomer = this.detail(row);
        this.formOpen = true;
        break;
      case 'viewShared':
        this.grid.activeTab = 'share';
        this.grid.openRow(row);
        break;
      case 'share':
        this.onShareOrTransfer(row, 'Share');
        break;
      case 'transfer':
        this.onShareOrTransfer(row, 'Transfer');
        break;
      case 'delete':
        void this.deleteCustomers([row]);
        break;
    }
  }

  onBulkAction({ action, rows }: DataGridBulkActionEvent<getCustomer>, grid: DataGridComponent<getCustomer>): void {
    if (action.id !== 'delete') return;
    void this.deleteCustomers(rows, grid);
  }

  private async deleteCustomers(rows: getCustomer[], grid?: DataGridComponent<getCustomer>): Promise<void> {
    const count = rows.length === 1 ? `"${rows[0].companyName}"` : `${rows.length} customers`;
    const { confirmed } = await this.confirm.open({
      tone: 'reject',
      title: rows.length === 1 ? 'Delete customer?' : `Delete ${count}?`,
      message: `Are you sure you want to delete ${count}?`,
      consequence: 'This cannot be undone.',
      confirmLabel: 'Delete',
    });
    if (!confirmed) return;

    const employee = this._employeeService.employeeToken();
    const requests = rows.map((r) => this._customerService.deleteCustomer({ dataId: r._id, employeeId: employee.id }));
    forkJoin(requests.length ? requests : [of(null)]).subscribe({
      next: () => {
        grid?.clearSelection();
        this.grid?.closeDetail();
        this.toaster.success(rows.length === 1 ? 'Customer deleted successfully' : `${rows.length} customers deleted`);
        this.getAllCustomers();
      },
      error: (error) => {
        this.toaster.error(error?.error?.message || 'Failed to delete customer');
      },
    });
  }

  // --- Share / transfer (detail-panel tabs) -----------------------------------------

  /** The API populates sharedWith with employees even though the interface types it as ids. */
  sharedEmployees(row: getCustomer): getEmployee[] {
    return ((this.detail(row) as any).sharedWith as getEmployee[] | undefined) ?? [];
  }

  ownerLabel(row: getCustomer): string {
    return this.ownerName(this.detail(row));
  }

  canTransferRow(row: getCustomer): boolean {
    return this.canTransfer(this.detail(row));
  }

  onShareOrTransfer(row: getCustomer, type: 'Share' | 'Transfer'): void {
    const data: ShareTransferModalData = { type, customerId: row._id, context: row.companyName };
    this.modal
      .open<ShareTransferModalResult>(ShareTransferCustomerComponent, { width: '520px', data })
      .afterClosed()
      .subscribe(async (res) => {
        if (!res) return;
        if (type === 'Transfer') {
          const { confirmed } = await this.confirm.open({
            tone: 'reject',
            title: 'Transfer customer?',
            message: `Transfer ownership of "${row.companyName}" to the selected employee?`,
            consequence: 'You will lose owner-level access to this customer.',
            confirmLabel: 'Transfer',
          });
          if (!confirmed) return;
        }
        this._customerService
          .shareOrTransferCustomer({ customerId: row._id, employees: res.employees, type: res.type })
          .subscribe({
            next: () => {
              this.toaster.success(type === 'Share' ? 'Customer shared' : 'Customer transferred');
              if (type === 'Transfer') this.grid?.closeDetail();
              this.getAllCustomers(() => { if (type === 'Share') this.onRowOpen(row); });
            },
            error: (error) => this.toaster.error(error?.error?.message || `Failed to ${type.toLowerCase()} customer`),
          });
      });
  }

  async stopSharing(row: getCustomer, employee: getEmployee): Promise<void> {
    const { confirmed } = await this.confirm.open({
      tone: 'reject',
      title: 'Stop sharing?',
      message: `Remove ${employee.firstName} ${employee.lastName}'s access to "${row.companyName}"?`,
      consequence: 'This removes all access to the customer for this employee.',
      confirmLabel: 'Stop sharing',
    });
    if (!confirmed) return;

    this._customerService.stopSharingCustomer({ customerId: row._id, employeeId: employee._id! }).subscribe({
      next: () => {
        this.toaster.success('Sharing stopped successfully');
        this.getAllCustomers(() => this.onRowOpen(row));
      },
      error: () => this.toaster.warning('Failed to stop sharing'),
    });
  }
}
