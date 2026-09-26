import { AfterViewInit, Component, Injector, ViewChild, inject } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { QuotationService } from 'src/app/core/services/quotation/quotation.service';
import { ContactDetail, getCustomer } from 'src/app/shared/interfaces/customer.interface';
import { getDepartment } from 'src/app/shared/interfaces/department.interface';
import { getEmployee } from 'src/app/shared/interfaces/employee.interface';
import { StatusChangeModalComponent, StatusChangeResult } from 'src/app/shared/components/status-change-modal/status-change-modal.component';
import { canSelectQuoteStatus, quoteStatusModalData } from '../status-update-modal/quote-status-modal.config';
import { getQuotation, Quotatation, QuoteStatus } from 'src/app/shared/interfaces/quotation.interface';
import { BehaviorSubject, Observable, Subscription, filter, forkJoin, of, shareReplay, switchMap, take } from 'rxjs';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { CustomerService } from 'src/app/core/services/customer/customer.service';
import { ProfileService } from 'src/app/core/services/profile/profile.service';
import { ConfirmDialogService } from 'src/app/shared/components/confirm-dialog';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { LoadingBarService } from '@ngx-loading-bar/core';
import { DealFormComponent } from '../deal-form/deal-form.component';
import { ExcelExportService } from 'src/app/core/services/export/excel-export.service';
import * as FileSaver from 'file-saver';
import { AsyncPipe, DatePipe, DecimalPipe, NgClass, NgComponentOutlet, NgFor, NgIf, NgSwitch, NgSwitchCase } from '@angular/common';
import { NumberFormatterPipe } from 'src/app/shared/pipes/numFormatter.pipe';
import { ToastrService } from 'ngx-toastr';
import { EventsListComponent } from 'src/app/shared/components/events-list/events-list.component';
import { EventsService } from 'src/app/core/services/events/events.service';
import { EventActionsService } from 'src/app/core/services/events/event-actions.service';
import { ModalService } from 'src/app/shared/components/modal';
import { EventCreateModalComponent, EventModalResult } from 'src/app/shared/components/detail-panel/task-create-modal/event-create-modal.component';
import { LpoUploadModalComponent } from './lpo-upload-modal.component';
import { Events } from 'src/app/shared/interfaces/evets.interface';
import { NgIcon } from '@ng-icons/core';
import { DataGridComponent } from 'src/app/shared/components/data-grid/data-grid.component';
import { DataGridBreadcrumb, DataGridBulkAction, DataGridBulkActionEvent, DataGridCellEditEvent, DataGridColumn, DataGridDetailTab, DataGridQuery, DataGridRowAction, DataGridRowActionEvent, DataGridView } from 'src/app/shared/components/data-grid/data-grid.model';
import { DataGridFieldComponent } from 'src/app/shared/components/data-grid/data-grid-field.component';
import { DetailFieldComponent } from 'src/app/shared/components/detail-panel/detail-field.component';
import { DetailSectionComponent } from 'src/app/shared/components/detail-panel/detail-section.component';
import { DetailOverviewComponent } from 'src/app/shared/components/detail-panel/detail-overview.component';
import { DetailDocumentsComponent } from 'src/app/shared/components/detail-panel/detail-documents.component';
import { DetailTableComponent } from 'src/app/shared/components/detail-panel/detail-table.component';
import { DealView, buildDealView, hasDeal } from '../deal-form/deal-view';
import { DetailTaskListComponent } from 'src/app/shared/components/detail-panel/detail-task-list.component';
import { DetailDocument, DetailOverviewSection, DetailTableColumn, DetailTaskItem } from 'src/app/shared/components/detail-panel/detail-panel.model';
import { SfOption, SmartFormModule } from 'src/app/shared/components/smart-form';
import { EnquiryService } from 'src/app/core/services/enquiry/enquiry.service';
import { HttpEventType } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { QuoteFormDrawerComponent } from '../quote-form-drawer/quote-form-drawer.component';
import { getEnquiry } from 'src/app/shared/interfaces/enquiry.interface';
import { RevisionHistoryModalComponent, RevisionHistoryModalData } from 'src/app/shared/components/revision-history-modal/revision-history-modal.component';

import { ViewToggleComponent } from 'src/app/shared/components/view-toggle/view-toggle.component';
@Component({
    selector: 'app-quotation-list',
    templateUrl: './quotation-list.component.html',
    styleUrls: ['./quotation-list.component.css'],
    providers: [NumberFormatterPipe, DatePipe],
    imports: [ViewToggleComponent, NgIcon, NgIf, NgClass, NgSwitch, NgSwitchCase, NgComponentOutlet, DatePipe, AsyncPipe, RouterLink, DataGridComponent, DataGridFieldComponent, DetailFieldComponent, DetailSectionComponent, DetailOverviewComponent, DetailDocumentsComponent, DetailTaskListComponent, DetailTableComponent, ReactiveFormsModule, FormsModule, SmartFormModule, ActionButtonComponent, DealFormComponent, QuoteFormDrawerComponent]
})
export class QuotationListComponent implements AfterViewInit {
  @ViewChild('grid') grid!: DataGridComponent<Quotatation>;

  customers$!: Observable<getCustomer[]>;
  salesPerson$!: Observable<getEmployee[]>;
  departments$!: Observable<getDepartment[]>;

  isLoading: boolean = true;
  isFiltered: boolean = false;
  isSuperAdmin: boolean = false;
  createQuotation: boolean | undefined = false;
  loader = this.loadingBar.useRef();
  searchQuery: string = '';
  userId: string | undefined = ''

