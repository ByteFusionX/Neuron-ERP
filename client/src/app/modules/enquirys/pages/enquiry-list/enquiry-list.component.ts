import { AfterViewInit, Component, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { ConfirmDialogService } from 'src/app/shared/components/confirm-dialog';
import { EnquiryFormDrawerComponent } from '../enquiry-form-drawer/enquiry-form-drawer.component';
import {
  FormBuilder,
  FormControl,
  FormsModule,
  ReactiveFormsModule,
} from '@angular/forms';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { BehaviorSubject, Observable, Subscription } from 'rxjs';
import { getEmployee } from 'src/app/shared/interfaces/employee.interface';
import { EnquiryService } from 'src/app/core/services/enquiry/enquiry.service';
import { AuditLogService } from 'src/app/core/services/audit-log.service';
import { toTimelineEntries } from 'src/app/shared/utils/audit-timeline.util';
import {
  EnquiryFollowUp,
  EnquiryTable,
  getEnquiry,
  Presale,
} from 'src/app/shared/interfaces/enquiry.interface';
import { MatTableDataSource } from '@angular/material/table';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { ToastrService } from 'ngx-toastr';
import { EnquiryEstimationViewComponent } from '../enquiry-estimation-view/enquiry-estimation-view.component';
import { HttpEventType } from '@angular/common/http';
import saveAs from 'file-saver';
import { getCustomer } from 'src/app/shared/interfaces/customer.interface';
import { CustomerService } from 'src/app/core/services/customer/customer.service';
import {
  NgIf,
  NgFor,
  NgClass,
  NgSwitch,
  NgSwitchCase,
  DatePipe,
  AsyncPipe,
} from '@angular/common';
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
import { DetailDocumentsComponent } from 'src/app/shared/components/detail-panel/detail-documents.component';
import { DetailTaskListComponent } from 'src/app/shared/components/detail-panel/detail-task-list.component';
import { DetailDocument, DetailOverviewSection, DetailTaskItem, DetailTimelineEntry } from 'src/app/shared/components/detail-panel/detail-panel.model';
import { DetailTimelineComponent } from 'src/app/shared/components/detail-panel/detail-timeline.component';
import { ApprovalJourneyComponent } from 'src/app/shared/components/approval-journey/approval-journey.component';
import { ApprovalJourneyStage } from 'src/app/shared/components/approval-journey/approval-journey.model';
import { DetailPanelIconComponent } from 'src/app/shared/components/detail-panel/detail-panel-icon.component';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { ENQUIRY_STATUS_TONES, STATUS_TONE_CLASSES } from 'src/app/shared/components/status-indicator/status-tone';
import { StatusPillComponent } from 'src/app/shared/components/status-indicator/status-pill.component';
import { ProfileService } from 'src/app/core/services/profile/profile.service';
import { EventsService } from 'src/app/core/services/events/events.service';
import { Events } from 'src/app/shared/interfaces/evets.interface';
import { ModalService } from 'src/app/shared/components/modal';
import { EventCreateModalComponent, EventModalResult } from 'src/app/shared/components/detail-panel/task-create-modal/event-create-modal.component';
import { DocumentUploadModalComponent, DocumentUploadModalResult } from 'src/app/shared/components/detail-panel/document-upload-modal/document-upload-modal.component';
import { FollowUpCreateModalComponent, FollowUpModalResult } from 'src/app/shared/components/detail-panel/task-create-modal/follow-up-create-modal.component';
import { SfOption, SmartFormModule } from 'src/app/shared/components/smart-form';

interface FollowUpListItem {
  id: string;
  status: 'done' | 'cancelled';
  outcome: string;
  note: string;
  date: string;
  createdByName: string;
}

/** The enquiry's single open follow-up: what the Follow-ups tab leads with and what "Mark done" closes. */
interface OpenFollowUp {
  due: string;
  dueIso: string;
  overdue: boolean;
  note: string;
}

interface FollowUpView {
  open: OpenFollowUp | null;
  history: FollowUpListItem[];
}

import { ViewToggleComponent } from 'src/app/shared/components/view-toggle/view-toggle.component';
const PRESALE_AUDIT_ACTIONS = new Set([
  'sent-to-presale', 'resent-to-presale', 'presale-rejected', 'presale-returned',
  'estimation-uploaded', 'estimation-deleted', 'revision-requested',
]);

@Component({
  selector: 'app-enquiry-list',
  templateUrl: './enquiry-list.component.html',
  styleUrls: ['./enquiry-list.component.css'],
  imports: [ViewToggleComponent, 
    FormsModule,
    ReactiveFormsModule,
    SmartFormModule,
    NgIf,
    NgFor,
    NgClass,
    NgSwitch,
    NgSwitchCase,
    DatePipe,
    AsyncPipe,
    StatusPillComponent,
    DataGridComponent,
    DetailOverviewComponent,
    DetailDocumentsComponent,
    DetailTaskListComponent,
    DetailTimelineComponent,
    ApprovalJourneyComponent,
    DetailPanelIconComponent,
    ActionButtonComponent,
    EnquiryFormDrawerComponent,
    EnquiryEstimationViewComponent,
    RouterLink,
    NgIcon,
  ],
})
export class EnquiryListComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('grid') grid?: DataGridComponent<getEnquiry>;

  enqId: string | null = null;
  formOpen = false;
  salesPerson$!: Observable<getEmployee[]>;
  customers$!: Observable<getCustomer[]>;

  isLoading: boolean = true;
  isEmpty: boolean = false;
  estimationTarget: { index: number; enquiry: getEnquiry } | null = null;
  isFiltered: boolean = false;
  isDeleteOption: boolean = false;
  createEnquiry: boolean | undefined = false;
  currentEmployeeId: string | undefined;

  status: { name: string; label: string }[] = [
    { name: 'New', label: 'New' },
    { name: 'In Review', label: 'In Review' },
    { name: 'Work In Progress', label: 'In Progress' },
    { name: 'Sent to Presales', label: 'In Presales' },
    { name: 'estimated', label: 'Estimated' },
    { name: 'Ready for Quotation', label: 'Ready for Quotation' },
    { name: 'Quoted', label: 'Quoted' },
    { name: 'Lost', label: 'Lost' },
  ];
  readonly sourceOptions: SfOption[] = ['Referral', 'Website', 'Walk-in', 'Cold Call', 'Exhibition', 'Existing Customer', 'Other']
    .map((label) => ({ label, value: label }));
  readonly categoryOptions: SfOption[] = ['Product', 'Project', 'Both', 'Supply only', 'Installation']
    .map((label) => ({ label, value: label }));
  readonly priorityOptions: SfOption[] = ['Low', 'Normal', 'Urgent', 'Critical']
    .map((label) => ({ label, value: label }));
  dataSource = new MatTableDataSource<getEnquiry>();
  columns: DataGridColumn<getEnquiry>[] = [];
  rowActions: DataGridRowAction<getEnquiry>[] = [];
  views: DataGridView<getEnquiry>[] = [
    { id: 'all', label: 'All' },
    { id: 'presales', label: 'Presales' },
    { id: 'mine', label: 'My Enquiries' },
    { id: 'overdue', label: 'Overdue' },
    { id: 'today', label: 'Today' },
    { id: 'upcoming', label: 'Upcoming' },
  ];
  breadcrumbs: DataGridBreadcrumb[] = [{ label: 'Home', link: '/' }, { label: 'Sales' }, { label: 'Enquiries' }];
  detailTabs: DataGridDetailTab[] = [
    { id: 'overview', label: 'Details', icon: 'info' },
    { id: 'documents', label: 'Documents', icon: 'files' },
    { id: 'followups', label: 'Follow-ups', icon: 'chat' },
    { id: 'events', label: 'Events', icon: 'calendar' },
    { id: 'progress', label: 'Progress', icon: 'activity' },
    { id: 'history', label: 'History', icon: 'clock' },
  ];
  readonly statusToneMap = ENQUIRY_STATUS_TONES;
  readonly statusBadgeClasses: Record<string, string> = Object.fromEntries(
    Object.entries(ENQUIRY_STATUS_TONES).map(([status, tone]) => [status, STATUS_TONE_CLASSES[tone].pill + ' border']),
  );
  /** Table and panel show a short label; anything sitting with presales reads as 'In Presales'. */
  statusLabel = (status: string): string => {
    if (status === 'Work In Progress') return 'In Progress';
    if (status?.startsWith('Assigned To Presale')) return 'In Presales';
    if (status === 'Sent to Presales' || status === 'in presales') return 'In Presales';
    if (status === 'rejected') return 'Rejected';
    if (status === 'revision') return 'Revision';
    return status;
  };
  enquiryTitle = (row: getEnquiry) => row.enquiryId ?? '';
  enquirySubtitle = (row: getEnquiry) => row.client?.companyName ?? '';

  total: number = 0;
  page: number = 1;
  row: number = 10;
  fromDate: string | null = null;
  toDate: string | null = null;
  selectedStatus: string | null = null;
  selectedSource: string | null = null;
  selectedCategory: string | null = null;
  selectedPriority: string | null = null;
  followUpFromDate: string | null = null;
  followUpToDate: string | null = null;
  selectedSalesPerson: string | null = null;
  selectedCustomer: string | null = null;
  selectedDepartment: string | null = null;
  searchQuery: string = '';
  sortKey: string | null = null;
  sortDir: 'asc' | 'desc' | null = null;
  activeViewId: string = 'all';
  private eventsCache = new Map<string, BehaviorSubject<Events[]>>();
  private historyCache = new Map<string, BehaviorSubject<DetailTimelineEntry[]>>();
  followUpSavingRowId: string | null = null;

  private subscriptions = new Subscription();
  private subject = new BehaviorSubject<{ page: number; row: number }>({
    page: this.page,
    row: this.row,
  });

  private confirm = inject(ConfirmDialogService);
  private auditLog = inject(AuditLogService);

  constructor(
    private fb: FormBuilder,
    private _employeeService: EmployeeService,
    private _enquiryService: EnquiryService,
    private _customerService: CustomerService,
    private _profileService: ProfileService,
    private router: Router,
    private toaster: ToastrService,
    private _router: Router,
    private _route: ActivatedRoute,
    private _eventsService: EventsService,
    private modal: ModalService,
  ) {}

  formData = this.fb.group({
    fromDate: new FormControl(),
    toDate: new FormControl(),
  });

  ngOnInit(): void {
    this.buildColumns();
    this.buildRowActions();
    this.subscriptions.add(
      this._employeeService.employeeData$.subscribe((employee) => {
        this.customers$ = this._customerService.getAllCustomers(employee?._id);
        this.subscriptions.add(this.customers$.subscribe((customers) => {
          this.setColumnOptions('customer', customers.map((customer) => ({ label: customer.companyName, value: customer._id })));
        }));
        this.currentEmployeeId = employee?._id;
        if (employee?.category.role == 'superAdmin') {
          this.isDeleteOption = true;
        }
      }),
    );
    this.checkPermission();
    this.salesPerson$ = this._employeeService.getAllEmployees();
    this.subscriptions.add(this.salesPerson$.subscribe((people) => {
      this.setColumnOptions('salesPerson', people.map((person) => ({ label: `${person.firstName} ${person.lastName}`, value: person._id })));
    }));
    this.subscriptions.add(this._profileService.getDepartments().subscribe((departments) => {
      this.setColumnOptions('department', departments.map((department) => ({ label: department.departmentName, value: department._id })));
    }));
    this.subscriptions.add(
      this._enquiryService.departmentData$.subscribe((data) => {
        this.selectedDepartment = data;
      }),
    );

    // Read URL parameters and initialize filters
    this._route.queryParams.subscribe((params) => {
      this.page = params['page'] ? parseInt(params['page']) : 1;
      this.row = params['row'] ? parseInt(params['row']) : 10;
      this.fromDate = params['fromDate'] || null;
      this.toDate = params['toDate'] || null;
      this.selectedCustomer = params['customer'] || null;
      this.selectedSalesPerson = params['salesPerson'] || null;
      this.selectedDepartment = params['department'] || null;
      this.selectedStatus = params['status'] || null;
      this.selectedSource = params['source'] || null;
      this.selectedCategory = params['enquiryCategory'] || null;
      this.selectedPriority = params['priority'] || null;
      this.followUpFromDate = params['followUpFromDate'] || null;
      this.followUpToDate = params['followUpToDate'] || null;

      // Update form data if dates exist in URL
      if (this.fromDate) {
        this.formData.controls.fromDate.setValue(this.fromDate);
      }
      if (this.toDate) {
        this.formData.controls.toDate.setValue(this.toDate);
      }

      // Set isFiltered flag if any filter is applied
      this.isFiltered = !!(
        this.fromDate ||
        this.toDate ||
        this.selectedCustomer ||
        this.selectedSalesPerson ||
        this.selectedDepartment ||
        this.selectedStatus ||
        this.selectedSource ||
        this.selectedCategory ||
        this.selectedPriority ||
        this.followUpFromDate ||
        this.followUpToDate
      );

      // Initialize the BehaviorSubject with the current page and row
      this.subject.next({ page: this.page, row: this.row });
    });

    this.subscriptions.add(
      this.subject.subscribe((data) => {
        this.page = data.page;
        this.row = data.row;
        this.getEnquiries();
        this.updateUrlParams();
      }),
    );
  }

  /** A `?search=` link (from the report's attention lists) lands on the list already searching for that enquiry. */
  ngAfterViewInit(): void {
    const search = this._route.snapshot.queryParamMap.get('search');
    if (!search) return;
    // The grid finishes its own first render before it can take a search term.
    setTimeout(() => {
      this.grid?.onSearch(search);
      this._router.navigate([], { relativeTo: this._route, queryParams: { search: null }, queryParamsHandling: 'merge', replaceUrl: true });
    });
  }

  /** Filters handed to the Report tab, so switching keeps the same slice of data. */
  get reportQueryParams(): Record<string, string | null> {
    return {
      salesPerson: this.selectedSalesPerson,
      customer: this.selectedCustomer,
      department: this.selectedDepartment,
      fromDate: this.fromDate,
      toDate: this.toDate,
    };
  }

  private buildColumns(): void {
    this.columns = [
      { key: 'date', label: 'Date', type: 'date', sortable: true, width: '120px' },
      { key: 'nextFollowUpDate', label: 'Next Follow-up', type: 'date', sortable: true, width: '140px', cellClass: (row) => this.followUpCellClass(row) },
      { key: 'enquiryId', label: 'Enquiry No.', sortable: true, locked: true },
      { key: 'customer', label: 'Customer', sortable: true, valueGetter: (row) => row.client?.companyName },
      { key: 'contactPerson', label: 'Contacted By', valueGetter: (row) => row.contact ? `${row.contact.firstName ?? ''} ${row.contact.lastName ?? ''}`.trim() : '—' },
      { key: 'description', label: 'Description', sortable: true, valueGetter: (row) => row.title },
      { key: 'priority', label: 'Priority', sortable: true, editorOptions: this.priorityOptions, valueGetter: (row) => row.priority || '—' },
      { key: 'salesPerson', label: 'Sales Person', sortable: true, valueGetter: (row) => this.salesPersonName(row) },
      { key: 'department', label: 'Department', sortable: true, valueGetter: (row) => row.department?.departmentName },
      {
        key: 'status', label: 'Status', sortable: true, type: 'badge', badgeClasses: this.statusBadgeClasses, badgeLabel: this.statusLabel,
        editorOptions: this.status.map((status) => ({ label: status.label, value: status.name })),
      },
    ];
  }

  private buildRowActions(): void {
    const actions: (DataGridRowAction<getEnquiry> & { hidden: (row: getEnquiry) => boolean })[] = [
      { id: 'followUp', label: 'Follow-ups', icon: 'chat', quick: true, hidden: (row) => ['Quoted', 'Lost', 'quoted', 'lost'].includes(row.status) },
      { id: 'estimations', label: 'View Estimations', icon: 'eye', quick: true, hidden: (row) => !this.canViewEstimations(row) },
      { id: 'presaleHistory', label: 'Presale Progress', icon: 'clock', hidden: (row) => (!row.preSale?.presalePerson && row.status !== 'Sent to Presales') || !!row.preSale?.estimations },
      { id: 'sendToPresale', label: 'Send to Presale', icon: 'send', quick: true, hidden: (row) => !['New', 'In Review'].includes(row.status) },
      { id: 'resendToPresale', label: 'Resend to Presale', icon: 'refresh', quick: true, hidden: (row) => !this.canResendToPresale(row) },
      { id: 'convertToQuote', label: 'Convert to Quote', icon: 'check', quick: true, hidden: (row) => !this.canConvertToQuote(row) },
      { id: 'markLost', label: 'Mark Lost', icon: 'close', quick: true, variant: 'danger', hidden: (row) => ['Lost', 'Quoted', 'lost', 'quoted'].includes(row.status) },
    ];
    // A lost enquiry is closed: no actions on the row, hover or menu.
    this.rowActions = actions.map((action) => ({
      ...action,
      hidden: (row: getEnquiry) => this.isLost(row) || action.hidden(row),
    }));
  }

  isLost(row: getEnquiry): boolean {
    return String(row?.status || '').toLowerCase() === 'lost';
  }

  private setColumnOptions(key: string, editorOptions: { label: string; value: any }[]): void {
    this.columns = this.columns.map((column) => column.key === key ? { ...column, editorOptions } : column);
  }

  onQueryChange(query: DataGridQuery): void {
    this.page = query.page;
    this.row = query.pageSize;
    this.searchQuery = query.search;
    this.sortKey = query.sort.key;
    this.sortDir = query.sort.direction;
    // Saved (custom) views are built on a base view; the server only understands the base view ids.
    const activeView = this.grid?.allViews.find((view) => view.id === query.viewId);
    this.activeViewId = activeView?.custom ? (activeView.baseViewId ?? 'all') : query.viewId;
    const value = (key: string) => query.filters.find((filter) => filter.key === key && filter.op === 'is')?.value ?? null;
    this.selectedSalesPerson = value('salesPerson');
    this.selectedCustomer = value('customer');
    this.selectedDepartment = value('department');
    this.selectedStatus = value('status');
    this.selectedSource = value('source');
    this.selectedCategory = value('enquiryCategory');
    this.selectedPriority = value('priority');
    const dateFilters = query.filters.filter((filter) => filter.key === 'date');
    this.fromDate = dateFilters.find((filter) => filter.op === 'after' || filter.op === 'on')?.value ?? null;
    this.toDate = dateFilters.find((filter) => filter.op === 'before' || filter.op === 'on')?.value ?? null;
    const followUpDateFilters = query.filters.filter((filter) => filter.key === 'nextFollowUpDate');
    this.followUpFromDate = followUpDateFilters.find((filter) => filter.op === 'after' || filter.op === 'on')?.value ?? null;
    this.followUpToDate = followUpDateFilters.find((filter) => filter.op === 'before' || filter.op === 'on')?.value ?? null;
    this.getEnquiries();
    this.updateUrlParams();
  }

  onRowAction(event: DataGridRowActionEvent<getEnquiry>): void {
    const { action, row } = event;
    const index = this.dataSource.data.indexOf(row);
    const click = new Event('click');
    switch (action.id) {
      case 'followUp': this.openFollowUps(row); break;
      case 'estimations': this.onViewPresale(click, index, row); break;
      case 'presaleHistory': this.openPresaleProgress(row); break;
      case 'sendToPresale': this.onSendToPresale(row); break;
      case 'resendToPresale': this.onResendToPresale(row); break;
      case 'convertToQuote': this.convertToQuote(row); break;
      case 'markLost': this.markLost(row); break;
    }
  }

  /** Only in progress or estimated enquiries (plus legacy equivalents) can be handed to quotations. */
  canConvertToQuote(row: getEnquiry): boolean {
    if (!row.client || !row.contact || !row.title?.trim()) return false;
    return ['in progress', 'estimated', 'Work In Progress', 'Ready for Quotation'].includes(row.status);
  }

  /** After the confirm, the enquiry is Quoted and the rest of the process lives on the quotation. */
  async convertToQuote(row: getEnquiry): Promise<void> {
    if (!this.canConvertToQuote(row)) {
      this.toaster.warning('Customer, contact and requirement summary are required before quotation.');
      return;
    }
    const { confirmed } = await this.confirm.open({
      tone: 'approve',
      title: 'Convert to quote?',
      message: `Enquiry ${row.enquiryId} will be marked Quoted and a quotation will open with its details prefilled.`,
      consequence: 'Everything after this happens on the quotation. Its outcome, even if lost, does not change the enquiry.',
      confirmLabel: 'Convert',
      cancelLabel: 'Cancel',
    });
    if (!confirmed) return;
    this._enquiryService.convertToQuote(row._id).subscribe({
      next: (res) => {
        if (!res.success) return;
        row.status = res.status;
        this.dataSource._updateChangeSubscription();
        this.toaster.success('Enquiry converted to quote');
        this._enquiryService.emitToQuote(row);
        this.router.navigate(['/quotations']);
      },
      error: () => this.toaster.error('Failed to convert enquiry to quote'),
    });
  }

  async markLost(row: getEnquiry): Promise<void> {
    const { confirmed, reason } = await this.confirm.open({
      tone: 'reject',
      title: 'Mark enquiry lost?',
      message: 'This enquiry will be moved out of active follow-up.',
      details: [
        { label: 'Enquiry', value: row.enquiryId ?? '' },
        { label: 'Customer', value: row.client?.companyName ?? '' },
      ],
      consequence: this.isAssignedToPresale(row.status)
        ? 'Presale is still working on this enquiry. Its presale job will be cancelled with this reason, and the presale team will be notified.'
        : 'The reason will stay on the enquiry for reporting and review.',
      confirmLabel: 'Mark lost',
      cancelLabel: 'Keep active',
      reason: true,
      reasonLabel: 'Lost reason',
    });
    if (!confirmed) return;
    this._enquiryService.updateEnquiryStatus({ id: row._id, status: 'Lost', lostReason: reason?.trim() || '' }).subscribe({
      next: (res) => {
        row.status = res.update?.status ?? 'Lost';
        row.lostReason = res.update?.lostReason ?? reason ?? '';
        if (res.update?.preSale) row.preSale = res.update.preSale;
        this.dataSource._updateChangeSubscription();
        this.toaster.success('Enquiry marked Lost');
      },
      error: () => this.toaster.error('Failed to update enquiry status'),
    });
  }

  canViewEstimations(row: getEnquiry): boolean {
    return !!row.preSale?.presalePerson
      && row.status !== 'Assigned To Presale Manager'
      && row.status !== 'Assigned To Presale Engineer'
      && !!row.preSale?.estimations;
  }

  salesPersonName(row: getEnquiry): string {
    return row.salesPerson ? `${row.salesPerson.firstName} ${row.salesPerson.lastName}`.trim() : '';
  }

  presalePersonName(row: getEnquiry): string {
    const person = row.preSale?.presalePerson as any;
    return person ? `${person.firstName ?? ''} ${person.lastName ?? ''}`.trim() : 'Not assigned';
  }

  followUpCellClass(row: getEnquiry): string | null {
    if (!row.nextFollowUpDate || ['Quoted', 'Lost', 'quoted', 'lost'].includes(row.status)) return null;
    const followUp = new Date(row.nextFollowUpDate);
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    return followUp <= today ? 'font-semibold text-red-600 dark:text-red-400' : null;
  }

  presaleProgress(row: getEnquiry): ApprovalJourneyStage[] {
    const enquiry = row as any;
    const preSale = enquiry.preSale;
    const entries: Array<{ text: string; meta?: string; tone: 'good' | 'bad' | 'warn'; date?: string | Date | null }> = [];
    const assignmentHistory = enquiry.assignmentHistory || [];

    // The journey starts when the enquiry was sent to presales.
    const sentDate = preSale?.createdDate ?? assignmentHistory[0]?.date;
    const wasSent = !!(preSale?.presalePerson || assignmentHistory.length || preSale?.rejectionHistory?.length || preSale?.status === 'cancelled');
    if (!wasSent) return [];
    {
      entries.push({
        text: 'Sent to presales',
        meta: this.progressMeta([this.progressDate(sentDate)]),
        tone: 'good',
        date: sentDate,
      });
    }

    if (assignmentHistory.length) {
      assignmentHistory.forEach((entry: any) => {
        const person = entry.employeeName || this.employeeName(entry.employee);
        entries.push({
          text: entry.action === 'reassigned'
            ? `Reassigned to ${person || 'Presale Engineer'}`
            : `Assigned to ${person || 'Presale Manager'}`,
          meta: this.progressMeta([entry.role, entry.assignedByName ? `By ${entry.assignedByName}` : '', this.progressDate(entry.date)]),
          tone: 'good',
          date: entry.date,
        });
      });
    } else {
      if (preSale?.presalePerson) {
        entries.push({
          text: `Assigned to ${this.employeeName(preSale.presalePerson) || 'Presale Manager'}`,
          meta: this.progressMeta([
            preSale.presalePerson?.category?.role || preSale.presalePerson?.designation || 'Presale Manager',
            this.progressDate(preSale.createdDate),
          ]),
          tone: 'good',
          date: preSale.createdDate,
        });
      }

      if (enquiry.reAssigned) {
        entries.push({
          text: `Reassigned to ${this.employeeName(enquiry.reAssigned) || 'Presale Engineer'}`,
          meta: this.progressMeta([
            enquiry.reAssigned?.category?.role || enquiry.reAssigned?.designation || 'Presale Engineer',
            this.progressDate(enquiry.reAssignedDate),
          ]),
          tone: 'good',
          date: enquiry.reAssignedDate,
        });
      }
    }

    (preSale?.rejectionHistory || []).forEach((rejection: any) => {
      entries.push({
        text: `Rejected by ${this.employeeName(rejection.employeeId) || rejection.rejectedRole || 'Presale'}`,
        meta: this.progressMeta([rejection.rejectedRole, rejection.rejectionReason, this.progressDate(rejection.rejectedAt)]),
        tone: 'bad',
        date: rejection.rejectedAt,
      });
    });

    entries.sort((first, second) => {
      if (!first.date || !second.date) return 0;
      return new Date(first.date).getTime() - new Date(second.date).getTime();
    });

    if (preSale?.status === 'cancelled') {
      entries.push({
        text: 'Presale cancelled — enquiry lost',
        meta: this.progressMeta([preSale.cancelReason || enquiry.lostReason, this.progressDate(preSale.cancelledAt)]),
        tone: 'bad',
      });
    } else entries.push(preSale?.estimations
      ? {
          text: 'Estimation uploaded',
          meta: this.employeeName(enquiry.reAssigned || preSale.presalePerson) || undefined,
          tone: 'good',
        }
      : {
          text: 'Estimation pending',
          meta: 'Awaiting estimation upload from presales',
          tone: 'warn',
        });

    // Same vertical journey the presale panel's Progress tab uses.
    return entries.map((entry, i) => ({
      key: `progress-${i}`,
      variant: entry.tone === 'bad' ? 'rejected' : entry.tone === 'warn' ? 'current' : 'done',
      icon: entry.tone === 'bad' ? 'close' : entry.tone === 'warn' ? 'schedule' : 'check_circle',
      title: entry.text,
      subtitle: entry.meta,
    } as ApprovalJourneyStage));
  }

  private employeeName(person: any): string {
    return person ? `${person.firstName || ''} ${person.lastName || ''}`.trim() : '';
  }

  private progressDate(value: string | Date | null | undefined): string {
    if (!value) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
    });
  }

  private displayDate(value: string | Date | null | undefined): string {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  private todayIso(): string {
    return new Date().toISOString().slice(0, 10);
  }

  daysLabel(days: number | null | undefined): string {
    if (days === null || days === undefined) return '—';
    if (days <= 0) return 'Today';
    return `${days}d`;
  }

  private progressMeta(parts: Array<string | null | undefined>): string | undefined {
    const meta = parts.filter(Boolean).join(' · ');
    return meta || undefined;
  }

  private openPresaleProgress(row: getEnquiry): void {
    if (!this.grid) return;
    this.grid.activeTab = 'progress';
    this.grid.openRow(row);
  }

  openFollowUps(row: getEnquiry): void {
    if (!this.grid) return;
    this.grid.activeTab = 'followups';
    this.grid.openRow(row);
  }

  /** Quoted and lost enquiries are done being chased. */
  isFollowUpClosed(row: getEnquiry): boolean {
    return ['quoted', 'lost'].includes(String(row.status || '').toLowerCase());
  }

  onScheduleFollowUp(row: getEnquiry): void {
    const open = this.followUpView(row).open;
    this.modal.open<FollowUpModalResult>(FollowUpCreateModalComponent, {
      width: '520px',
      data: { context: row.enquiryId || row._id, mode: 'schedule', dueDate: open?.dueIso || null },
    }).afterClosed().subscribe((result) => {
      if (result?.mode === 'schedule') this.saveFollowUp(row, this._enquiryService.scheduleFollowUp(row._id, { dueDate: result.dueDate, note: result.note }), 'Follow-up scheduled');
    });
  }

  onLogFollowUp(row: getEnquiry): void {
    const open = this.followUpView(row).open;
    this.modal.open<FollowUpModalResult>(FollowUpCreateModalComponent, {
      width: '520px',
      data: { context: row.enquiryId || row._id, mode: 'complete', plannedFor: open?.due || null },
    }).afterClosed().subscribe((result) => {
      if (result?.mode === 'complete') {
        this.saveFollowUp(row, this._enquiryService.completeFollowUp(row._id, {
          date: result.date, outcome: result.outcome, note: result.note, nextFollowUpDate: result.nextFollowUpDate,
        }), 'Follow-up logged');
      }
    });
  }

  async onCancelFollowUp(row: getEnquiry): Promise<void> {
    const open = this.followUpView(row).open;
    if (!open) return;
    const { confirmed, reason } = await this.confirm.open({
      tone: 'warning',
      title: 'Cancel Follow-up',
      message: 'Close this follow-up without logging an outcome?',
      details: [{ label: 'Planned for', value: open.due }],
      reason: 'optional',
      confirmLabel: 'Cancel follow-up',
      cancelLabel: 'Keep',
    });
    if (!confirmed) return;
    this.saveFollowUp(row, this._enquiryService.cancelFollowUp(row._id, reason), 'Follow-up cancelled');
  }

  private followUpViewCache = new Map<string, { history: EnquiryFollowUp[] | undefined; next: string | undefined; view: FollowUpView }>();

  /**
   * Memoized on the row's followUpHistory reference and next date: called directly from the template,
   * so returning fresh objects every call would make Angular tear down and rebuild the cards on every
   * change-detection tick, invalidating in-flight clicks on their buttons.
   */
  followUpView(row: getEnquiry): FollowUpView {
    const history = row.followUpHistory;
    const cached = this.followUpViewCache.get(row._id);
    if (cached && cached.history === history && cached.next === row.nextFollowUpDate) return cached.view;

    const list = history || [];
    const openEntry = list.find((entry) => entry.status === 'scheduled');
    // Enquiries from before follow-up tasks have only the scalar date; treat it as the open follow-up.
    const dueRaw = openEntry?.dueDate || row.nextFollowUpDate;
    const isClosed = this.isFollowUpClosed(row);
    const dueDate = dueRaw ? new Date(dueRaw) : null;
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const open: OpenFollowUp | null = dueDate && !isClosed ? {
      due: this.displayDate(dueRaw),
      dueIso: dueDate.toISOString().slice(0, 10),
      overdue: dueDate < startOfToday,
      note: openEntry?.note || '',
    } : null;

    // Newest first. Entries are stored oldest-first, so reversing before the (stable) sort keeps
    // same-day entries in newest-first order too.
    const items: FollowUpListItem[] = [...list]
      .reverse()
      .filter((entry) => entry.status !== 'scheduled')
      .sort((first, second) => new Date(second.completedAt || second.date).getTime() - new Date(first.completedAt || first.date).getTime())
      .map((entry) => ({
        id: entry._id || '',
        status: entry.status === 'cancelled' ? 'cancelled' as const : 'done' as const,
        outcome: entry.status === 'cancelled' ? 'Follow-up cancelled' : (entry.outcome || 'Follow-up'),
        note: (entry.status === 'cancelled' ? entry.cancelReason : entry.note) || '',
        date: this.progressDate(entry.date),
        createdByName: entry.createdByName || this.employeeName(entry.createdBy),
      }));
    const view = { open, history: items };
    this.followUpViewCache.set(row._id, { history, next: row.nextFollowUpDate, view });
    return view;
  }

  private saveFollowUp(row: getEnquiry, request: Observable<{ success: boolean; enquiry: getEnquiry }>, successMessage: string): void {
    if (this.followUpSavingRowId) return;
    this.followUpSavingRowId = row._id;
    request.subscribe({
      next: (response) => {
        const updated = response.enquiry;
        row.nextFollowUpDate = updated.nextFollowUpDate;
        row.lastFollowUpDate = updated.lastFollowUpDate;
        row.followUpOutcome = updated.followUpOutcome;
        row.followUpHistory = updated.followUpHistory;
        if (updated.lastFollowUpDate) row.daysSinceLastFollowUp = 0;
        this.followUpSavingRowId = null;
        this.refreshHistory(row);
        this.dataSource._updateChangeSubscription();
        this.toaster.success(successMessage);
      },
      error: (err) => {
        this.followUpSavingRowId = null;
        this.toaster.error(err?.error?.message || 'Failed to save follow-up');
      },
    });
  }

  overviewSections(row: getEnquiry): DetailOverviewSection[] {
    return [
      {
        title: 'General', columns: '2', fields: [
          { type: 'field', label: 'Enquiry No.', value: row.enquiryId, numeric: true },
          { type: 'dg', key: 'status' },
          { type: 'field', label: 'Customer', value: row.client?.companyName },
          { type: 'field', label: 'Contact', value: row.contact ? `${row.contact.firstName ?? ''} ${row.contact.lastName ?? ''}`.trim() : '—' },
          { type: 'field', label: 'Sales Person', value: this.salesPersonName(row) },
          { type: 'field', label: 'Department', value: row.department?.departmentName },
          { type: 'field', label: 'Priority', value: row.priority || '—' },
          { type: 'field', label: 'Date', value: this.displayDate(row.date) },
          { type: 'field', label: 'Next Follow-up', value: this.displayDate(row.nextFollowUpDate) },
          { type: 'field', label: 'Presales', value: this.presalePersonName(row) },
        ],
      },
      {
        title: 'Enquiry', fields: [
          { type: 'field', label: 'Description', value: row.title, noHover: true },
          { type: 'field', label: 'Requirement / Notes', value: row.requirement || '—', noHover: true },
          { type: 'field', label: 'Follow-up Outcome', value: row.followUpOutcome || '—', noHover: true },
          { type: 'field', label: 'Lost Reason', value: row.lostReason || '—', noHover: true },
          { type: 'field', label: 'Presale Rejection Reason', value: this.rejectionReason(row) || '—', noHover: true, visible: row.status === 'rejected' },
        ]
      },
    ];
  }

  enquiryDocuments(row: getEnquiry): DetailDocument[] {
    return (row.attachments ?? []).map((file: any) => ({
      id: file.fileName ?? file.filename,
      name: file.originalname,
      kind: file.mimetype?.split('/').pop(),
      size: file.size ? `${Math.max(1, Math.round(file.size / 1024))} KB` : undefined,
    }));
  }

  documentRemoveDetails(row: getEnquiry) {
    return (doc: DetailDocument) => [
      { label: 'Enquiry', value: row.enquiryId ?? '' },
      { label: 'Customer', value: row.client?.companyName ?? '' },
      { label: 'File Name', value: doc.name },
    ];
  }

  private static readonly PREVIEW_MIME: Record<string, string> = {
    pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
    webp: 'image/webp', svg: 'image/svg+xml', txt: 'text/plain',
  };

  onDocumentOpen(row: getEnquiry, document: DetailDocument): void {
    const fileName = row.attachments?.map((f: any) => f.fileName ?? f.filename).find((n: string) => n === document.id);
    if (!fileName) return;
    this._enquiryService.getFile(fileName).subscribe({
      next: (blob: Blob) => {
        // S3 often serves octet-stream, which makes the browser download instead of preview.
        const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
        const mime = EnquiryListComponent.PREVIEW_MIME[ext];
        const url = window.URL.createObjectURL(mime ? new Blob([blob], { type: mime }) : blob);
        window.open(url, '_blank');
        setTimeout(() => window.URL.revokeObjectURL(url), 60000);
      },
      error: (error) => {
        if (error.status === 404) this.toaster.warning('Sorry, the requested file was not found on the server.');
        else this.toaster.error('An error occurred while opening the file.');
      },
    });
  }

  onDocumentRemove(row: getEnquiry, document: DetailDocument): void {
    this._enquiryService.removeEnquiryAttachment(row._id, document.id).subscribe({
      next: (res: any) => {
        row.attachments = res?.data?.attachments ?? (row.attachments ?? []).filter((f: any) => (f.fileName ?? f.filename) !== document.id);
        this.refreshHistory(row);
        this.toaster.success('File deleted');
      },
      error: () => this.toaster.error('Failed to delete file'),
    });
  }

  onDocumentDownload(row: getEnquiry, document: DetailDocument): void {
    const file = row.attachments?.find((item: any) => (item.fileName ?? item.filename) === document.id);
    if (file) this.onDownloadClicks({ ...file, fileName: (file as any).fileName ?? file.filename });
  }

  eventsFor(row: getEnquiry): Observable<Events[]> {
    let subject = this.eventsCache.get(row._id);
    if (!subject) {
      subject = new BehaviorSubject<Events[]>([]);
      this.eventsCache.set(row._id, subject);
      this._eventsService.fetchEvents(row._id).subscribe((events: Events[]) => subject!.next(events || []));
    }
    return subject.asObservable();
  }

  historyFor(row: getEnquiry): Observable<DetailTimelineEntry[]> {
    let subject = this.historyCache.get(row._id);
    if (!subject) {
      subject = new BehaviorSubject<DetailTimelineEntry[]>([]);
      this.historyCache.set(row._id, subject);
      this.auditLog.getHistory('enquiry', row._id).subscribe({
        // Presale activity lives in the Presale Progress tab, not the enquiry's own history.
        next: (entries) => subject!.next(toTimelineEntries((entries || []).filter((e) => !PRESALE_AUDIT_ACTIONS.has(e.action)))),
        error: () => this.historyCache.delete(row._id),
      });
    }
    return subject.asObservable();
  }

  /** Drops the cached history so the next render re-reads it after something changed on the enquiry. */
  private refreshHistory(row?: getEnquiry): void {
    if (row) this.historyCache.delete(row._id);
    else this.historyCache.clear();
  }

  eventItems(events: Events[]): DetailTaskItem[] {
    return (events || []).map((event) => ({
      id: event._id,
      title: event.event,
      kind: 'event' as const,
      date: event.date as any,
      done: event.status === 'completed' || event.status === 'success',
      eventStatus: (event.status || 'pending') as DetailTaskItem['eventStatus'],
      outcomeable: true,
      assignee: event.employee ? `Assigned to ${[event.employee.firstName, event.employee.lastName].filter(Boolean).join(' ') || event.employee.fullName || ''}`.trim() : undefined,
      description: event.summary,
      deletable: this.isEventCreator(event.createdBy),
      attachments: (event.eventFiles || []).map((file) => ({ id: file.fileName, name: file.originalname })),
    }));
  }

  private isEventCreator(createdBy: any): boolean {
    const employeeId = this._employeeService.employeeToken()?.id;
    if (!employeeId || !createdBy) return false;
    const creatorId = typeof createdBy === 'string' ? createdBy : createdBy._id || createdBy;
    return employeeId == creatorId;
  }

  onAddEvent(row: getEnquiry): void {
    this.modal.open<EventModalResult>(EventCreateModalComponent, {
      width: '560px',
      data: {
        context: row.enquiryId || row._id,
        requireSummary: true,
        outlookSync: true,
      },
    }).afterClosed().subscribe((event) => {
      if (!event) return;
      const formData = new FormData();
      formData.append('eventData', JSON.stringify({
        from: 'Enquiry',
        collectionId: row._id,
        event: event.title,
        date: event.date,
        endDate: event.endDate,
        summary: event.description,
        location: event.location,
        syncToOutlook: event.syncToOutlook,
        onlineMeeting: event.onlineMeeting,
        attendees: event.attendees,
      }));
      this._eventsService.newEvent(formData, !!event.syncToOutlook).subscribe({
        next: (response) => {
          if (response?.outlookWarning) this.toaster.warning(response.outlookWarning);
          if (response?.event) {
            this.toaster.success(response.message || 'Event created successfully');
            this.eventsCache.delete(row._id);
            this.eventsFor(row);
            this.refreshHistory(row);
          }
        },
        error: () => this.toaster.error('Failed to create event'),
      });
    });
  }

  onToggleEvent(row: getEnquiry, item: DetailTaskItem): void {
    if (item.done) return;
    this._eventsService.eventStatus(item.id, 'completed').subscribe((response: any) => {
      if (response.success === true) {
        this.toaster.success('Event completion updated');
        const subject = this.eventsCache.get(row._id);
        subject?.next(subject.value.map((event) => event._id === item.id ? { ...event, status: 'completed' } : event));
      }
    });
  }

  async onEventOutcome(row: getEnquiry, item: DetailTaskItem, status: 'success' | 'cancelled'): Promise<void> {
    const success = status === 'success';
    const { confirmed } = await this.confirm.open({
      tone: success ? 'approve' : 'reject',
      title: success ? 'Mark Event Successful' : 'Cancel Event',
      message: success ? 'Mark this event as successful?' : 'Mark this event as cancelled?',
      details: [{ label: 'Event', value: item.title }],
      confirmLabel: success ? 'Mark successful' : 'Cancel event',
      cancelLabel: 'Keep as is',
    });
    if (!confirmed) return;
    this._eventsService.eventStatus(item.id, status).subscribe((response: any) => {
      if (response.success === true) {
        this.toaster.success(success ? 'Event marked successful' : 'Event cancelled');
        const subject = this.eventsCache.get(row._id);
        subject?.next(subject.value.map((event) => event._id === item.id ? { ...event, status } : event));
      }
    });
  }

  async onDeleteEvent(row: getEnquiry, item: DetailTaskItem): Promise<void> {
    const { confirmed } = await this.confirm.open({
      tone: 'reject',
      title: 'Delete Event',
      message: 'Are you sure you want to delete this event?',
      details: [{ label: 'Event', value: item.title }],
      confirmLabel: 'Delete',
      cancelLabel: 'Keep',
    });
    if (!confirmed) { return; }
    this._eventsService.eventDelete(item.id).subscribe((response: any) => {
      if (response.success) {
        this.toaster.success('Event Deleted');
        const subject = this.eventsCache.get(row._id);
        subject?.next(subject.value.filter((event) => event._id !== item.id));
      }
    });
  }

  onPreviewEventFile(file: { id: string; name: string }): void {
    this._enquiryService.downloadFile(file.id).subscribe({
      next: (event) => {
        if (event.type === HttpEventType.Response) {
          const fileContent = new Blob([event.body], { type: event.body.type || 'application/octet-stream' });
          const fileUrl = URL.createObjectURL(fileContent);
          window.open(fileUrl, '_blank');
          setTimeout(() => URL.revokeObjectURL(fileUrl), 10000);
        }
      },
      error: () => this.toaster.error('An error occurred while trying to preview the file.'),
    });
  }

  async onDeleteEventFile(row: getEnquiry, item: DetailTaskItem, file: { id: string; name: string }): Promise<void> {
    const { confirmed } = await this.confirm.open({
      tone: 'reject',
      title: 'Delete file',
      message: 'Are you sure you want to delete this file?',
      details: [{ label: 'File', value: file.name }],
      confirmLabel: 'Delete',
    });
    if (!confirmed) return;
    this._eventsService.eventFileDelete(item.id, file.id).subscribe((response: any) => {
      if (response.success) {
        this.toaster.success('File Deleted');
        const subject = this.eventsCache.get(row._id);
        subject?.next(subject.value.map((event) => event._id === item.id
          ? { ...event, eventFiles: (event.eventFiles || []).filter((eventFile) => eventFile.fileName !== file.id) }
          : event));
      }
    });
  }

  updateUrlParams() {
    const queryParams: any = {};

    queryParams.page = this.page !== 1 ? this.page : null;
    queryParams.row = this.row !== 10 ? this.row : null;

    queryParams.fromDate = this.fromDate || null;
    queryParams.toDate = this.toDate || null;
    queryParams.customer = this.selectedCustomer;
    queryParams.salesPerson = this.selectedSalesPerson;
    queryParams.department = this.selectedDepartment;
    queryParams.status = this.selectedStatus;
    queryParams.source = this.selectedSource;
    queryParams.enquiryCategory = this.selectedCategory;
    queryParams.priority = this.selectedPriority;
    queryParams.followUpFromDate = this.followUpFromDate;
    queryParams.followUpToDate = this.followUpToDate;

    this._router.navigate([], {
      relativeTo: this._route,
      queryParams: queryParams,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  ngOnDestroy(): void {
    this._enquiryService.depSubject.next(null);
    this.subscriptions.unsubscribe();
  }

  getEnquiries() {
    this.isLoading = true;
    let access;
    let userId;
    this._employeeService.employeeData$.subscribe((employee) => {
      access = employee?.category.privileges.enquiry.viewReport;
      userId = employee?._id;
    });

    let filterData = {
      page: this.page,
      row: this.row,
      search: this.searchQuery,
      sortKey: this.sortKey,
      sortDir: this.sortDir,
      salesPerson: this.selectedSalesPerson,
      customer: this.selectedCustomer,
      status: this.selectedStatus,
      source: this.selectedSource,
      enquiryCategory: this.selectedCategory,
      priority: this.selectedPriority,
      overdueFollowUp: this.activeViewId === 'overdue',
      todayFollowUp: this.activeViewId === 'today',
      upcomingFollowUp: this.activeViewId === 'upcoming',
      completed: this.activeViewId === 'completed',
      lost: this.activeViewId === 'lost',
      presales: this.activeViewId === 'presales',
      fromDate: this.fromDate,
      toDate: this.toDate,
      followUpFromDate: this.followUpFromDate,
      followUpToDate: this.followUpToDate,
      department: this.selectedDepartment,
      access: access,
      userId: userId,
      createdBy: this.activeViewId === 'mine' ? userId : null,
    };

    this.subscriptions.add(
      this._enquiryService.getEnquiry(filterData).subscribe({
        next: (data: EnquiryTable) => {
          this.dataSource.data = data.enquiry;
          this.refreshHistory();
          this.total = data.total;
          this.views = this.views.map((view) => ({
            ...view,
            count: data.viewCounts?.[view.id as keyof typeof data.viewCounts] ?? (view.id === this.activeViewId ? data.total : view.count),
          }));
          this.isLoading = false;
          this.isEmpty = false;
          this.enqId = this.total.toString().padStart(3, '0');
        },
        error: (error) => {
          if (error.status == 504) this.enqId = '000';
          this.dataSource.data = [];
          this.isEmpty = true;
        },
      }),
    );
  }

  canUploadAttachments(element: any): boolean {
    if (this.isLost(element)) return false;
    if (this.isAssignedToPresale(element?.status) && element?.preSale?.presalePerson) {
      return false;
    }
    return this.isDeleteOption || element?.salesPerson?._id === this.currentEmployeeId;
  }

  isUploadingFiles = false;
  readonly acceptedFiles = '.jpg,.jpeg,.png,.pdf,.doc,.docx,.xlsx,.msg,.dwg';

  /** Opens the upload modal over the row's documents tab. */
  startAttachmentUpload(row: getEnquiry): void {
    if (!this.canUploadAttachments(row)) return;
    if (this.grid) {
      this.grid.activeTab = 'documents';
      this.grid.openRow(row);
    }
    this.modal.open<DocumentUploadModalResult>(DocumentUploadModalComponent, {
      width: '680px',
      data: { context: row.enquiryId || row._id, acceptedFiles: this.acceptedFiles, title: 'Upload enquiry files' },
    }).afterClosed().subscribe((result) => {
      if (result?.files?.length) this.uploadAttachments(row, result.files);
    });
  }

  /** Uploads the picked files; existing files are re-sent because the server replaces the set. */
  uploadAttachments(row: getEnquiry, files: File[]): void {
    if (!files.length || this.isUploadingFiles || !this.canUploadAttachments(row)) return;
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));
    if (row.attachments?.length) formData.append('existingFiles', JSON.stringify(row.attachments));

    this.isUploadingFiles = true;
    this._enquiryService.updateEnquiryAttachments(row._id, formData).subscribe({
      next: (res) => {
        row.attachments = res.data?.attachments || [];
        this.isUploadingFiles = false;
        this.refreshHistory(row);
        this.toaster.success('Files uploaded successfully');
      },
      error: () => {
        this.isUploadingFiles = false;
        this.toaster.error('Failed to upload files');
      },
    });
  }

  onDownloadClicks(file: any) {
    this.subscriptions.add(
      this._enquiryService.downloadFile(file.fileName).subscribe({
        next: (event) => {
          if (event.type === HttpEventType.DownloadProgress) {
          } else if (event.type === HttpEventType.Response) {
            const fileContent: Blob = new Blob([event['body']]);
            saveAs(fileContent, file.originalname);
          }
        },
        error: (error) => {
          if (error.status == 404) {
            this.toaster.warning(
              'Sorry, The requested file was not found on the server. Please ensure that the file exists and try again.',
            );
          }
        },
      }),
    );
  }

  openDialog() {
    if (this.enqId) this.formOpen = true;
  }

  onFormClosed(): void {
    this.formOpen = false;
  }

  onEnquiryCreated(result: getEnquiry): void {
    this.formOpen = false;
    this.toaster.success('Enquiry created successfully');
    // Reload so the total, view counts, sort and paging all reflect the new enquiry.
    this.getEnquiries();
  }

  preventClick(event: Event) {
    event.stopPropagation();
  }

  onViewPresale(event: Event, i: number, enquiryData: getEnquiry) {
    event.stopPropagation();
    this.estimationTarget = { index: i, enquiry: enquiryData };
  }

  onEstimationSeen(): void {
    const t = this.estimationTarget;
    if (t) this.dataSource.data[t.index].preSale.seenbySalesPerson = true;
  }

  onEstimationRevised(): void {
    const t = this.estimationTarget;
    this.estimationTarget = null;
    if (!t) return;
    this.dataSource.data[t.index].status = 'Assigned To Presale Manager';
    this.dataSource._updateChangeSubscription();
  }

  async onSendToPresale(row: getEnquiry): Promise<void> {
    const { confirmed } = await this.confirm.open({
      tone: 'approve',
      title: 'Send to Presale?',
      message: `Enquiry ${row.enquiryId} will be sent to the presale team to be assigned. You can follow its progress from here.`,
      confirmLabel: 'Send',
      cancelLabel: 'Cancel',
    });
    if (!confirmed) return;

    this.sendRowToPresale(row);
  }

  /** Estimated or rejected enquiries go back to presales with a note on what needs revising or adding. */
  async onResendToPresale(row: getEnquiry): Promise<void> {
    const { confirmed, reason } = await this.confirm.open({
      tone: 'approve',
      title: 'Resend to Presale?',
      message: `Enquiry ${row.enquiryId} will go back to the presale team for a revision or addition.`,
      reason: true,
      reasonLabel: 'What needs revising or adding?',
      confirmLabel: 'Resend',
      cancelLabel: 'Cancel',
    });
    if (!confirmed) return;
    this.sendRowToPresale(row, reason?.trim());
  }

  canResendToPresale(row: getEnquiry): boolean {
    return row.status === 'estimated' || row.status === 'Rejected by Presale Manager' || this.isReturnedFromPresales(row);
  }

  private sendRowToPresale(row: getEnquiry, note?: string): void {
    this._enquiryService.sendToPresale(row._id, note).subscribe({
      next: (res) => {
        if (!res.success) return;
        const resent = res.status === 'revision';
        row.status = resent ? 'revision' : 'Sent to Presales';
        if (row.preSale) {
          row.preSale.status = resent ? 'returned' : 'new';
          delete (row.preSale as any).presalePerson;
        }
        this.refreshHistory(row);
        this.dataSource._updateChangeSubscription();
        this.toaster.success(resent ? 'Enquiry resent to presale' : 'Enquiry sent to presale');
      },
    });
  }

  onClear() {
    this.isFiltered = false;
    this.fromDate = null;
    this.toDate = null;
    this.selectedSalesPerson = null;
    this.selectedDepartment = null;
    this.selectedStatus = null;
    this.selectedSource = null;
    this.selectedCategory = null;
    this.selectedPriority = null;
    this.followUpFromDate = null;
    this.followUpToDate = null;
    this.formData.reset();
    this.page = 1;
    this.getEnquiries();
    this.updateUrlParams();
  }

  handleNotClose(event: MouseEvent) {
    event.stopPropagation();
  }

  onSubmit() {
    this.fromDate = null;
    this.toDate = null;
    let from = this.formData.controls.fromDate.value;
    let to = this.formData.controls.toDate.value;
    const current = new Date();
    const today = current.toISOString().split('T')[0];
    if (from <= to && to <= today && from.length && to.length) {
      this.fromDate = from;
      this.toDate = to;
    }
    this.isFiltered = true;
    this.getEnquiries();
    this.updateUrlParams();
  }

  onfilterApplied() {
    this.isFiltered = true;
    this.getEnquiries();
    this.updateUrlParams();
  }

  checkPermission() {
    this._employeeService.employeeData$.subscribe((data) => {
      this.createEnquiry = data?.category.privileges.enquiry.create;
    });
  }

  onPageNumberClick(event: { page: number; row: number }) {
    this.subject.next(event);
  }

  /** Rejected by presales and sent back by the manager, so sales can fix it and resend or mark it lost. */
  isReturnedFromPresales(row: getEnquiry): boolean {
    return row.status === 'rejected' && row.preSale?.status === 'returned';
  }

  rejectionReason(row: getEnquiry): string {
    const history = row.preSale?.rejectionHistory ?? [];
    return history[history.length - 1]?.rejectionReason || '';
  }

  isAssignedToPresale(status: string): boolean {
    return (
      status == 'Assigned To Presale Manager' ||
      status == 'Assigned To Presale Engineer' ||
      status == 'Sent to Presales' ||
      status == 'in presales' ||
      status == 'revision' ||
      status == 'Assigned To Presales' ||
      status == 'Rejected by Presale Engineer'
    );
  }
}
