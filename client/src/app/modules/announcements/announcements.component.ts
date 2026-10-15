import { AfterViewInit, Component, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { NgIf, NgSwitch, NgSwitchCase, DatePipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ToastrService } from 'ngx-toastr';
import { AnnouncementService } from 'src/app/core/services/announcement/announcement.service';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { FormPromptService } from 'src/app/shared/components/form-prompt-modal/form-prompt.service';
import { ConfirmDialogService } from 'src/app/shared/components/confirm-dialog/confirm-dialog.service';
import { ConfettiComponentComponent } from 'src/app/shared/components/confetti-component/confetti-component.component';
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
import { DetailOverviewSection } from 'src/app/shared/components/detail-panel/detail-panel.model';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { StatusPillComponent } from 'src/app/shared/components/status-indicator/status-pill.component';
import { StatusTone } from 'src/app/shared/components/status-indicator/status-tone';
import {
  announcementGetData,
  announcementListQuery,
  AnnouncementState,
} from 'src/app/shared/interfaces/announcement.interface';
import { AddAnnouncementComponent } from './add-announcement/add-announcement.component';
import { PRIORITY_OPTIONS, STATE_META, TYPE_OPTIONS, priorityOf, publishDateOf, typeOf } from './announcement-meta';

const PAGE_SIZE = 15;

/** Views that map onto the list endpoint's `filter` (live items) or `state` (manager views). */
const VIEW_QUERY: Record<string, Pick<announcementListQuery, 'filter' | 'state'>> = {
  all: { filter: 'all', state: 'active' },
  unread: { filter: 'unread', state: 'active' },
  pinned: { filter: 'pinned', state: 'active' },
  ack: { filter: 'ack', state: 'active' },
  scheduled: { filter: 'all', state: 'scheduled' },
  draft: { filter: 'all', state: 'draft' },
  expired: { filter: 'all', state: 'expired' },
};

const PRIORITY_TONE: Record<string, StatusTone> = { normal: 'neutral', important: 'warning', urgent: 'danger' };

/**
 * Announcements as a data grid with a detail panel, like the enquiry list. Readers get All / Unread /
 * Pinned / To acknowledge; authors and admins also get Scheduled / Drafts / Expired.
 */
@Component({
  selector: 'app-announcements',
  templateUrl: './announcements.component.html',
  styleUrls: ['./announcements.component.css'],
  imports: [
    NgIf,
    NgSwitch,
    NgSwitchCase,
    DatePipe,
    DataGridComponent,
    DetailOverviewComponent,
    ActionButtonComponent,
    StatusPillComponent,
    ConfettiComponentComponent,
    AddAnnouncementComponent,
  ],
})
export class AnnouncementsComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('grid') grid?: DataGridComponent<announcementGetData>;

  readonly breadcrumbs: DataGridBreadcrumb[] = [{ label: 'Home', link: '/' }, { label: 'Announcements' }];
  readonly detailTabs: DataGridDetailTab[] = [
    { id: 'message', label: 'Message', icon: 'info' },
    { id: 'overview', label: 'Details', icon: 'files' },
  ];
  readonly priorityTone = PRIORITY_TONE;
  readonly priorityLabel = (value: string) => PRIORITY_OPTIONS.find((o) => o.value === value)?.label ?? value;

  canCreate = false;
  canEdit = false;
  canManage = false;

  data: announcementGetData[] = [];
  total = 0;
  pageSize = PAGE_SIZE;
  isLoading = true;
  loadError = false;
  isAcknowledging = false;
  formOpen = false;
  editTarget: announcementGetData | null = null;

  views: DataGridView<announcementGetData>[] = [
    { id: 'all', label: 'All', hideCount: true },
    { id: 'unread', label: 'Unread' },
    { id: 'pinned', label: 'Pinned', hideCount: true },
    { id: 'ack', label: 'To acknowledge' },
  ];
  columns: DataGridColumn<announcementGetData>[] = this.buildColumns();
  rowActions: DataGridRowAction<announcementGetData>[] = [];

  private query: announcementListQuery = { page: 1, row: PAGE_SIZE, ...VIEW_QUERY['all'] };
  private activeViewId = 'all';
  private readonly destroy$ = new Subject<void>();
  private readonly confirm = inject(ConfirmDialogService);
  private readonly formPrompt = inject(FormPromptService);

  constructor(
    public announcements: AnnouncementService,
    private toaster: ToastrService,
    private employeeService: EmployeeService,
    private route: ActivatedRoute,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.employeeService.employeeData$.pipe(takeUntil(this.destroy$)).subscribe((employee) => {
      const privileges = employee?.category?.privileges?.announcement;
      this.canCreate = !!privileges?.create;
      this.canEdit = !!privileges?.deleteOrEdit;
      this.buildRowActions();
    });
    this.buildRowActions();
    this.load();
  }

  /** `?id=` comes from a notification click: open that announcement even if it is not on the first page. */
  ngAfterViewInit(): void {
    const id = this.route.snapshot.queryParamMap.get('id');
    if (!id) return;
    setTimeout(() => {
      this.router.navigate([], { relativeTo: this.route, queryParams: { id: null }, queryParamsHandling: 'merge', replaceUrl: true });
      this.openById(id);
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  readonly title = (row: announcementGetData) => row.title;
  readonly subtitle = (row: announcementGetData) => row.authorName ?? '';
  readonly rowAccent = (row: announcementGetData) =>
    row.priority === 'urgent' ? 'danger' : row.priority === 'important' ? 'warning' : null;

  isCelebrationRow(row: announcementGetData): boolean {
    return !!row.celeb || row.type === 'celebration';
  }

  typeLabel(row: announcementGetData): string {
    return typeOf(row).label;
  }

  stateLabel(row: announcementGetData): string {
    return STATE_META[row.state ?? 'active'].label;
  }

  audience(row: announcementGetData): string {
    return !row.category?.length || row.category.includes('all') ? 'Everyone' : 'Selected departments';
  }

  overviewSections(row: announcementGetData): DetailOverviewSection[] {
    const sections: DetailOverviewSection[] = [
      {
        title: 'General', columns: '2', fields: [
          { type: 'field', label: 'Author', value: row.authorName || '—' },
          { type: 'field', label: 'Type', value: this.typeLabel(row) },
          { type: 'field', label: 'Priority', value: priorityOf(row).label },
          { type: 'field', label: 'Status', value: this.stateLabel(row) },
          { type: 'field', label: 'Audience', value: this.audience(row) },
          { type: 'field', label: 'Pinned', value: row.pinned ? 'Yes' : 'No' },
          { type: 'field', label: 'Published', value: this.dateLabel(publishDateOf(row)) },
          { type: 'field', label: 'Expires', value: row.expiresAt ? this.dateLabel(row.expiresAt) : 'Never' },
          { type: 'field', label: 'Acknowledgement', value: row.requireAck ? (row.isAcknowledged ? 'Done' : 'Required') : 'Not required' },
        ],
      },
    ];
    if (this.canManage && row.readCount !== undefined) {
      sections.push({
        title: 'Reach', columns: '2', fields: [
          { type: 'field', label: 'Read by', value: row.readCount },
          { type: 'field', label: 'Acknowledged by', value: row.ackCount ?? 0, visible: !!row.requireAck },
        ],
      });
    }
    return sections;
  }

  onQueryChange(query: DataGridQuery): void {
    this.activeViewId = query.viewId in VIEW_QUERY ? query.viewId : 'all';
    const value = (key: string) => query.filters.find((f) => f.key === key && f.op === 'is')?.value ?? '';
    this.query = {
      page: query.page,
      row: query.pageSize,
      search: (query.search ?? '').trim(),
      priority: value('priority'),
      type: value('type'),
      ...VIEW_QUERY[this.activeViewId],
    };
    this.load();
  }

  onRowOpen(row: announcementGetData): void {
    if (row.isRead || row.state !== 'active') return;
    row.isRead = true;
    this.announcements.markAsViewed(row._id).pipe(takeUntil(this.destroy$)).subscribe({ error: () => {} });
  }

  onRowAction({ action, row }: DataGridRowActionEvent<announcementGetData>): void {
    switch (action.id) {
      case 'edit': this.openEdit(row); break;
      case 'reschedule': this.reschedule(row); break;
      case 'pin': this.togglePin(row); break;
      case 'delete': this.remove(row); break;
    }
  }

  markAllRead(): void {
    this.announcements.markAllAsViewed().pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.data.forEach((item) => (item.isRead = true));
        this.data = [...this.data];
        this.toaster.success('All announcements marked as read');
        if (this.activeViewId === 'unread') this.load();
      },
      error: () => this.toaster.error('Could not mark announcements as read'),
    });
  }

  acknowledge(item: announcementGetData): void {
    this.isAcknowledging = true;
    this.announcements.acknowledge(item._id).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.isAcknowledging = false;
        item.isAcknowledged = true;
        item.isRead = true;
        if (item.ackCount !== undefined) item.ackCount += 1;
        this.data = [...this.data];
        this.updateViewCounts();
        this.toaster.success('Thanks, your acknowledgement was recorded');
      },
      error: () => {
        this.isAcknowledging = false;
        this.toaster.error('Could not record your acknowledgement');
      },
    });
  }

  openCreate(): void {
    this.editTarget = null;
    this.formOpen = true;
  }

  openEdit(item: announcementGetData): void {
    this.editTarget = item;
    this.formOpen = true;
  }

  onFormClosed(): void {
    this.formOpen = false;
    this.editTarget = null;
  }

  onFormSaved(): void {
    const edited = !!this.editTarget;
    this.onFormClosed();
    if (edited) this.grid?.closeDetail();
    this.load();
  }

  /** An expired announcement can't be edited back to life: it is re-issued as a new one with fresh dates. */
  private async reschedule(item: announcementGetData): Promise<void> {
    const today = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const todayIso = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
    const answer = await this.formPrompt.prompt({
      title: 'Reschedule announcement',
      message: 'This creates a new announcement with the dates below. The expired one stays in the Expired list.',
      confirmLabel: 'Reschedule',
      fields: [
        { key: 'publishOn', label: 'Goes live on', type: 'date', required: true, min: todayIso, value: todayIso },
        { key: 'expiresOn', label: 'Expiry date', type: 'date', min: todayIso, hint: 'Optional. Leave empty for no expiry.' },
      ],
    });
    if (!answer) return;
    const [py, pm, pd] = answer['publishOn'].split('-').map(Number);
    const publishAt = answer['publishOn'] === todayIso ? new Date() : new Date(py, pm - 1, pd, 0, 0, 0);
    let expiresAt: Date | null = null;
    if (answer['expiresOn']) {
      const [ey, em, ed] = answer['expiresOn'].split('-').map(Number);
      expiresAt = new Date(ey, em - 1, ed, 23, 59, 59);
      if (expiresAt.getTime() <= publishAt.getTime()) {
        this.toaster.warning('The expiry date must be after it goes live');
        return;
      }
    }
    this.announcements.createAnnouncement({
      isEdit: false,
      _id: undefined,
      title: item.title,
      description: item.description,
      category: item.category?.length ? item.category : ['all'],
      type: item.type,
      priority: item.priority,
      publishAt: publishAt.toISOString(),
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
      link: item.link || null,
      pinned: !!item.pinned,
      requireAck: !!item.requireAck,
      status: 'published',
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => {
        this.toaster.success(res?.message || 'Announcement rescheduled');
        this.grid?.closeDetail();
        this.load();
      },
      error: (error) => this.toaster.error(error?.error?.message || 'Could not reschedule the announcement'),
    });
  }

  private togglePin(item: announcementGetData): void {
    this.announcements.togglePin(item._id).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res: { pinned: boolean }) => {
        item.pinned = res.pinned;
        this.toaster.success(res.pinned ? 'Pinned to the top' : 'Unpinned');
        // Pinned items sort first, so the order changes
        this.load();
      },
      error: () => this.toaster.error('Could not update the pin'),
    });
  }

  private async remove(item: announcementGetData): Promise<void> {
    const { confirmed } = await this.confirm.open({
      tone: 'reject',
      title: 'Delete announcement?',
      message: 'It will be removed for everyone, and a scheduled notification will not be sent.',
      details: [{ label: 'Title', value: item.title }],
      consequence: 'This cannot be undone.',
      confirmLabel: 'Delete',
    });
    if (!confirmed) return;

    this.announcements.deleteAnnouncement(item._id).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.grid?.closeDetail();
        this.load();
        this.toaster.success('Announcement deleted');
      },
      error: () => this.toaster.error('Failed to delete announcement'),
    });
  }

  retry(): void {
    this.load();
  }

  private load(): void {
    this.isLoading = true;
    this.announcements.getAnnouncement(this.query).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => {
        this.loadError = false;
        this.canManage = res.canManage;
        this.total = res.total;
        this.data = res.announcements;
        this.syncViews();
        this.isLoading = false;
      },
      error: () => {
        this.loadError = true;
        this.data = [];
        this.isLoading = false;
      },
    });
  }

  /** Authors get the extra state views once the server says they can manage; counts come from the badge signals. */
  private syncViews(): void {
    const base = this.views.filter((v) => !['scheduled', 'draft', 'expired'].includes(v.id));
    const manage: DataGridView<announcementGetData>[] = this.canManage
      ? (['scheduled', 'draft', 'expired'] as AnnouncementState[]).map((state) => ({
          id: state, label: state === 'draft' ? 'Drafts' : STATE_META[state].label, hideCount: true,
        }))
      : [];
    this.views = [...base, ...manage];
    this.updateViewCounts();
  }

  private updateViewCounts(): void {
    this.views = this.views.map((view) => {
      if (view.id === 'unread') return { ...view, count: this.announcements.unread() };
      if (view.id === 'ack') return { ...view, count: this.announcements.pendingAck() };
      return view;
    });
  }

  private openById(id: string): void {
    const inList = this.data.find((item) => item._id === id);
    if (inList) {
      this.grid?.openRow(inList);
      return;
    }
    this.announcements.getAnnouncementById(id).pipe(takeUntil(this.destroy$)).subscribe({
      next: (item) => this.grid?.openRow(item),
      error: () => this.toaster.warning('That announcement is no longer available'),
    });
  }

  private dateLabel(value: string | Date | null | undefined): string {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? '—'
      : date.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  private buildColumns(): DataGridColumn<announcementGetData>[] {
    const badgeMap = (options: { value: string; chip: string }[]) =>
      Object.fromEntries(options.map((o) => [o.value, o.chip + ' border-transparent']));
    return [
      {
        key: 'title', label: 'Title', locked: true,
        cellClass: (row) => (row.isRead || row.state !== 'active' ? null : 'font-semibold text-gray-900 dark:text-gray-100'),
      },
      {
        key: 'priority', label: 'Priority', width: '8rem', type: 'badge',
        valueGetter: (row) => row.priority || 'normal',
        badgeClasses: badgeMap(PRIORITY_OPTIONS), badgeLabel: this.priorityLabel,
        filterOptions: PRIORITY_OPTIONS.map((o) => ({ label: o.label, value: o.value })),
      },
      {
        key: 'type', label: 'Type', width: '9rem', type: 'badge',
        valueGetter: (row) => row.type || (row.celeb ? 'celebration' : 'general'),
        badgeClasses: badgeMap(TYPE_OPTIONS), badgeLabel: (value) => TYPE_OPTIONS.find((o) => o.value === value)?.label ?? value,
        filterOptions: TYPE_OPTIONS.map((o) => ({ label: o.label, value: o.value })),
      },
      { key: 'authorName', label: 'Posted By', valueGetter: (row) => row.authorName || '—' },
      { key: 'publishAt', label: 'Published', type: 'date', width: '120px', valueGetter: (row) => publishDateOf(row) },
      { key: 'audience', label: 'Audience', valueGetter: (row) => this.audience(row) },
      {
        key: 'state', label: 'Status', width: '8rem', type: 'badge', visible: false,
        valueGetter: (row) => row.state || 'active',
        badgeClasses: Object.fromEntries(Object.entries(STATE_META).map(([k, v]) => [k, v.chip + ' border-transparent'])),
        badgeLabel: (value) => STATE_META[value as AnnouncementState]?.label ?? value,
      },
    ];
  }

  private buildRowActions(): void {
    this.rowActions = [
      { id: 'pin', label: 'Pin / unpin', icon: 'flag', quick: true, hidden: (row) => !this.canManage || row.state !== 'active' },
      { id: 'edit', label: 'Edit', icon: 'edit', quick: true, hidden: (row) => !this.canManage || row.state === 'expired' },
      { id: 'reschedule', label: 'Reschedule', icon: 'calendar', quick: true, hidden: (row) => !this.canManage || row.state !== 'expired' },
      { id: 'delete', label: 'Delete', icon: 'delete', variant: 'danger', hidden: () => !this.canManage },
    ];
  }
}