  quoteStatuses = Object.values(QuoteStatus);
  selectableQuoteStatuses = Object.values(QuoteStatus).filter(status => status !== QuoteStatus.Expired);
  statusOrder = [
    QuoteStatus.Draft,
    QuoteStatus.WorkInProgress,
    QuoteStatus.QuoteSubmitted,
    QuoteStatus.UnderNegotiation,
    QuoteStatus.UnderReview,
    QuoteStatus.ReadyForSubmission,
    QuoteStatus.Won,
    QuoteStatus.Lost,
  ];
  dealStatuses = ['pending','approved','rejected'];

  rows: Quotatation[] = [];
  columns: DataGridColumn<Quotatation>[] = [];
  rowActions: DataGridRowAction<Quotatation>[] = [];
  views: DataGridView<Quotatation>[] = [{ id: 'all', label: 'All' }];
  bulkActions: DataGridBulkAction[] = [
    { id: 'delete', label: 'Delete', variant: 'danger' },
  ];
  breadcrumbs: DataGridBreadcrumb[] = [{ label: 'Home', link: '/' }];
  density: 'comfortable' | 'compact' = 'comfortable';
  rowAccent = (r: Quotatation): 'danger' | 'warning' | 'info' | null =>
    r.dealData && !r.dealData.seenedBySalsePerson ? 'warning' : null;

  detailLoading = false;
  detailTabs: DataGridDetailTab[] = [
    { id: 'overview', label: 'Details', icon: 'info' },
    { id: 'items', label: 'Items', icon: 'card' },
    { id: 'events', label: 'Events', icon: 'calendar' },
    { id: 'lpo', label: 'Documents', icon: 'eye' },
    { id: 'deal', label: 'Deal Sheet', icon: 'wallet' },
  ];

  readonly itemColumns: DetailTableColumn[] = [
    { key: 'item', label: 'Item' },
    { key: 'qty', label: 'Qty', type: 'number' },
    { key: 'price', label: 'Price', type: 'currency' },
    { key: 'amount', label: 'Amount', type: 'currency', total: true },
  ];

  itemRows(row: Quotatation): Record<string, any>[] {
    const rows: Record<string, any>[] = [];
    (row.optionalItems ?? []).forEach((opt) => {
      (opt.items ?? []).forEach((item) => {
        (item.itemDetails ?? []).forEach((d) => {
          rows.push({ item: d.detail, qty: d.quantity, price: d.unitSellingPrice, amount: (d.quantity ?? 0) * (d.unitSellingPrice ?? 0) });
        });
      });
    });
    return rows;
  }
  quoteTitle = (r: Quotatation) => r.quoteId ?? '';
  quoteSubtitle = (r: Quotatation) => r.client?.companyName ?? '';
  readonly eventsListComponent = EventsListComponent;

  /** Ring-badge palette matching home-landing's `STATUS_CLASSES` pattern (bg-50/text-700/ring-200,
   *  plus dark variants and a `border-*` fallback for contexts that render a border instead of a ring). */
  readonly statusBadgeClasses: Record<string, string> = {
    [QuoteStatus.Won]: 'bg-emerald-50 text-emerald-700 ring-emerald-200 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900 dark:border-emerald-900',
    [QuoteStatus.Lost]: 'bg-red-50 text-red-700 ring-red-200 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900 dark:border-red-900',
    Expired: 'bg-gray-100 text-gray-700 ring-gray-200 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700 dark:border-gray-700',
  };
  readonly dealStatusBadgeClasses: Record<string, string> = {
    pending: 'bg-amber-50 text-amber-700 ring-amber-200 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900 dark:border-amber-900',
    approved: 'bg-emerald-50 text-emerald-700 ring-emerald-200 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900 dark:border-emerald-900',
    rejected: 'bg-red-50 text-red-700 ring-red-200 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900 dark:border-red-900',
  };

  total: number = 0;
  private activeViewId = "all";
  page: number = 1;
  row: number = 10;
  sortKey: string | null = null;
  sortDir: 'asc' | 'desc' | null = null;
  fromDate: string | null = null
  toDate: string | null = null
  selectedCustomer: string | null = null;
  selectedSalesPerson: string | null = null;
  selectedDepartment: string | null = null;
  selectedQuoteStatus: string | null = null;
  selectedDealStatus: string | null = null;

  private confirm = inject(ConfirmDialogService);
  private excelExport = inject(ExcelExportService);

  private subscriptions = new Subscription();

  constructor(
    private _quoteService: QuotationService,
    private _router: Router,
    private _route: ActivatedRoute,
    private _dialog: MatDialog,
    private _employeeService: EmployeeService,
    private _customerService: CustomerService,
    private _departetmentService: ProfileService,
    private loadingBar: LoadingBarService,
    private datePipe: DatePipe,
    private numberFormat: NumberFormatterPipe,
    private toaster: ToastrService,
    private _injector: Injector,
    private _enquiryService: EnquiryService,
    private _eventsService: EventsService,
    private _eventActions: EventActionsService,
    private modal: ModalService
  ) { }

  ngOnInit() {
    this.checkPermission();
    this.buildColumns();
    this.buildRowActions();
    this.salesPerson$ = this._employeeService.getAllEmployees();
    this.departments$ = this._departetmentService.getDepartments();
    // userId isn't known yet on first render, so wait for the employee before fetching (else the request hits /customer/ and fails)
    this.customers$ = this._employeeService.employeeData$.pipe(
      filter((e) => !!e?._id),
      take(1),
      switchMap((e) => this._customerService.getAllCustomers(e!._id as string)),
      shareReplay(1)
    );
    this.loadFilterOptions();

    // Read URL parameters and initialize filters
    this._route.queryParams.subscribe(params => {
      this.page = params['page'] ? parseInt(params['page']) : 1;
      this.row = params['row'] ? parseInt(params['row']) : 10;
      if (this.grid) this.grid.page = this.page;
      this.searchQuery = params['search'] || '';
      this.fromDate = params['fromDate'] || null;
      this.toDate = params['toDate'] || null;
      this.selectedCustomer = params['customer'] || null;
      this.selectedSalesPerson = params['salesPerson'] || null;
      this.selectedDepartment = params['department'] || null;
      this.selectedQuoteStatus = params['quoteStatus'] || null;
      this.selectedDealStatus = params['dealStatus'] || null;

      // Set isFiltered flag if any filter is applied
      this.isFiltered = !!(this.searchQuery || this.fromDate || this.toDate ||
                         this.selectedCustomer || this.selectedSalesPerson ||
                         this.selectedDepartment || this.selectedQuoteStatus ||
                         this.selectedDealStatus);

      this.getQuotations();
    });
  }

