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
import {
  EnquiryTable,
  getEnquiry,
  Presale,
} from 'src/app/shared/interfaces/enquiry.interface';
import { MatTableDataSource } from '@angular/material/table';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { ToastrService } from 'ngx-toastr';
import { AssignPresaleDrawerComponent, PresaleAssignment } from '../assign-presale-drawer/assign-presale-drawer.component';
import { EnquiryEstimationViewComponent } from '../enquiry-estimation-view/enquiry-estimation-view.component';
import { HttpEventType } from '@angular/common/http';
import saveAs from 'file-saver';
import { RejectionHistoryDrawerComponent, RejectionEntry } from '../rejection-history-drawer/rejection-history-drawer.component';
import { ContactDetail, getCustomer } from 'src/app/shared/interfaces/customer.interface';
import { CustomerService } from 'src/app/core/services/customer/customer.service';
import {
  NgIf,
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
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { ENQUIRY_STATUS_TONES, STATUS_TONE_CLASSES } from 'src/app/shared/components/status-indicator/status-tone';
import { StatusPillComponent } from 'src/app/shared/components/status-indicator/status-pill.component';
import { ProfileService } from 'src/app/core/services/profile/profile.service';
import { EventsService } from 'src/app/core/services/events/events.service';
import { Events } from 'src/app/shared/interfaces/evets.interface';
import { ModalService } from 'src/app/shared/components/modal';
import { EventCreateModalComponent, EventModalResult } from 'src/app/shared/components/detail-panel/task-create-modal/event-create-modal.component';
import { SfOption, SmartFormModule } from 'src/app/shared/components/smart-form';

@Component({
  selector: 'app-enquiry-list',
  templateUrl: './enquiry-list.component.html',
  styleUrls: ['./enquiry-list.component.css'],
  imports: [
    FormsModule,
    ReactiveFormsModule,
    SmartFormModule,
    NgIf,
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
    ActionButtonComponent,
    EnquiryFormDrawerComponent,
    AssignPresaleDrawerComponent,
    EnquiryEstimationViewComponent,
    RejectionHistoryDrawerComponent,
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
  rejectionsOpen = false;
  rejections: RejectionEntry[] = [];
  assignTarget: { enquiryId: string; index: number; preSale: any } | null = null;
  assigningPresale: boolean = false;
  assigningPresaleIndex!: number;
  isFiltered: boolean = false;
  isDeleteOption: boolean = false;
  createEnquiry: boolean | undefined = false;
  currentEmployeeId: string | undefined;

  status: { name: string; label: string }[] = [
    { name: 'Work In Progress', label: 'In Progress' },
    { name: 'Assigned To Presale Manager', label: 'In Presales' },
  ];
  dataSource = new MatTableDataSource<getEnquiry>();
  columns: DataGridColumn<getEnquiry>[] = [];
  rowActions: DataGridRowAction<getEnquiry>[] = [];
  views: DataGridView<getEnquiry>[] = [
    { id: 'all', label: 'All' },
    { id: 'mine', label: 'My Enquiries' },
  ];
  breadcrumbs: DataGridBreadcrumb[] = [{ label: 'Home', link: '/' }];
  detailTabs: DataGridDetailTab[] = [
    { id: 'overview', label: 'Details', icon: 'info' },
    { id: 'events', label: 'Events', icon: 'calendar' },
    { id: 'progress', label: 'Progress', icon: 'activity' },
    { id: 'documents', label: 'Documents', icon: 'files' },
  ];
  readonly statusToneMap = ENQUIRY_STATUS_TONES;
  readonly statusBadgeClasses: Record<string, string> = Object.fromEntries(
    Object.entries(ENQUIRY_STATUS_TONES).map(([status, tone]) => [status, STATUS_TONE_CLASSES[tone].pill + ' border']),
  );
  /** Table and panel show a short label; anything sitting with presales reads as 'In Presales'. */
  statusLabel = (status: string): string => {
    if (status === 'Work In Progress') return 'In Progress';
    if (status?.startsWith('Assigned To Presale')) return 'In Presales';
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
  selectedSalesPerson: string | null = null;
  selectedCustomer: string | null = null;
  selectedDepartment: string | null = null;
  searchQuery: string = '';
  sortKey: string | null = null;
  sortDir: 'asc' | 'desc' | null = null;
  activeViewId: string = 'all';
  private eventsCache = new Map<string, BehaviorSubject<Events[]>>();

  private subscriptions = new Subscription();
  private subject = new BehaviorSubject<{ page: number; row: number }>({
    page: this.page,
    row: this.row,
  });

  private confirm = inject(ConfirmDialogService);

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
        this.selectedDepartment
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
      { key: 'enquiryId', label: 'Enquiry No.', sortable: true, locked: true },
      { key: 'customer', label: 'Customer', sortable: true, valueGetter: (row) => row.client?.companyName },
      { key: 'contactPerson', label: 'Contacted By', valueGetter: (row) => row.contact ? `${row.contact.firstName ?? ''} ${row.contact.lastName ?? ''}`.trim() : '—' },
      { key: 'description', label: 'Description', sortable: true, valueGetter: (row) => row.title },
      { key: 'salesPerson', label: 'Sales Person', sortable: true, valueGetter: (row) => this.salesPersonName(row) },
      { key: 'department', label: 'Department', sortable: true, valueGetter: (row) => row.department?.departmentName },
      {
        key: 'status', label: 'Status', sortable: true, type: 'badge', badgeClasses: this.statusBadgeClasses, badgeLabel: this.statusLabel,
        editorOptions: Object.keys(this.statusBadgeClasses).map((status) => ({ label: this.statusLabel(status), value: status })),
      },
    ];
  }

  private buildRowActions(): void {
    this.rowActions = [
      { id: 'upload', label: 'Upload Files', icon: 'upload', quick: true, hidden: (row) => !!row.attachments?.length || !this.canUploadAttachments(row) },
      { id: 'estimations', label: 'View Estimations', icon: 'eye', quick: true, badge: (row) => row.preSale?.seenbySalesPerson === false, hidden: (row) => !this.canViewEstimations(row) },
      { id: 'presaleHistory', label: 'Presale Progress', icon: 'clock', quick: true, hidden: (row) => !row.preSale?.presalePerson || !!row.preSale?.estimations },
      { id: 'assignPresale', label: 'Assign to Presale', icon: 'user', quick: true, hidden: (row) => (!!row.preSale?.presalePerson || this.isAssignedToPresale(row.status)) && row.status !== 'Rejected by Presale Manager' },
      { id: 'review', label: 'View Rejection', icon: 'info', panel: true, hidden: (row) => row.status !== 'Rejected by Presale Manager' },
      { id: 'delete', label: 'Delete Enquiry', icon: 'trash', variant: 'danger', divider: true, hidden: (row) => !this.isDeleteOption || this.isAssignedToPresale(row.status) },
    ];
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
    this.activeViewId = query.viewId;
    const value = (key: string) => query.filters.find((filter) => filter.key === key)?.value ?? null;
    this.selectedSalesPerson = value('salesPerson');
    this.selectedCustomer = value('customer');
    this.selectedDepartment = value('department');
    this.selectedStatus = value('status');
    const dateFilters = query.filters.filter((filter) => filter.key === 'date');
    this.fromDate = dateFilters.find((filter) => filter.op === 'after' || filter.op === 'on')?.value ?? null;
    this.toDate = dateFilters.find((filter) => filter.op === 'before' || filter.op === 'on')?.value ?? null;
    this.getEnquiries();
    this.updateUrlParams();
  }

  onRowAction(event: DataGridRowActionEvent<getEnquiry>): void {
    const { action, row } = event;
    const index = this.dataSource.data.indexOf(row);
    const click = new Event('click');
    switch (action.id) {
      case 'upload': this.startAttachmentUpload(row); break;
      case 'estimations': this.onViewPresale(click, index, row); break;
      case 'presaleHistory': this.openPresaleProgress(row); break;
      case 'assignPresale': this.onAssignPresale(click, row.preSale, row._id, index); break;
      case 'review': this.openReview((row.preSale as any)?.rejectionHistory); break;
      case 'delete': this.deleteEnquiry(row._id, row.status); break;
    }
  }

  createQuote(row: getEnquiry): void {
    if (row.status !== 'Work In Progress') {
      this.toaster.warning('This enquiry is assigned to presales and cannot be quoted yet.');
      return;
    }
    this._enquiryService.emitToQuote(row);
    this.router.navigate(['/quotations']);
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

  presaleProgress(row: getEnquiry): DetailTimelineEntry[] {
    const enquiry = row as any;
    const preSale = enquiry.preSale;
    const entries: Array<DetailTimelineEntry & { date?: string | Date | null }> = [];
    const assignmentHistory = enquiry.assignmentHistory || [];

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

    entries.push(preSale?.estimations
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

    return entries;
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

  private progressMeta(parts: Array<string | null | undefined>): string | undefined {
    const meta = parts.filter(Boolean).join(' · ');
    return meta || undefined;
  }

  private openPresaleProgress(row: getEnquiry): void {
    if (!this.grid) return;
    this.grid.activeTab = 'progress';
    this.grid.openRow(row);
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
          { type: 'field', label: 'Date', value: this.displayDate(row.date) },
          { type: 'field', label: 'Presales', value: this.presalePersonName(row) },
        ],
      },
      { title: 'Enquiry', fields: [{ type: 'field', label: 'Description', value: row.title, noHover: true }] },
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

  onDocumentOpen(row: getEnquiry, document: DetailDocument): void {
    const fileName = row.attachments?.map((f: any) => f.fileName ?? f.filename).find((n: string) => n === document.id);
    if (!fileName) return;
    this._enquiryService.getFile(fileName).subscribe({
      next: (blob: Blob) => {
        const url = window.URL.createObjectURL(blob);
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
    const contactPersons: SfOption[] = (row.client?.contactDetails || []).map((contact: ContactDetail) => ({
      label: `${contact.firstName} ${contact.lastName}`,
      value: contact._id,
    }));

    this.modal.open<EventModalResult>(EventCreateModalComponent, {
      width: '560px',
      data: {
        context: row.enquiryId || row._id,
        assignable: true,
        employees: this._employeeService.getAllEmployees(),
        contactPersonable: true,
        contactPersons,
        requireSummary: true,
      },
    }).afterClosed().subscribe((event) => {
      if (!event) return;
      const formData = new FormData();
      formData.append('eventData', JSON.stringify({
        from: 'Enquiry',
        collectionId: row._id,
        event: event.title,
        date: event.date,
        employee: event.employeeId,
        contactPerson: event.contactPersonId,
        summary: event.description,
      }));
      this._eventsService.newEvent(formData).subscribe({
        next: (response) => {
          if (response?.event) {
            this.toaster.success(response.message || 'Event created successfully');
            this.eventsCache.delete(row._id);
            this.eventsFor(row);
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
      fromDate: this.fromDate,
      toDate: this.toDate,
      department: this.selectedDepartment,
      access: access,
      userId: userId,
      createdBy: this.activeViewId === 'mine' ? userId : null,
    };

    this.subscriptions.add(
      this._enquiryService.getEnquiry(filterData).subscribe({
        next: (data: EnquiryTable) => {
          this.dataSource.data = data.enquiry;
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
    if (this.isAssignedToPresale(element?.status) && element?.preSale?.presalePerson) {
      return false;
    }
    return this.isDeleteOption || element?.salesPerson?._id === this.currentEmployeeId;
  }

  /** Row that is currently showing the upload field instead of its file list. */
  uploadRowId: string | null = null;
  isUploadingFiles = false;
  pendingFiles: File[] = [];
  readonly acceptedFiles = '.jpg,.jpeg,.png,.pdf,.doc,.docx,.xlsx,.msg,.dwg';

  /** Opens the row's documents tab with the upload field showing. */
  startAttachmentUpload(row: getEnquiry): void {
    if (!this.canUploadAttachments(row)) return;
    this.uploadRowId = row._id;
    this.pendingFiles = [];
    if (this.grid) {
      this.grid.activeTab = 'documents';
      this.grid.openRow(row);
    }
  }

  cancelAttachmentUpload(): void {
    this.uploadRowId = null;
    this.pendingFiles = [];
  }

  /** Uploads the picked files and returns to the file list; existing files are re-sent because the server replaces the set. */
  uploadAttachments(row: getEnquiry): void {
    if (!this.pendingFiles.length || this.isUploadingFiles || !this.canUploadAttachments(row)) return;
    const formData = new FormData();
    this.pendingFiles.forEach((file) => formData.append('files', file));
    if (row.attachments?.length) formData.append('existingFiles', JSON.stringify(row.attachments));

    this.isUploadingFiles = true;
    this._enquiryService.updateEnquiryAttachments(row._id, formData).subscribe({
      next: (res) => {
        row.attachments = res.data?.attachments || [];
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

  onAssignPresale(event: Event, preSale: any, enquiryId: string, index: number) {
    event.stopPropagation();
    this.assignTarget = { enquiryId, index, preSale };
  }

  onAssignClosed(): void {
    this.assignTarget = null;
  }

  onPresaleAssigned(data: PresaleAssignment): void {
    const target = this.assignTarget;
    if (!target) return;
    this.assignTarget = null;
    const { enquiryId, index } = target;

    this.assigningPresale = true;
    this.assigningPresaleIndex = index;
    const presaleData = {
      comment: data.comment,
      newPresaleFile: data.newPresaleFile,
      existingPresaleFiles: data.existingPresaleFiles,
      presalePerson: data.presalePerson,
    };
    const formData = new FormData();
    formData.append("presaleData", JSON.stringify(presaleData));
    (presaleData.newPresaleFile ?? []).forEach((file) => formData.append("newPresaleFile", file as unknown as Blob));

    this._enquiryService.assignPresale(formData, enquiryId).subscribe({
      next: (res) => {
        this.assigningPresale = false;
        if (!res.success) return;
        const row = this.dataSource.data[index];
        row.preSale = { ...(row.preSale || {}), presalePerson: presaleData.presalePerson } as any;
        row.status = "Assigned To Presale Manager";
        this.dataSource._updateChangeSubscription();
        this.toaster.success("Assinged Presale successfully");
      },
      error: () => (this.assigningPresale = false),
    });
  }

  onClear() {
    this.isFiltered = false;
    this.fromDate = null;
    this.toDate = null;
    this.selectedSalesPerson = null;
    this.selectedDepartment = null;
    this.selectedStatus = null;
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

  openReview(rejectionHistory: any) {
    this.rejections = rejectionHistory ?? [];
    this.rejectionsOpen = true;
  }

  checkPermission() {
    this._employeeService.employeeData$.subscribe((data) => {
      this.createEnquiry = data?.category.privileges.enquiry.create;
    });
  }

  onPageNumberClick(event: { page: number; row: number }) {
    this.subject.next(event);
  }

  isAssignedToPresale(status: string): boolean {
    return (
      status == 'Assigned To Presale Manager' ||
      status == 'Assigned To Presale Engineer' ||
      status == 'Assigned To Presales' ||
      status == 'Rejected by Presale Engineer'
    );
  }

  async deleteEnquiry(enquiryId: string, status: string): Promise<void> {
    if (this.isAssignedToPresale(status)) {
      this.toaster.warning('Sorry,Selected enquiry assinged to presales');
      return;
    }
    const employee = this._employeeService.employeeToken();
    const { confirmed } = await this.confirm.open({
      tone: 'reject',
      title: 'Delete enquiry',
      message: 'Are you sure you want to delete this enquiry?',
      consequence: 'This cannot be undone.',
      confirmLabel: 'Delete',
    });
    if (!confirmed) return;
    this.subscriptions.add(
      this._enquiryService.deleteEnquiry({ dataId: enquiryId, employeeId: employee.id }).subscribe({
        next: () => {
          this.toaster.success('Enquiry deleted successfully');
          this.getEnquiries();
        },
        error: (error) => {
          this.toaster.error(error.error.message || 'Failed to delete enquiry');
        },
      }),
    );
  }
}
