import { Component, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription, forkJoin, of } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { HttpEventType } from '@angular/common/http';
import { saveAs } from 'file-saver';
import { CustomerService } from 'src/app/core/services/customer/customer.service';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { getEmployee } from 'src/app/shared/interfaces/employee.interface';
import { CustomerAttachment, CustomerStatus, getCustomer, getFilteredCustomer } from 'src/app/shared/interfaces/customer.interface';
import { ConfirmDialogService } from 'src/app/shared/components/confirm-dialog';
import { DataGridComponent } from 'src/app/shared/components/data-grid/data-grid.component';
import {
  DataGridBreadcrumb, DataGridBulkAction, DataGridBulkActionEvent, DataGridColumn, DataGridDetailTab,
  DataGridQuery, DataGridRowAction, DataGridRowActionEvent, DataGridView,
} from 'src/app/shared/components/data-grid/data-grid.model';
import { DetailOverviewComponent } from 'src/app/shared/components/detail-panel/detail-overview.component';
import { DetailDocumentsComponent } from 'src/app/shared/components/detail-panel/detail-documents.component';
import { DetailOverviewSection, DetailDocument } from 'src/app/shared/components/detail-panel/detail-panel.model';
import { FormatStringPipe } from 'src/app/shared/pipes/formatString.pipe';
import { NgFor, NgIf, NgSwitch, NgSwitchCase } from '@angular/common';
import { FormControl, FormsModule } from '@angular/forms';
import { ModalService } from 'src/app/shared/components/modal';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { DetailAvatarComponent } from 'src/app/shared/components/detail-panel/detail-avatar.component';
import { SfOption } from 'src/app/shared/components/smart-form/sf.model';
import { SmartFormModule } from 'src/app/shared/components/smart-form';
import { CustomerFormDrawerComponent } from '../customer-form-drawer/customer-form-drawer.component';
import { CustomerPickerPanelComponent } from '../../components/picker-panel/picker-panel.component';
import { ChangeCustomerStatusComponent, ChangeCustomerStatusModalData, ChangeCustomerStatusModalResult } from '../change-customer-status/change-customer-status.component';