  /** `this.page` (from `?page=`) is set in `ngOnInit`'s queryParams subscribe, which fires before
   *  `#grid` exists on first load — sync the grid's own pager here so deep-linking to `?page=2` moves
   *  its UI too, not just the fetched data. */
  ngAfterViewInit(): void {
    if (this.grid) this.grid.page = this.page;

    this.watchForEnquiryHandoff();
  }

  /** Populate id->label editor options for the grid's inline filter dropdowns. */
  private loadFilterOptions(): void {
    this.subscriptions.add(
      this.salesPerson$.subscribe((people) => {
        this.setColumnOptions('salesPerson', people.map((p) => ({ label: `${p.firstName} ${p.lastName}`, value: p._id })));
      })
    );
    this.subscriptions.add(
      this.customers$.subscribe((customers) => {
        this.setColumnOptions('customerName', customers.map((c) => ({ label: c.companyName, value: c._id })));
      })
    );
    this.subscriptions.add(
      this.departments$.subscribe((departments) => {
        this.setColumnOptions('department', departments.map((d) => ({ label: d.departmentName, value: d._id })));
      })
    );
  }

  // --- Quote form drawer (create and edit) ---------------------------------------

  formOpen = false;
  formMode: 'create' | 'edit' = 'create';
  /** The row being edited; the drawer reads it as the list API returns it. */
  formQuote: Quotatation | null = null;
  /** Set when the drawer was opened from an enquiry hand-off. */
  sourceEnquiry: getEnquiry | null = null;

  openCreateDrawer(): void {
    this.formMode = 'create';
    this.formQuote = null;
    this.formOpen = true;
  }

  openEditDrawer(row: Quotatation): void {
    this.formMode = 'edit';
    this.formQuote = row;
    this.sourceEnquiry = null;
    this.formOpen = true;
  }

  onFormClosed(): void {
    this.formOpen = false;
    // Cleared so handing the same enquiry over again is seen as a change.
    this.sourceEnquiry = null;
  }

  /**
   * Opens the drawer for an enquiry handed over by the enquiry list. The subject is consumed here
   * so returning to /quotations later does not reopen it.
   */
  private watchForEnquiryHandoff(): void {
    this.subscriptions.add(
      this._enquiryService.enquiryData$.subscribe((enquiry) => {
        if (!enquiry) return;
        this._enquiryService.quoteSubject.next(undefined);
        this.formMode = 'create';
        this.formQuote = null;
        this.sourceEnquiry = enquiry;
        this.formOpen = true;
      })
    );
  }


