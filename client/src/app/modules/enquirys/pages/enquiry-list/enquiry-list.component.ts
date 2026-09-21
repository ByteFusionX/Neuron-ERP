import { Component, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { ConfirmDialogService } from 'src/app/shared/components/confirm-dialog';
import { MatDialog } from '@angular/material/dialog';
import { CreateEnquiryDialog } from '../create-enquiry/create-enquiry.component';
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
import { ActivatedRoute, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { AssignPresaleComponent } from '../assign-presale/assign-presale.component';
import { ViewPresaleComponent } from '../view-presale/view-presale.component';
import { HttpEventType } from '@angular/common/http';
import saveAs from 'file-saver';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { ViewRejectsComponent } from '../view-rejects/view-rejects.component';
import { ContactDetail, getCustomer } from 'src/app/shared/interfaces/customer.interface';
import { CustomerService } from 'src/app/core/services/customer/customer.service';
import { FileUploadModalComponent, FileUploadModalData } from 'src/app/shared/components/file-upload-modal/file-upload-modal.component';
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
import { NgClass } from '@angular/common';
import { ProfileService } from 'src/app/core/services/profile/profile.service';
import { EventsService } from 'src/app/core/services/events/events.service';
import { Events } from 'src/app/shared/interfaces/evets.interface';
import { ModalService } from 'src/app/shared/components/modal';
import { EventCreateModalComponent, EventModalResult } from 'src/app/shared/components/detail-panel/task-create-modal/event-create-modal.component';
import { SfOption } from 'src/app/shared/components/smart-form';

@Component({
  selector: 'app-enquiry-list',
  templateUrl: './enquiry-list.component.html',
  styleUrls: ['./enquiry-list.component.css'],
  imports: [
    FormsModule,
    ReactiveFormsModule,
    NgIf,
    NgSwitch,
    NgSwitchCase,
    DatePipe,
    AsyncPipe,
    NgClass,
    DataGridComponent,
    DetailOverviewComponent,
    DetailDocumentsComponent,
    DetailTaskListComponent,
    DetailTimelineComponent,
    ActionButtonComponent,
  ],
})
export class EnquiryListComponent implements OnInit, OnDestroy {
  @ViewChild('grid') grid?: DataGridComponent<getEnquiry>;

  enqId: string | null = null;
  salesPerson$!: Observable<getEmployee[]>;
  customers$!: Observable<getCustomer[]>;

  isLoading: boolean = true;
  isEmpty: boolean = false;
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
  displayedColumns: string[] = [
    'date',
    'enquiryId',
    'customerName',
    'enquiryDescription',
    'salesPersonName',
    'department',
    'attachedFiles',
    'status',
    'presale',
    'events',
  ];

  dataSource = new MatTableDataSource<getEnquiry>();
  filteredData = new MatTableDataSource<getEnquiry>();
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
  readonly statusBadgeClasses: Record<string, string> = {
    'Work In Progress': 'bg-orange-50 text-orange-700 ring-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:ring-orange-900',
    'Assigned To Presale Manager': 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900',
    'Assigned To Presale Engineer': 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900',
    'Assigned To Presales': 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900',
    'Rejected by Presale Engineer': 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900',
    'Rejected by Presale Manager': 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900',
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
  isDeletedClicked: boolean = false;
  private eventsCache = new Map<string, BehaviorSubject<Events[]>>();

  private subscriptions = new Subscription();
  private subject = new BehaviorSubject<{ page: number; row: number }>({
    page: this.page,
    row: this.row,
  });

  private confirm = inject(ConfirmDialogService);

  constructor(
    public dialog: MatDialog,
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
          if (!this.displayedColumns.includes('action')) {
            this.displayedColumns.push('action');
          }
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

  private buildColumns(): void {
    this.columns = [
      { key: 'date', label: 'Date', type: 'date', sortable: true, width: '120px' },
      { key: 'enquiryId', label: 'Enquiry No.', sortable: true, locked: true },
      { key: 'customer', label: 'Customer', valueGetter: (row) => row.client?.companyName },
      { key: 'contactPerson', label: 'Contacted By', valueGetter: (row) => row.contact ? `${row.contact.firstName ?? ''} ${row.contact.lastName ?? ''}`.trim() : '—' },
      { key: 'description', label: 'Description', valueGetter: (row) => row.title },
      { key: 'salesPerson', label: 'Sales Person', valueGetter: (row) => this.salesPersonName(row) },
      { key: 'department', label: 'Department', valueGetter: (row) => row.department?.departmentName },
      {
        key: 'status', label: 'Status', type: 'badge', badgeClasses: this.statusBadgeClasses,
        editorOptions: Object.keys(this.statusBadgeClasses).map((status) => ({ label: status, value: status })),
      },
    ];
  }

  private buildRowActions(): void {
    this.rowActions = [
      { id: 'upload', label: 'Upload Files', icon: 'upload', quick: true, hidden: (row) => !!row.attachments?.length || !this.canUploadAttachments(row) },
      { id: 'estimations', label: 'View Estimations', icon: 'eye', quick: true, badge: (row) => row.preSale?.seenbySalesPerson === false, hidden: (row) => !this.canViewEstimations(row) },
      { id: 'presaleHistory', label: 'Presale Progress', icon: 'clock', quick: true, hidden: (row) => !row.preSale?.presalePerson || !!row.preSale?.estimations },
      { id: 'assignPresale', label: 'Assign to Presale', icon: 'user', quick: true, hidden: (row) => !!row.preSale?.presalePerson && row.status !== 'Rejected by Presale Manager' },
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
      case 'upload': this.openAttachmentUpload(row); break;
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
          { type: 'field', label: 'Date', value: row.date },
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

  onDocumentOpen(row: getEnquiry): void {
    this.openAttachmentView(row);
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

  onDeleteEventFile(row: getEnquiry, item: DetailTaskItem, file: { id: string; name: string }): void {
    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      data: { title: 'Delete File', description: 'Are you sure you want to delete this file?', icon: 'heroExclamationCircle', IconColor: 'red' },
    });
    dialogRef.afterClosed().subscribe((confirmed: boolean) => {
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
          const filteredEnquiries = data.enquiry.filter(
            (enq: any) => enq.status != 'Sended by Presale Engineer',
          );
          this.dataSource.data = filteredEnquiries;
          this.filteredData.data = data.enquiry;
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

  openAttachmentView(element: any): void {
    if (!element?.attachments?.length) {
      return;
    }

    const modalData: FileUploadModalData = {
      title: `Files - ${element.enquiryId}`,
      existingFiles: element.attachments,
      allowMultiple: true,
      showActions: { upload: false, download: true, view: true, delete: false }
    };

    this.dialog.open(FileUploadModalComponent, { data: modalData, width: '800px', maxHeight: '90vh' });
  }

  openAttachmentUpload(element: any): void {
    if (!this.canUploadAttachments(element)) {
      return;
    }

    const modalData: FileUploadModalData = {
      title: `Files - ${element.enquiryId}`,
      allowMultiple: true,
      showActions: { upload: true, download: false, view: false, delete: true }
    };

    const dialogRef = this.dialog.open(FileUploadModalComponent, { data: modalData, width: '800px', maxHeight: '90vh' });

    dialogRef.afterClosed().subscribe((result) => {
      if (result && result.action === 'save') {
        const newFiles = result.files.filter((file: any) => file.file).map((file: any) => file.file);
        if (!newFiles.length) {
          return;
        }

        const formData = new FormData();
        newFiles.forEach((file: File) => formData.append('files', file));

        this._enquiryService.updateEnquiryAttachments(element._id, formData).subscribe({
          next: (res) => {
            element.attachments = res.data?.attachments || [];
            this.toaster.success('Files uploaded successfully');
          },
          error: () => {
            this.toaster.error('Failed to upload files');
          }
        });
      }
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
    if (this.enqId) {
      const dialogRef = this.dialog.open(CreateEnquiryDialog, {
        data: this.enqId,
      });
      dialogRef.afterClosed().subscribe((result) => {
        if (result) {
          this.total++;
          this.isEmpty = false;
          this.isLoading = false;
          result.client = result.client;
          result.department = result.department;
          result.salesPerson = result.salesPerson;
          this.dataSource.data = [result, ...this.dataSource.data];
          this.dataSource._updateChangeSubscription();
          this.enqId = result.enquiryId.slice(-3);
          this.toaster.success('Enquiry created successfully');
        }
      });
    }
  }

  preventClick(event: Event) {
    event.stopPropagation();
  }

  onViewPresale(event: Event, i: number, enquiryData: getEnquiry) {
    event.stopPropagation();
    const presaleDialog = this.dialog.open(ViewPresaleComponent, {
      data: enquiryData,
    });
    presaleDialog.afterClosed().subscribe((success: boolean) => {
      this.dataSource.data[i].preSale.seenbySalesPerson = true;
      if (success) {
        this.dataSource.data[i].status = 'Assigned To Presale Manager';
        this.dataSource._updateChangeSubscription();
      }
    });
  }

  onAssignPresale(
    event: Event,
    preSale: any,
    enquiryId: string,
    index: number,
  ) {
    event.stopPropagation();

    const presaleDialog = this.dialog.open(AssignPresaleComponent, {
      data: preSale,
    });
    presaleDialog.afterClosed().subscribe((data: any) => {
      if (data) {
        this.assigningPresale = true;
        this.assigningPresaleIndex = index;
        const presaleData = {
            comment: data.comment,
            newPresaleFile: data.newPresaleFile,
            existingPresaleFiles: data.existingPresaleFiles,
            presalePerson: data.presalePerson,
        };
        let formData = new FormData();
        formData.append('presaleData', JSON.stringify(presaleData));

        if (presaleData.newPresaleFile) {
          for (let i = 0; i < presaleData.newPresaleFile.length; i++) {
            formData.append(
              'newPresaleFile',
              presaleData.newPresaleFile[i] as unknown as Blob,
            );
          }
        }

        this._enquiryService
          .assignPresale(formData, enquiryId)
          .subscribe((res) => {
            if (res.success) {
              let currentPreSale = this.dataSource.data[index].preSale || {};
              this.dataSource.data[index].preSale = {
                ...currentPreSale,
                presalePerson: presaleData.presalePerson,
              } as any;
              this.dataSource.data[index].status =
                'Assigned To Presale Manager';
              this.dataSource._updateChangeSubscription();
              this.assigningPresale = false;
              this.toaster.success('Assinged Presale successfully');
            }
          });
      }
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

  onRowClicks(index: number) {
    let enqData = this.dataSource.data[index];
    if (!this.isDeletedClicked) {
      if (enqData.status === 'Work In Progress') {
        this._enquiryService.emitToQuote(enqData);
        this.router.navigate(['/quotations']);
      } else {
        this.toaster.warning('Sorry,Selected enquiry assinged to presales');
      }
    }
  }

  openReview(rejectionHistory: any) {
    this.dialog.open(ViewRejectsComponent, {
      data: rejectionHistory,
      width: '500px',
    });
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

  deleteEnquiry(enquiryId: string, status: string) {
    this.isDeletedClicked = true;
    if (this.isAssignedToPresale(status)) {
      this.toaster.warning('Sorry,Selected enquiry assinged to presales');
      return;
    }
    const employee = this._employeeService.employeeToken();
    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        title: 'Delete Enquiry',
        description: 'Are you sure you want to delete this enquiry?',
        icon: 'heroExclamationCircle',
        IconColor: 'red',
      },
    });

    dialogRef.afterClosed().subscribe((confirmed: boolean) => {
      if (confirmed) {
        this.subscriptions.add(
          this._enquiryService
            .deleteEnquiry({ dataId: enquiryId, employeeId: employee.id })
            .subscribe({
              next: () => {
                this.toaster.success('Enquiry deleted successfully');
                this.getEnquiries();
              },
              error: (error) => {
                this.toaster.error(
                  error.error.message || 'Failed to delete enquiry',
                );
              },
            }),
        );
      }
      this.isDeletedClicked = false;
    });
  }

}