@Component({
  selector: 'app-customers-list',
  templateUrl: './customers-list.component.html',
  styleUrls: ['./customers-list.component.css'],
  imports: [NgSwitch, NgSwitchCase, NgFor, NgIf, FormsModule, DataGridComponent, DetailOverviewComponent, DetailDocumentsComponent, DetailAvatarComponent, ActionButtonComponent, SmartFormModule, CustomerFormDrawerComponent, CustomerPickerPanelComponent],
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
  creditStatusFilter: string | null = null;

  columns: DataGridColumn<getCustomer>[] = [];
  rowActions: DataGridRowAction<getCustomer>[] = [];
  views: DataGridView<getCustomer>[] = [{ id: 'all', label: 'All' }];
  bulkActions: DataGridBulkAction[] = [{ id: 'delete', label: 'Delete', variant: 'danger' }];
  breadcrumbs: DataGridBreadcrumb[] = [{ label: 'Home', link: '/' }];
  private activeViewId = 'all';

  detailLoading = false;
  detailTabs: DataGridDetailTab[] = this.buildDetailTabs();

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
      { id: 'documents', label: 'Documents', icon: 'files' },
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
        key: 'status', label: 'Status', type: 'badge', width: '110px',
        valueGetter: (r) => r.status,
        badgeClasses: {
          Active: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
          Inactive: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
          Blacklisted: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300',
          'On Hold': 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
          Prospect: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
        },
      },
      {
        key: 'shared', label: 'Shared', type: 'badge', width: '100px',
        valueGetter: (r) => (r.sharedWith?.length ? 'Shared' : null),
        badgeClasses: { Shared: 'bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300' },
      },
      { key: 'paymentTerms', label: 'Payment Terms', valueGetter: (r) => r.paymentTerms || '' },
      {
        key: 'creditStatus', label: 'Credit Status', type: 'badge', width: '120px',
        valueGetter: (r) => r.creditStatus,
        badgeClasses: {
          'Good Standing': 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
          Watch: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
          Hold: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300',
          Exceeded: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300',
        },
      },
    ];
  }

  private buildRowActions(): void {
    this.rowActions = [
      { id: 'edit', label: 'Edit', icon: 'pencil', quick: true },
      { id: 'changeStatus', label: 'Change Status', icon: 'flag' },
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
      creditStatus: this.creditStatusFilter,
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
    this.creditStatusFilter = null;
    for (const f of query.filters) {
      if (f.key === 'createdBy') this.selectedEmployee = f.value;
      if (f.key === 'creditStatus') this.creditStatusFilter = f.value;
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
          { type: 'field', label: 'Status', value: c.status, noHover: true },
          ...(c.statusReason ? [{ type: 'field' as const, label: 'Status Reason', value: c.statusReason, noHover: true }] : []),
        ],
      },
      {
        title: 'Contact',
        columns: '2',
        fields: [
          { type: 'field', label: 'Email', value: c.customerEmailId, noHover: true },
          { type: 'field', label: 'Contact No.', value: c.contactNo, noHover: true },
          { type: 'field', label: 'Billing Address', value: c.companyAddress, noHover: true },
          { type: 'field', label: 'Shipping Address', value: c.sameAsBilling ? 'Same as billing' : (c.shippingAddress || '—'), noHover: true },
          { type: 'field', label: 'TRN / VAT Number', value: c.trn || '—', noHover: true },
        ],
      },
      {
        title: 'Commercial Terms',
        columns: '2',
        fields: [
          { type: 'field', label: 'Payment Terms', value: c.paymentTerms || '—', noHover: true },
          { type: 'field', label: 'Credit Limit', value: c.creditLimit != null ? String(c.creditLimit) : '—', noHover: true },
          { type: 'field', label: 'Credit Status', value: c.creditStatus || '—', noHover: true },
          { type: 'field', label: 'Currency', value: c.currency || '—', noHover: true },
          { type: 'field', label: 'Source', value: c.source || '—', noHover: true },
          { type: 'field', label: 'Tax', value: c.taxExempt ? 'Tax exempt' : 'VAT applies', noHover: true },
        ],
      },
      ...((c.shippingSites?.length)
        ? [{
            title: 'Ship-to Sites',
            columns: '2' as const,
            fields: c.shippingSites.map((s) => ({
              type: 'field' as const,
              label: s.siteName,
              value: [s.address?.line1, s.address?.city, s.address?.country].filter(Boolean).join(', ') || '—',
              noHover: true,
            })),
          }]
        : []),
    ];
  }

  contactRows(row: getCustomer): Record<string, any>[] {
    return (this.detail(row).contactDetails ?? []).map((c) => ({
      name: `${c.courtesyTitle ? c.courtesyTitle + '. ' : ''}${c.firstName} ${c.lastName}`.trim() + (c.isPrimary ? ' (Primary)' : ''),
      designation: (c.designation || '—') + (c.role ? ' · ' + c.role : ''),
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
      case 'changeStatus':
        this.onChangeStatus(row);
        break;
      case 'viewShared':
        this.grid.activeTab = 'share';
        this.grid.openRow(row);
        break;
      case 'share':
        this.grid.activeTab = 'share';
        this.grid.openRow(row);
        this.openPicker(row, 'Share');
        break;
      case 'transfer':
        this.grid.activeTab = 'transfer';
        this.grid.openRow(row);
        this.openPicker(row, 'Transfer');
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

  // Inline share/transfer picker shown in the detail panel (no modal) --------------
  pickerType: 'Share' | 'Transfer' | null = null;
  pickerLoading = false;
  pickerSaving = false;
  employeeOptions: SfOption[] = [];
  shareControl = new FormControl<string[]>([]);
  transferControl = new FormControl<string | null>(null);

  openPicker(row: getCustomer, type: 'Share' | 'Transfer'): void {
    this.pickerType = type;
    this.pickerLoading = true;
    this.shareControl.setValue([]);
    this.transferControl.setValue(null);
    this._employeeService.getEmployeesForCustomerTransfer(row._id).subscribe({
      next: (employees) => {
        this.employeeOptions = (employees || []).map((e) => ({ value: e._id!, label: `${e.firstName} ${e.lastName}` }));
        this.pickerLoading = false;
      },
      error: () => { this.pickerLoading = false; },
    });
  }

  closePicker(): void {
    this.pickerType = null;
  }

  async confirmPicker(row: getCustomer): Promise<void> {
    const type = this.pickerType;
    if (!type) return;
    const value = type === 'Transfer' ? this.transferControl.value : this.shareControl.value;
    const employees = (Array.isArray(value) ? value : value ? [value] : []) as string[];
    if (!employees.length) return;

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

    this.pickerSaving = true;
    this._customerService
      .shareOrTransferCustomer({ customerId: row._id, employees, type })
      .subscribe({
        next: () => {
          this.pickerSaving = false;
          this.pickerType = null;
          this.toaster.success(type === 'Share' ? 'Customer shared' : 'Customer transferred');
          if (type === 'Transfer') this.grid?.closeDetail();
          this.getAllCustomers(() => { if (type === 'Share') this.onRowOpen(row); });
        },
        error: (error) => {
          this.pickerSaving = false;
          this.toaster.error(error?.error?.message || `Failed to ${type.toLowerCase()} customer`);
        },
      });
  }

  onChangeStatus(row: getCustomer): void {
    const current = this.detail(row);
    const data: ChangeCustomerStatusModalData = { currentStatus: current.status, context: row.companyName };
    this.modal
      .open<ChangeCustomerStatusModalResult>(ChangeCustomerStatusComponent, { width: '480px', data })
      .afterClosed()
      .subscribe((res) => {
        if (!res) return;
        this._customerService.updateCustomerStatus({ id: row._id, status: res.status, reason: res.reason }).subscribe({
          next: () => {
            this.toaster.success('Customer status updated');
            this.details.delete(row._id);
            this.getAllCustomers(() => this.onRowOpen(row));
          },
          error: (error) => this.toaster.error(error?.error?.message || 'Failed to update status'),
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

  // --- Documents (detail-panel tab) ------------------------------------------------

  uploadRowId: string | null = null;
  isUploadingFiles = false;
  pendingFiles: File[] = [];
  readonly acceptedFiles = '.jpg,.jpeg,.png,.pdf,.doc,.docx,.xlsx,.msg,.dwg';

  customerDocuments(row: getCustomer): DetailDocument[] {
    return (this.detail(row).attachments ?? []).map((file: CustomerAttachment) => ({
      id: file.fileName,
      name: file.originalname,
    }));
  }

  documentRemoveDetails(row: getCustomer) {
    return (doc: DetailDocument) => [
      { label: 'Customer', value: row.companyName ?? '' },
      { label: 'File Name', value: doc.name },
    ];
  }

  startAttachmentUpload(row: getCustomer): void {
    this.uploadRowId = row._id;
    this.pendingFiles = [];
  }

  cancelAttachmentUpload(): void {
    this.uploadRowId = null;
    this.pendingFiles = [];
  }

  /** Existing files are re-sent because the server replaces the whole set. */
  uploadAttachments(row: getCustomer): void {
    if (!this.pendingFiles.length || this.isUploadingFiles) return;
    const current = this.detail(row);
    const formData = new FormData();
    this.pendingFiles.forEach((file) => formData.append('files', file));
    if (current.attachments?.length) formData.append('existingFiles', JSON.stringify(current.attachments));

    this.isUploadingFiles = true;
    this._customerService.updateCustomerAttachments(row._id, formData).subscribe({
      next: (res) => {
        this.details.set(row._id, { ...current, attachments: res.data?.attachments || [] });
        this.isUploadingFiles = false;
        this.cancelAttachmentUpload();
        this.toaster.success('Files uploaded successfully');
      },
      error: () => {
        this.isUploadingFiles = false;
        this.toaster.error('Failed to upload files');
      },
    });
  }

  onDocumentOpen(row: getCustomer, document: DetailDocument): void {
    this.onDocumentDownload(row, document);
  }

  onDocumentDownload(row: getCustomer, document: DetailDocument): void {
    this._customerService.downloadFile(document.id).subscribe({
      next: (event) => {
        if (event.type === HttpEventType.Response) {
          saveAs(new Blob([event.body]), document.name);
        }
      },
      error: (error) => {
        if (error.status === 404) this.toaster.warning('Sorry, the requested file was not found on the server.');
        else this.toaster.error('An error occurred while downloading the file.');
      },
    });
  }

  onDocumentRemove(row: getCustomer, document: DetailDocument): void {
    const current = this.detail(row);
    this._customerService.removeCustomerAttachment(row._id, document.id).subscribe({
      next: (res: any) => {
        this.details.set(row._id, { ...current, attachments: res?.data?.attachments ?? (current.attachments ?? []).filter((f) => f.fileName !== document.id) });
        this.toaster.success('File deleted');
      },
      error: () => this.toaster.error('Failed to delete file'),
    });
  }
}