  private setColumnOptions(key: string, editorOptions: { label: string; value: any }[]): void {
    this.columns = this.columns.map((c) => (c.key === key ? { ...c, editorOptions } : c));
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  /** Column shell for the data grid. `status` is editable inline from the detail panel
   *  (see `onCellEdit`), gated by `isStatusLocked`/`canSelectStatus`. `dealStatus` stays read-only. */
  private buildColumns(): void {
    this.columns = [
      { key: 'date', label: 'Date', type: 'date', sortable: true, width: '120px' },
      { key: 'quoteId', label: 'Quote Id', sortable: true },
      { key: 'customerName', label: 'Customer', valueGetter: (r) => r.client?.companyName },
      { key: 'description', label: 'Description', valueGetter: (r) => r.subject },
      { key: 'salesPerson', label: 'Sales Person', valueGetter: (r) => r.createdBy ? `${r.createdBy.firstName} ${r.createdBy.lastName}` : '' },
      { key: 'department', label: 'Department', valueGetter: (r) => this.departmentNames(r) },
      { key: 'totalCost', label: 'Amount', valueGetter: (r) => `${this.numberFormat.transform(this.calculateDiscoutPrice(r))} ${r.currency}` },
      {
        key: 'status', label: 'Status', type: 'badge', editable: true, editor: 'select',
        editorOptions: this.selectableQuoteStatuses.map((s) => ({ label: s, value: s })),
        badgeClasses: this.statusBadgeClasses,
      },
      {
        key: 'dealStatus', label: 'Deal Status', type: 'badge',
        valueGetter: (r) => r.dealData?.status ?? null,
        editorOptions: this.dealStatuses.map((s) => ({ label: s.charAt(0).toUpperCase() + s.slice(1), value: s })),
        badgeClasses: this.dealStatusBadgeClasses,
      },
      { key: 'closingDate', label: 'Closing Date', type: 'date', editable: true, editor: 'date' },
    ];
  }

  /** Row actions shown as quick hover icon buttons. Add actions open the relevant detail tab. */
  private buildRowActions(): void {
    this.rowActions = [
      {
        id: 'addEvent', label: 'Add Event', icon: 'calendar', quick: true,
      },
      {
        id: 'addDocument', label: 'Add Document', icon: 'upload', quick: true,
        hidden: (r) => !(r.status === 'Won' && !r.lpoFiles?.length),
      },
      {
        id: 'viewLpo', label: 'View Lpo', icon: 'eye', quick: true,
        hidden: (r) => !(r.status === 'Won' && !!r.lpoFiles?.length),
      },
      {
        id: 'convertToDealSheet', label: 'Convert To Deal Sheet', icon: 'refresh', quick: true,
        hidden: (r) => !(r.status === 'Won' && r.lpoFiles?.length && (!r.dealData || !(r.dealData as any)._id)),
      },
      {
        id: 'viewDeal', label: 'View Deal Sheet', icon: 'eye',
        hidden: (r) => !this.hasDeal(r),
      },
      {
        id: 'updateStatus', label: 'Update Status', icon: 'refresh',
        hidden: (r) => r.status === 'Expired' || this.isStatusLocked(r),
      },
      {
        id: 'editQuote', label: 'Edit Quote', icon: 'pencil',
        hidden: (r) => this.isEditLocked(r),
      },
      {
        id: 'viewRevisions', label: 'Revision History', icon: 'eye',
        hidden: (r) => !r.revision,
      },
    ];
  }

  /** Read-only browser for the quote's past commercial content. */
  private openRevisions(row: Quotatation): void {
    if (!row._id) {
      return;
    }
    const data: RevisionHistoryModalData = {
      load: () => this._quoteService.getQuoteRevisions(row._id as string),
      entityLabel: 'quotation',
      ref: row.quoteId,
    };
    this._dialog.open(RevisionHistoryModalComponent, {
      data,
      width: '920px',
      maxWidth: '95vw',
      autoFocus: false,
    });
  }

  /** Full edit is blocked once the deal is approved, or the quote is Won (super admins excepted, like the view page). */
  private isEditLocked(r: Quotatation): boolean {
    return (r.dealData as any)?.status?.toLowerCase() === 'approved' || (r.status === 'Won' && !this.isSuperAdmin);
  }

  onRowAction(event: DataGridRowActionEvent<Quotatation>): void {
    const { action, row } = event;
    switch (action.id) {
      case 'addEvent':
        this.openDetailTab(row, 'events');
        break;
      case 'addDocument':
        this.openDetailTab(row, 'lpo');
        break;
      case 'viewLpo':
        this.openDetailTab(row, 'lpo');
        break;
      case 'viewDeal':
        this.openDealSheet(row);
        break;
      case 'updateStatus':
        this.updateStatus(row);
        break;
      case 'editQuote':
        this.openEditDrawer(row);
        break;
      case 'viewRevisions':
        this.openRevisions(row);
        break;
      case 'convertToDealSheet':
        this.dealQuote = row;
        break;
    }
  }

  private openDetailTab(row: Quotatation, tab: 'events' | 'lpo'): void {
    this.grid.activeTab = tab;
    this.grid.openRow(row);
  }

  onBulkAction({ action, rows }: DataGridBulkActionEvent<Quotatation>, grid: DataGridComponent<Quotatation>): void {
    if (action.id !== 'delete') return;

    const count = `${rows.length} quotation${rows.length === 1 ? '' : 's'}`;
    const dialogRef = this._dialog.open(ConfirmationDialogComponent, {
      data: {
        title: `Delete ${count}?`,
        description: 'This cannot be undone.',
        icon: 'heroExclamationCircle',
        IconColor: 'orange',
      },
    });

    dialogRef.afterClosed().subscribe((approved: boolean) => {
      if (!approved) return;

      this._employeeService.employeeData$.subscribe((employee) => {
        const employeeId = employee?._id as string;
        const deleteRequests = rows.map((r) => this._quoteService.deleteQuotation({ dataId: r._id as string, employeeId }));
        forkJoin(deleteRequests.length ? deleteRequests : [of(null)]).subscribe({
          next: () => {
            grid.clearSelection();
            grid.notify(`${count} deleted`);
            this.getQuotations();
          },
          error: () => {
            this.toaster.error('Failed to delete one or more quotations');
          },
        });
      }).unsubscribe();
    });
  }

  /** Row click now opens the in-page detail panel (grid handles this via detailTabs/detailTemplate);
   *  the previous full-page navigation is still available via "Open full quotation" in the panel footer. */
  onRowOpen(): void {
    this.detailLoading = true;
    setTimeout(() => (this.detailLoading = false), 250);
  }

  openFullQuotation(row: Quotatation, event?: Event): void {
    event?.stopPropagation();
    this._router.navigate(['/quotations/view', row._id]);
  }

  onCreateQuotation(): void {
    this.openCreateDrawer();
  }

  onQueryChange(query: DataGridQuery): void {
    this.searchQuery = query.search;
    this.page = query.page;
    this.row = query.pageSize;
    this.sortKey = query.sort.key;
    this.sortDir = query.sort.direction;

    this.selectedCustomer = null;
    this.selectedSalesPerson = null;
    this.selectedDepartment = null;
    this.selectedQuoteStatus = null;
    this.selectedDealStatus = null;
    this.fromDate = null;
    this.toDate = null;

    for (const f of query.filters) {
      switch (f.key) {
        case 'customerName': this.selectedCustomer = f.value; break;
        case 'salesPerson': this.selectedSalesPerson = f.value; break;
        case 'department': this.selectedDepartment = f.value; break;
        case 'status': this.selectedQuoteStatus = f.value; break;
        case 'dealStatus': this.selectedDealStatus = f.value; break;
        case 'date':
          if (f.op === 'after' || f.op === 'on') this.fromDate = f.value;
          if (f.op === 'before' || f.op === 'on') this.toDate = f.value;
          break;
      }
    }

    this.isFiltered = !!(this.searchQuery || this.fromDate || this.toDate ||
      this.selectedCustomer || this.selectedSalesPerson || this.selectedDepartment ||
      this.selectedQuoteStatus || this.selectedDealStatus);

    this.getQuotations();
    this.updateUrlParams();
  }

  // Update URL parameters without reloading the page
  updateUrlParams() {
    const queryParams: any = {};
    
    // Add pagination params
    queryParams.page = this.page !== 1 ? this.page : null;
    queryParams.row = this.row !== 10 ? this.row : null;
    
    // Add filter params (only if they have values)
    queryParams.search = this.searchQuery ? this.searchQuery : null;
    if (this.fromDate) queryParams.fromDate = this.fromDate;
    if (this.toDate) queryParams.toDate = this.toDate;
    queryParams.customer = this.selectedCustomer;
    queryParams.salesPerson = this.selectedSalesPerson;
    queryParams.department = this.selectedDepartment;
    queryParams.quoteStatus = this.selectedQuoteStatus;
    queryParams.dealStatus = this.selectedDealStatus;
    
    // Update URL without reloading the page
    this._router.navigate([], {
      relativeTo: this._route,
      queryParams: queryParams,
      queryParamsHandling: 'merge', // Keep existing query params
      replaceUrl: true // Replace the current URL in browser history
    });
  }

  getQuotations() {
    this.isLoading = true;
    let access;
    let userId;
    this._employeeService.employeeData$.subscribe((employee) => {
      access = employee?.category.privileges.quotation.viewReport;
      userId = employee?._id;
      this.userId = userId;
    });

    let filterData = {
      search: this.searchQuery,
      page: this.page,
      row: this.row,
      sortKey: this.sortKey,
      sortDir: this.sortDir,
      salesPerson: this.selectedSalesPerson,
      customer: this.selectedCustomer,
      fromDate: this.fromDate,
      toDate: this.toDate,
      department: this.selectedDepartment,
      quoteStatus: this.selectedQuoteStatus,
      dealStatus: this.selectedDealStatus,
      access: access,
      userId: userId
    };

    this.subscriptions.add(
      this._quoteService.getQuotation(filterData)
        .subscribe({
          next: (data: getQuotation) => {
            this.rows = data ? [...data.quotations] : [];
            this.total = data ? data.total : 0;
            this.refreshViewCounts();
            this.isLoading = false;
          },
          error: () => {
            this.isLoading = false;
          }
        })
    );
  }

  isStatusLocked(element: Quotatation): boolean {
    return !!element.dealData?.status && element.dealData.status !== 'rejected';
  }

  canSelectStatus(currentStatus: QuoteStatus, targetStatus: QuoteStatus): boolean {
    return canSelectQuoteStatus(currentStatus, targetStatus);
  }

  /** Opens the shared status modal (status + note). `target` preselects the status the user picked on the chip. */
  updateStatus(row: Quotatation, target?: QuoteStatus): void {
    this._dialog
      .open<StatusChangeModalComponent, any, StatusChangeResult<QuoteStatus> | null>(StatusChangeModalComponent, {
        data: quoteStatusModalData(row.status as QuoteStatus, target),
        width: '480px',
        maxWidth: '95vw',
        autoFocus: false,
      })
      .afterClosed()
      .subscribe((result) => {
        if (!result) return;
        const wasWon = row.status === QuoteStatus.Won;
        this._quoteService.updateQuoteStatus(row._id as string, result.status, result.reason).subscribe({
          next: (res: QuoteStatus) => {
            row.status = res;
            if (wasWon) { row.lpoFiles = [] as any; delete (row as any).dealData; }
          },
          error: (e) => this.toaster.error(e?.error?.message || 'Failed to update status.'),
        });
      });
  }

  /** Inline edits from the detail panel (status / closing date). Status still goes through
   *  the same lock/order checks and confirmation as the old row-action menu. */
  onCellEdit(e: DataGridCellEditEvent<Quotatation>): void {
    const { row, column, oldValue, newValue } = e;

    if (column.key === 'status') {
      row.status = oldValue;
      if (row.status === 'Expired' || this.isStatusLocked(row) || !this.canSelectStatus(oldValue, newValue)) {
        this.toaster.error(`Cannot change status to ${newValue}.`);
        return;
      }
      this.updateStatus(row, newValue as QuoteStatus);
      return;
    }

    if (column.key === 'closingDate') {
      this._quoteService.updateQuotation({ ...row, closingDate: newValue, editReason: 'Closing date updated' } as Quotatation, row._id as string).subscribe({
        error: () => { row.closingDate = oldValue; this.toaster.error('Failed to update closing date.'); },
      });
    }
  }

  /** Inline edit of the Description (subject) field from the detail panel's Overview section. */
  updateQuotationSubject(row: Quotatation, newValue: string): void {
    const oldValue = row.subject;
    row.subject = newValue;
    this._quoteService.updateQuotation({ ...row, subject: newValue, editReason: 'Description updated' } as Quotatation, row._id as string).subscribe({
      error: () => { row.subject = oldValue; this.toaster.error('Failed to update description.'); },
    });
  }

  onfilterApplied() {
    this.isFiltered = true;
    this.page = 1; // Reset to first page when applying filters
    if (this.grid) this.grid.page = 1;
    this.getQuotations();
    this.updateUrlParams();
  }

  /** Filters handed to the Report tab, so switching keeps the same slice of data.
   *  Search, status and deal status are list-only concerns and stay behind. */
  get reportQueryParams(): Record<string, string | null> {
    return {
      salesPerson: this.selectedSalesPerson,
      customer: this.selectedCustomer,
      department: this.selectedDepartment,
      fromDate: this.fromDate,
      toDate: this.toDate,
    };
  }

  onViewLpo(data: Quotatation, event: Event) {
    event.stopPropagation();
    const file = data.lpoFiles?.[0];
    if (!file) {
      this.toaster.warning('No LPO file has been uploaded for this quotation.');
      return;
    }
    this.onLpoPreview(file);
  }

  /** Injector for embedding `app-events-list` inline in the detail panel's Events tab
   *  (instead of only via `MatDialog.open`), supplying the same MAT_DIALOG_DATA it expects
   *  and a no-op MatDialogRef stub since there is no real dialog to close. */
  eventsInjector(row: Quotatation): Injector {
    return Injector.create({
      parent: this._injector,
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: { collectionId: row._id, from: 'Quotation' } },
        { provide: MatDialogRef, useValue: { close: () => {}, afterClosed: () => of(undefined) } },
      ],
    });
  }

  /** Events tab rendered through the shared home-landing style app-detail-task-list component, labeled "Events". */
  private eventsCache = new Map<string, BehaviorSubject<Events[]>>();

  eventsFor(row: Quotatation): Observable<Events[]> {
    const id = row._id as string;
    let subject = this.eventsCache.get(id);
    if (!subject) {
      subject = new BehaviorSubject<Events[]>([]);
      this.eventsCache.set(id, subject);
      this._eventsService.fetchEvents(id).subscribe((events: Events[]) => subject!.next(events || []));
    }
    return subject.asObservable();
  }

  eventItems(events: Events[]): DetailTaskItem[] {
    return this._eventActions.toItems(events);
  }


  private findEvent(row: Quotatation, item: DetailTaskItem): Events | undefined {
    return this.eventsCache.get(row._id as string)?.value.find((e) => e._id === item.id);
  }

  private updateEvents(row: Quotatation, fn: (events: Events[]) => Events[]): void {
    const subject = this.eventsCache.get(row._id as string);
    if (subject) { subject.next(fn(subject.value)); }
  }

  onAddEvent(row: Quotatation): void {
    this._eventActions.create({
      from: 'Quotation',
      collectionId: row._id as string,
      context: row.quoteId || (row._id as string),
      contactDetails: row.client?.contactDetails,
    }).subscribe((created) => {
      if (!created) { return; }
      this.eventsCache.delete(row._id as string);
      this.eventsFor(row);
    });
  }

  onToggleEvent(row: Quotatation, item: DetailTaskItem): void {
    this._eventActions.markCompleted(item).subscribe((ok) => {
      if (ok) { this.updateEvents(row, (evs) => evs.map((e) => (e._id === item.id ? { ...e, status: 'completed' } : e))); }
    });
  }

  async onEventOutcome(row: Quotatation, item: DetailTaskItem, status: 'success' | 'cancelled'): Promise<void> {
    (await this._eventActions.setOutcome(item, status)).subscribe((ok) => {
      if (ok) { this.updateEvents(row, (evs) => evs.map((e) => (e._id === item.id ? { ...e, status } : e))); }
    });
  }

  async onDeleteEvent(row: Quotatation, item: DetailTaskItem): Promise<void> {
    (await this._eventActions.delete(item)).subscribe((ok) => {
      if (ok) { this.updateEvents(row, (evs) => evs.filter((e) => e._id !== item.id)); }
    });
  }

  onPreviewEventFile(file: { id: string; name: string }): void {
    this._eventActions.previewFile(file);
  }

  onDeleteEventFile(row: Quotatation, item: DetailTaskItem, file: { id: string; name: string }): void {
    this._eventActions.deleteFile(item, file).subscribe((ok) => {
      if (!ok) { return; }
      this.updateEvents(row, (evs) => evs.map((e) =>
        e._id === item.id ? { ...e, eventFiles: (e.eventFiles || []).filter((f) => f.fileName !== file.id) } : e));
    });
  }

  /** LPO tab renders files as an inline document list (same pattern as the home-landing
   *  single-view page's Documents tab) instead of embedding the upload dialog component. */
  lpoFileUrl(fileName: string): string {
    return `${environment.api}/file/${fileName}`;
  }

  isLpoApproved(row: Quotatation): boolean {
    return row.dealData?.status === 'approved';
  }

  lpoFileKind(file: any): string {
    const name: string = file?.originalname || file?.fileName || '';
    const ext = name.split('.').pop();
    return ext ? ext.toUpperCase().slice(0, 4) : 'FILE';
  }

  onLpoPreview(file: any): void {
    this._enquiryService.getFile(file.fileName).subscribe({
      next: (blob: Blob) => {
        const url = window.URL.createObjectURL(blob);
        window.open(url, '_blank');
        setTimeout(() => window.URL.revokeObjectURL(url), 60000);
      },
      error: (error) => {
        if (error.status === 404) {
          this.toaster.warning('Sorry, the requested file was not found on the server.');
        } else {
          this.toaster.error('An error occurred while opening the file.');
        }
      }
    });
  }

  onLpoDownload(file: any): void {
    this._enquiryService.downloadFile(file.fileName).subscribe({
      next: (event) => {
        if (event.type === HttpEventType.Response) {
          const fileContent: Blob = new Blob([event.body]);
          FileSaver.saveAs(fileContent, file.originalname);
        }
      },
      error: (error) => {
        if (error.status === 404) {
          this.toaster.warning('Sorry, the requested file was not found on the server.');
        } else {
          this.toaster.error('An error occurred while downloading the file.');
        }
      }
    });
  }

  onLpoRemoveFile(row: Quotatation, index: number): void {
    const file = row.lpoFiles?.[index];
    if (!file) { return; }
    this._quoteService.removeLpo(file.fileName, row._id as string).subscribe((response: any) => {
      if (response?.success) {
        row.lpoFiles?.splice(index, 1);
      }
    });
  }

  /** Renders LPO files through the shared home-landing style app-detail-documents component. */
  lpoDocuments(row: Quotatation): DetailDocument[] {
    return (row.lpoFiles || []).map((file: any) => ({
      id: file.fileName,
      name: file.originalname,
      kind: this.lpoFileKind(file),
    }));
  }

  lpoRemoveDetails(row: Quotatation) {
    return (doc: DetailDocument) => [
      { label: 'Quotation Id', value: row.quoteId ?? '' },
      { label: 'Customer', value: row.client?.companyName ?? '' },
      { label: 'File Name', value: doc.name },
    ];
  }

  private findLpoFile(row: Quotatation, doc: DetailDocument): any {
    return row.lpoFiles?.find((file: any) => file.fileName === doc.id);
  }

  onLpoPreviewDoc(row: Quotatation, doc: DetailDocument): void {
    const file = this.findLpoFile(row, doc);
    if (file) { this.onLpoPreview(file); }
  }

  onLpoDownloadDoc(row: Quotatation, doc: DetailDocument): void {
    const file = this.findLpoFile(row, doc);
    if (file) { this.onLpoDownload(file); }
  }

  onLpoRemoveDoc(row: Quotatation, doc: DetailDocument): void {
    const index = row.lpoFiles?.findIndex((file: any) => file.fileName === doc.id) ?? -1;
    if (index < 0) { return; }
    this.onLpoRemoveFile(row, index);
  }

  canUploadLpo(row: Quotatation): boolean {
    return row.status === 'Won' && !row.lpoFiles?.length;
  }

  isUploadingFiles = false;
  readonly acceptedFiles = '.jpg,.jpeg,.png,.pdf,.doc,.docx,.xlsx,.msg,.dwg';

  startLpoUpload(row: Quotatation): void {
    if (!this.canUploadLpo(row)) return;
    this.modal.open<File[]>(LpoUploadModalComponent, {
      width: '680px',
      data: { context: row.quoteId || (row._id as string), acceptedFiles: this.acceptedFiles },
    }).afterClosed().subscribe((files) => {
      if (files?.length) { this.uploadLpoFiles(row, files); }
    });
  }

  uploadLpoFiles(row: Quotatation, files: File[]): void {
    if (!files.length || this.isUploadingFiles || !this.canUploadLpo(row)) return;
    const rowIndex = this.rows.indexOf(row);
    const formData = new FormData();
    formData.append('quoteId', row._id as string);
    files.forEach((file) => formData.append('files', file));

    this.isUploadingFiles = true;
    this._quoteService.uploadLpo(formData).subscribe({
      next: (quote: Quotatation) => {
        this.isUploadingFiles = false;
        if (quote) {
          this.rows[rowIndex].lpoFiles = quote.lpoFiles;
          const uploaded = this.rows[rowIndex];
          if (uploaded.status === 'Won' && !(uploaded.dealData as any)?._id) this.dealQuote = uploaded;
        }
        this.toaster.success('Files uploaded successfully');
      },
      error: () => {
        this.isUploadingFiles = false;
        this.toaster.error('Failed to upload files');
      },
    });
  }

  /** Quotation whose deal sheet is being built; the deal drawer is open while this is set. */
  dealQuote: Quotatation | null = null;

  onDealSaved(res: Quotatation): void {
    const row = this.dealQuote;
    this.dealQuote = null;
    if (!row) return;
    row.optionalItems = res.optionalItems;
    row.dealData = res.dealData;
    this.toaster.success(`Deal sheet created for ${row.quoteId ?? 'quotation'}`);
  }

  generateExcelReport() {
    this.loader.start();
    const columns = [
      { header: 'Date', key: 'date', width: 15 },
      { header: 'Quote Id', key: 'quoteId', width: 20 },
      { header: 'Customer Name', key: 'customerName', width: 25 },
      { header: 'Description', key: 'description', width: 30 },
      { header: 'Sales Person', key: 'salesPerson', width: 25 },
      { header: 'Department', key: 'department', width: 20 },
      { header: 'Total Cost', key: 'totalCost', width: 15 },
      { header: 'Status', key: 'status', width: 15 },
      { header: 'Deal Status', key: 'dealStatus', width: 15 }
    ];

    let access;
    let userId;
    this._employeeService.employeeData$.subscribe((employee) => {
      access = employee?.category.privileges.quotation.viewReport;
      userId = employee?._id;
      this.userId = userId;
    });

    let filterData = {
      search: this.searchQuery,
      page: this.page,
      row: Number.MAX_SAFE_INTEGER,
      salesPerson: this.selectedSalesPerson,
      customer: this.selectedCustomer,
      fromDate: this.fromDate,
      toDate: this.toDate,
      department: this.selectedDepartment,
      quoteStatus: this.selectedQuoteStatus,
      dealStatus: this.selectedDealStatus,
      access: access,
      userId: userId
    };
    this.subscriptions.add(
      this._quoteService.getQuotation(filterData)
        .subscribe((data: getQuotation) => {
          if (data) {
            // Sort quotations by date
            data.quotations.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());

            const rows = data.quotations.map((element: any) => ({
              date: this.datePipe.transform(element.date, 'dd/MM/yyyy'),
              quoteId: element.quoteId,
              customerName: element.client.companyName,
              description: element.subject,
              salesPerson: element.createdBy.firstName + ' ' + element.createdBy.lastName,
              department: element.department.departmentName,
              totalCost: this.numberFormat.transform(this.calculateDiscoutPrice(element)) + ' ' + element.currency,
              status: element.status,
              dealStatus: element.dealData?.status || 'N/A'
            }));

            void this.excelExport.download('quotations_report.xlsx', [{ name: 'Quotations', columns, rows }]);
          } else {
            this.toaster.warning('There is no quotation.');
          }
        })
    );
    this.loader.complete();
  }

  onViewChange(view: DataGridView<Quotatation>) {
    this.activeViewId = view.id;
    this.refreshViewCounts();
  }

  /** Only the active tab has a known total (rows are server-paged), so the others show no badge. */
  private refreshViewCounts() {
    this.views = this.views.map((v) => ({ ...v, count: v.id === this.activeViewId ? this.total : undefined, hideCount: v.id !== this.activeViewId }));
  }

  checkPermission() {
    this._employeeService.employeeData$.subscribe((data) => {
      this.createQuotation = data?.category.privileges.quotation.create;
      this.isSuperAdmin = data?.category.role === 'superAdmin';
      if (data?._id && this.views.length === 1) {
        this.views = [
          ...this.views,
          { id: 'mine', label: 'My Quotations', filters: [{ id: 1, key: 'salesPerson', op: 'eq', value: data._id }] },
        ];
      }
    });
  }

  calculateTotalPrice(j: number, k: number, quoteData: Quotatation) {
    return quoteData.optionalItems[0].items[j].itemDetails[k].unitSellingPrice * quoteData.optionalItems[0].items[j].itemDetails[k].quantity;
  }

  calculateSellingPrice(quoteData: Quotatation): number {
    let totalCost = 0;
    quoteData.optionalItems[0].items.forEach((item, j) => {
      item.itemDetails.forEach((itemDetail, k) => {
        totalCost += this.calculateTotalPrice(j, k, quoteData);
      });
    });

    return totalCost;
  }

  calculateDiscoutPrice(quoteData: Quotatation): number {
    return this.calculateSellingPrice(quoteData) - quoteData.optionalItems[0].totalDiscount;
  }

  formatAmount(quoteData: Quotatation): string {
    return `${this.numberFormat.transform(this.calculateDiscoutPrice(quoteData))} ${quoteData.currency}`;
  }

  onEventClicks(enquiryId: string) {
    this._dialog.open(EventsListComponent, { data: { collectionId: enquiryId, from: 'Quotation' }, width: '500px' });
  }

  departmentNames(element: { department?: getDepartment; departments?: getDepartment[] }): string {
    const departments = element?.departments?.length
      ? element.departments
      : element?.department
        ? [element.department]
        : [];
    return departments.map((dept) => dept?.departmentName).filter(Boolean).join(', ');
  }

  // ---- Deal sheet summary (the full sheet lives on the quotation view page) ----

  /** Derived tables are built once per deal snapshot; the panel re-renders on every change detection. */
  private dealViews = new WeakMap<object, { source: unknown; view: DealView }>();

  hasDeal(row: Quotatation): boolean {
    return hasDeal(row);
  }

  dealView(row: Quotatation): DealView {
    const cached = this.dealViews.get(row);
    if (cached && cached.source === row.dealData) return cached.view;
    const view = buildDealView(row, {
      number: (n) => this.numberFormat.transform(n),
      date: (v) => this.datePipe.transform(v as string, 'dd MMM yyyy'),
    });
    this.dealViews.set(row, { source: row.dealData, view });
    return view;
  }

  /** The full deal sheet: items, costs and attachments open on the quotation view page. */
  openDealSheet(row: Quotatation, event?: Event): void {
    event?.stopPropagation();
    this._router.navigate(['/quotations/view', row._id], { queryParams: { tab: 'deal' } });
  }

  /** Light deal summary for the Deal Sheet tab: status, price, terms and approver, with no tables. */
  dealSummarySection(row: Quotatation): DetailOverviewSection {
    const deal: any = row.dealData;
    const approver = deal?.approvedBy && typeof deal.approvedBy === 'object'
      ? `${deal.approvedBy.firstName ?? ''} ${deal.approvedBy.lastName ?? ''}`.trim() : '';
    const full = this.hasDeal(row);
    return {
      title: 'Deal Sheet',
      columns: '2',
      visible: !!row.dealData,
      emptyMessage: 'No deal data for this quotation yet.',
      fields: [
        { type: 'field', label: 'Deal Id', value: deal?.dealId, numeric: true, noHover: true, visible: full },
        { type: 'dg', key: 'dealStatus', label: 'Status', noHover: true },
        { type: 'field', label: 'Selling price', value: full ? this.dealView(row).sellingPrice : '', numeric: true, noHover: true, visible: full },
        { type: 'field', label: 'Payment terms', value: deal?.paymentTerms || '—', noHover: true, visible: full },
        { type: 'field', label: 'Approved by', value: approver, noHover: true, visible: !!approver },
      ],
    };
  }

  /** Details tab config for a quotation row: General/Description sections plus Deal Status when a deal exists. */
  overviewSections(row: Quotatation): DetailOverviewSection[] {
    return [
      {
        title: 'General',
        columns: '2',
        fields: [
          { type: 'field', label: 'Quote Id', value: row.quoteId, numeric: true },
          { type: 'dg', key: 'status' },
          { type: 'field', label: 'Customer', value: row.client?.companyName },
          { type: 'dg', key: 'salesPerson' },
          { type: 'field', label: 'Department', value: this.departmentNames(row) },
          { type: 'field', label: 'Date', value: this.datePipe.transform(row.date, 'dd MMM yyyy') },
          { type: 'dg', key: 'closingDate' },
          // Only worth a row once the quote has actually been revised.
          ...(row.revision ? [{ type: 'field' as const, label: 'Revision', value: `Rev ${row.revision}`, noHover: true }] : []),
        ],
      },
      {
        title: 'Overview',
        fields: [
          {
            type: 'field', label: 'Subject', value: row.subject, editable: true, editor: 'textarea',
            onSave: (newValue) => this.updateQuotationSubject(row, newValue),
          },
          { type: 'field', label: 'Amount', value: this.formatAmount(row), numeric: true, noHover: true },
        ],
      },
    ];
  }
}
