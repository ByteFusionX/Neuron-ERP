import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, TemplateRef, inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { HttpEventType } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import * as FileSaver from 'file-saver';
import { Observable } from 'rxjs';
import { QuotationService } from 'src/app/core/services/quotation/quotation.service';
import { EventsService } from 'src/app/core/services/events/events.service';
import { EventActionsService } from 'src/app/core/services/events/event-actions.service';
import { EnquiryService } from 'src/app/core/services/enquiry/enquiry.service';
import { ModalService } from 'src/app/shared/components/modal';
import { ConfirmDialogService } from 'src/app/shared/components/confirm-dialog';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { DetailOverviewComponent } from 'src/app/shared/components/detail-panel/detail-overview.component';
import { DetailDocumentsComponent } from 'src/app/shared/components/detail-panel/detail-documents.component';
import { DetailTableComponent } from 'src/app/shared/components/detail-panel/detail-table.component';
import { DetailTaskListComponent } from 'src/app/shared/components/detail-panel/detail-task-list.component';
import { DetailPanelIconComponent } from 'src/app/shared/components/detail-panel/detail-panel-icon.component';
import { FollowUpPanelComponent } from 'src/app/shared/components/detail-panel/follow-up-panel/follow-up-panel.component';
import { FollowUpCreateModalComponent, FollowUpModalResult } from 'src/app/shared/components/detail-panel/task-create-modal/follow-up-create-modal.component';
import { DetailDocument, DetailOverviewSection, DetailTableColumn, DetailTaskItem } from 'src/app/shared/components/detail-panel/detail-panel.model';
import { DataGridDetailTab } from 'src/app/shared/components/data-grid/data-grid.model';
import { FollowUpViewModel, followUpViewer } from 'src/app/shared/utils/follow-up.util';
import { getDepartment } from 'src/app/shared/interfaces/department.interface';
import { Events } from 'src/app/shared/interfaces/evets.interface';
import { Quotatation, QuoteStatus } from 'src/app/shared/interfaces/quotation.interface';
import { NumberFormatterPipe } from 'src/app/shared/pipes/numFormatter.pipe';
import { DealView, buildDealView, hasDeal } from '../deal-form/deal-view';

/**
 * The quotation list's detail-panel tabs and bodies (Details, Items, Follow-ups, Events, Documents,
 * Deal Sheet), for the quotation view page's right panel. Same tabs, same bodies, same per-tab
 * actions; the 'dg' fields the list binds to grid columns are plain fields here, as there is no grid.
 */
@Component({
  selector: 'app-quotation-side-panel',
  standalone: true,
  imports: [CommonModule, ActionButtonComponent, DetailDocumentsComponent, DetailTaskListComponent, DetailPanelIconComponent, FollowUpPanelComponent],
  providers: [DatePipe, NumberFormatterPipe],
  template: `
    <nav role="tablist"
      class="qsp-tabs sticky top-0 z-10 flex h-11 shrink-0 flex-nowrap items-center gap-x-4 overflow-x-auto overflow-y-hidden border-b border-gray-300 bg-white px-5 dark:border-neutral-700 dark:bg-[#111111]">
      <button *ngFor="let t of tabs" type="button" role="tab" (click)="activeTab = t.id"
        [attr.aria-selected]="activeTab === t.id"
        class="-mb-px flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 py-2.5 text-sm transition-colors"
        [ngClass]="activeTab === t.id ? 'border-violet-600 dark:border-gray-100 text-gray-900 dark:text-gray-100 font-medium' : 'border-transparent text-gray-500 dark:text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'">
        <app-dp-icon *ngIf="t.icon && (tabs.length <= 5 || activeTab === t.id)" [name]="t.icon" size="w-3.5 h-3.5"></app-dp-icon>
        {{ t.label }}
      </button>
    </nav>

    <div class="qsp-body min-h-0 flex-1 space-y-5 overflow-y-auto p-5" role="tabpanel">
      <ng-container [ngSwitch]="activeTab">
        <app-follow-up-panel *ngSwitchCase="'followups'" subject="quotation" [view]="followUpView" [closed]="followUpClosed" (cancel)="onCancelFollowUp()"></app-follow-up-panel>

        <app-detail-task-list *ngSwitchCase="'events'"
          [items]="eventItems"
          defaultFilter="event"
          [showTasks]="false"
          [showEvents]="true"
          (add)="onAddEvent()"
          (toggle)="onToggleEvent($event)"
          (eventOutcome)="onEventOutcome($event.item, $event.status)"
          (remove)="onDeleteEvent($event)"
          (previewFile)="onPreviewEventFile($event.file)"
          (deleteFile)="onDeleteEventFile($event.item, $event.file)"></app-detail-task-list>

        <app-detail-documents *ngSwitchCase="'lpo'"
          title="Customer LPO"
          emptyMessage="No Documents uploaded yet."
          [documents]="lpoDocuments"
          [removable]="quote.dealData?.status === 'rejected' || quote.dealData?.status === 'revoked'"
          [removeDetails]="lpoRemoveDetails"
          (open)="onLpoPreviewDoc($event)"
          (download)="onLpoDownloadDoc($event)"
          (remove)="onLpoRemoveDoc($event)"></app-detail-documents>

        <ng-container *ngSwitchCase="'terms'">
          <ng-container *ngTemplateOutlet="termsTemplate"></ng-container>
        </ng-container>

        <ng-container *ngSwitchCase="'revisions'">
          <ng-container *ngTemplateOutlet="revisionsTemplate"></ng-container>
        </ng-container>

        <ng-container *ngSwitchCase="'history'">
          <ng-container *ngTemplateOutlet="historyTemplate"></ng-container>
        </ng-container>
      </ng-container>
    </div>

    <!-- per-tab actions, as in the list panel's footer (left side) -->
    <div class="qsp-footer">
      <ng-container *ngIf="activeTab === 'followups' && !followUpClosed">
        <ng-container *ngIf="followUpView.open; else scheduleOnly">
          <app-action-button variant="outline" (click)="onScheduleFollowUp()">Reschedule</app-action-button>
          <app-action-button variant="outline" (click)="onLogFollowUp()">Mark done</app-action-button>
        </ng-container>
        <ng-template #scheduleOnly>
          <app-action-button variant="outline" icon="plus" (click)="onLogFollowUp()">Add follow-up</app-action-button>
        </ng-template>
      </ng-container>
      <app-action-button *ngIf="activeTab === 'events'" variant="outline" icon="plus" (click)="onAddEvent()">Add event</app-action-button>
      <app-action-button *ngIf="activeTab === 'lpo' && canUploadLpo" variant="outline" (click)="uploadLpo.emit()">Upload LPO</app-action-button>
    </div>
  `,
  styles: [`
    :host { display: flex; flex-direction: column; min-height: 0; height: 100%; }
    /* same thin scrollbar as the items table */
    .qsp-tabs, .qsp-body { scrollbar-width: thin; scrollbar-color: #d1d5db transparent; }
    .qsp-tabs::-webkit-scrollbar, .qsp-body::-webkit-scrollbar { width: 6px; height: 6px; }
    .qsp-tabs::-webkit-scrollbar-track, .qsp-body::-webkit-scrollbar-track { background: transparent; }
    .qsp-tabs::-webkit-scrollbar-thumb, .qsp-body::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 9999px; }
    :host-context(html.dark) .qsp-tabs, :host-context(html.dark) .qsp-body { scrollbar-color: #404040 transparent; }
    :host-context(html.dark) .qsp-tabs::-webkit-scrollbar-thumb, :host-context(html.dark) .qsp-body::-webkit-scrollbar-thumb { background: #404040; }
    .qsp-footer { flex-shrink: 0; display: flex; align-items: center; gap: 0.5rem; padding: 0.75rem 1.25rem; border-top: 1px solid #f3f4f6; background: #fff; }
    .qsp-footer:not(:has(button, a)) { display: none; }
    :host-context(html.dark) .qsp-footer { border-top-color: #262626; background: #111111; }
  `],
})
export class QuotationSidePanelComponent implements OnChanges {
  @Input({ required: true }) quote!: Quotatation;
  /** The page owns the LPO upload flow (modal, upload, reload); the panel only asks for it. */
  @Output() uploadLpo = new EventEmitter<void>();

  private _quoteService = inject(QuotationService);
  private _eventsService = inject(EventsService);
  private _eventActions = inject(EventActionsService);
  private _enquiryService = inject(EnquiryService);
  private modal = inject(ModalService);
  private confirm = inject(ConfirmDialogService);
  private toaster = inject(ToastrService);
  private datePipe = inject(DatePipe);
  private numberFormat = inject(NumberFormatterPipe);

  /** The page's customer notes / terms markup. */
  @Input() termsTemplate: TemplateRef<unknown> | null = null;
  /** The page's revision history; the tab is left out while this is null. */
  @Input() revisionsTemplate: TemplateRef<unknown> | null = null;
  /** The page's edit log; the tab is left out while this is null. */
  @Input() historyTemplate: TemplateRef<unknown> | null = null;

  private readonly baseTabs: DataGridDetailTab[] = [
    { id: 'followups', label: 'Follow-ups', icon: 'chat' },
    { id: 'events', label: 'Events', icon: 'calendar' },
    { id: 'lpo', label: 'Documents', icon: 'files' },
    { id: 'terms', label: 'Terms', icon: 'info' },
  ];
  tabs: DataGridDetailTab[] = this.baseTabs;
  activeTab = 'followups';

  /** Switch tabs from the page (e.g. the header's revision chip); ignored if the tab isn't shown. */
  show(id: string): void {
    if (this.tabs.some((t) => t.id === id)) this.activeTab = id;
  }

  readonly itemColumns: DetailTableColumn[] = [
    { key: 'item', label: 'Item', type: 'html', wrap: true, clamp: true, tooltipKey: 'itemTooltip', width: '22rem' },
    { key: 'qty', label: 'Qty', type: 'number' },
    { key: 'price', label: 'Price', type: 'currency' },
    { key: 'amount', label: 'Amount', type: 'currency', total: true },
  ];

  overviewSections: DetailOverviewSection[] = [];
  dealSummarySection!: DetailOverviewSection;
  itemRows: Record<string, any>[] = [];
  lpoDocuments: DetailDocument[] = [];
  followUpView!: FollowUpViewModel;
  followUpClosed = false;
  events: Events[] = [];
  eventItems: DetailTaskItem[] = [];

  private readonly followUpViewFor = followUpViewer();
  private followUpSaving = false;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['revisionsTemplate'] || changes['historyTemplate']) {
      this.tabs = [
        ...this.baseTabs,
        ...(this.revisionsTemplate ? [{ id: 'revisions', label: 'Revisions', icon: 'clock' }] : []),
        ...(this.historyTemplate ? [{ id: 'history', label: 'History', icon: 'clock' }] : []),
      ];
      if (!this.tabs.some((t) => t.id === this.activeTab)) this.activeTab = 'followups';
    }
    if (!changes['quote'] || !this.quote) return;
    const prev = changes['quote'].previousValue as Quotatation | undefined;
    this.rebuild();
    if (prev?._id !== this.quote._id) this.loadEvents();
  }

  private rebuild(): void {
    const row = this.quote;
    this.followUpClosed = ['Won', 'Lost', 'Expired'].includes(String(row.status));
    this.followUpView = this.followUpViewFor(row, row.followUp, this.followUpClosed);
    this.overviewSections = this.buildOverviewSections(row);
    this.dealSummarySection = this.buildDealSummarySection(row);
    this.itemRows = this.buildItemRows(row);
    this.lpoDocuments = (row.lpoFiles || []).map((file: any) => ({
      id: file.fileName,
      name: file.originalname,
      kind: this.lpoFileKind(file),
    }));
  }

  get canUploadLpo(): boolean {
    return this.quote.status === 'Won' && !this.quote.lpoFiles?.length;
  }

  // ---- items ----

  private buildItemRows(row: Quotatation): Record<string, any>[] {
    const rows: Record<string, any>[] = [];
    (row.optionalItems ?? []).forEach((opt) => {
      (opt.items ?? []).forEach((item) => {
        (item.itemDetails ?? []).forEach((d) => {
          rows.push({ item: d.detail, itemTooltip: d.detail, qty: d.quantity, price: d.unitSellingPrice, amount: (d.quantity ?? 0) * (d.unitSellingPrice ?? 0) });
        });
      });
    });
    return rows;
  }

  // ---- details / deal sheet ----

  private formatAmount(row: Quotatation): string {
    const opt = row.optionalItems?.[0];
    let total = 0;
    (opt?.items ?? []).forEach((item) => (item.itemDetails ?? []).forEach((d) => (total += (d.unitSellingPrice ?? 0) * (d.quantity ?? 0))));
    return `${this.numberFormat.transform(total - (opt?.totalDiscount ?? 0))} ${row.currency}`;
  }

  private departmentNames(element: { department?: getDepartment; departments?: getDepartment[] }): string {
    const departments = element?.departments?.length ? element.departments : element?.department ? [element.department] : [];
    return departments.map((dept) => dept?.departmentName).filter(Boolean).join(', ');
  }

  private fullName(person?: { firstName?: string; lastName?: string } | string): string {
    if (!person || typeof person === 'string') return '—';
    return `${person.firstName || ''} ${person.lastName || ''}`.trim() || '—';
  }

  private dealView(row: Quotatation): DealView {
    return buildDealView(row, {
      number: (n) => this.numberFormat.transform(n),
      date: (v) => this.datePipe.transform(v as string, 'dd MMM yyyy'),
    });
  }

  private buildDealSummarySection(row: Quotatation): DetailOverviewSection {
    const deal: any = row.dealData;
    const approver = deal?.approvedBy && typeof deal.approvedBy === 'object'
      ? `${deal.approvedBy.firstName ?? ''} ${deal.approvedBy.lastName ?? ''}`.trim() : '';
    const full = hasDeal(row);
    return {
      title: 'Deal Sheet',
      columns: '2',
      visible: !!row.dealData,
      emptyMessage: 'No deal data for this quotation yet.',
      fields: [
        { type: 'field', label: 'Deal Id', value: deal?.dealId, numeric: true, noHover: true, visible: full },
        { type: 'field', label: 'Status', value: deal?.status || '—', pill: !!deal?.status, tone: ({ pending: 'warn', approved: 'good', rejected: 'bad' } as const)[deal?.status as 'pending'] ?? 'neutral', noHover: true },
        { type: 'field', label: 'Selling price', value: full ? this.dealView(row).sellingPrice : '', numeric: true, noHover: true, visible: full },
        { type: 'field', label: 'Payment terms', value: deal?.paymentTerms || '—', noHover: true, visible: full },
        { type: 'field', label: 'Approved by', value: approver, noHover: true, visible: !!approver },
      ],
    };
  }

  private handoverStep(row: Quotatation): { stage: string; next: string; tone: 'neutral' | 'info' | 'warn' | 'good' | 'bad' } {
    const dealStatus = row.dealData?.status?.toLowerCase();
    if (row.status !== QuoteStatus.Won) {
      return { stage: 'Quotation not won', next: 'Mark the quote Won after customer confirmation.', tone: row.status === QuoteStatus.Lost ? 'bad' : 'neutral' };
    }
    if (!row.lpoFiles?.length) {
      return { stage: 'Waiting for customer LPO', next: 'Upload the customer LPO to accept the quote.', tone: 'warn' };
    }
    if (!row.dealData || !(row.dealData as any)._id) {
      return { stage: 'LPO received', next: 'Convert the quotation to a deal sheet.', tone: 'info' };
    }
    if (dealStatus === 'pending') {
      return { stage: 'Deal sheet pending approval', next: 'Wait for deal sheet approval before job handover.', tone: 'warn' };
    }
    if (dealStatus === 'approved') {
      return { stage: 'Deal sheet approved', next: 'Create or continue the job sheet from the Job Sheet module.', tone: 'good' };
    }
    if (dealStatus === 'rejected') {
      return { stage: 'Deal sheet rejected', next: 'Revise and resubmit the deal sheet, or update the quote status.', tone: 'bad' };
    }
    return { stage: `Deal sheet ${dealStatus || 'in progress'}`, next: 'Review the deal sheet status.', tone: 'info' };
  }

  private buildOverviewSections(row: Quotatation): DetailOverviewSection[] {
    const handover = this.handoverStep(row);
    return [
      {
        title: 'General',
        columns: '2',
        fields: [
          { type: 'field', label: 'Quote Id', value: row.quoteId, numeric: true },
          { type: 'field', label: 'Status', value: row.status || '—', noHover: true },
          { type: 'field', label: 'Customer', value: row.client?.companyName },
          { type: 'field', label: 'Sales Person', value: this.fullName(row.createdBy as any) },
          ...(row.createdByUser ? [{ type: 'field' as const, label: 'Created By User', value: this.fullName(row.createdByUser), noHover: true }] : []),
          { type: 'field', label: 'Department', value: this.departmentNames(row) },
          { type: 'field', label: 'Quoted Date', value: this.datePipe.transform(row.quotedDate ?? row.date, 'dd MMM yyyy') },
          { type: 'field', label: 'Closing / Valid Until', value: (row.closingDate || row.validityDate) ? this.datePipe.transform(row.closingDate || row.validityDate, 'dd MMM yyyy') : '—', noHover: true },
          { type: 'field', label: 'Payment Terms', value: row.paymentTerms || '—', noHover: true },
          { type: 'field', label: 'Delivery Terms', value: row.deliveryTerms || '—', noHover: true },
          ...(row.revision ? [{ type: 'field' as const, label: 'Revision', value: `Rev ${row.revision}`, noHover: true }] : []),
        ],
      },
      {
        title: 'Overview',
        fields: [
          { type: 'field', label: 'Subject', value: row.subject, noHover: true },
          { type: 'field', label: 'Amount', value: this.formatAmount(row), numeric: true, noHover: true },
          { type: 'field', label: 'Lost Reason', value: row.lostReason || '—', noHover: true, visible: row.status === 'Lost' },
          { type: 'field', label: 'Customer PO', value: row.customerAcceptance?.customerPoNumber || '—', noHover: true, visible: !!row.customerAcceptance },
          { type: 'field', label: 'Accepted By', value: row.customerAcceptance?.acceptedByName || '—', noHover: true, visible: !!row.customerAcceptance },
        ],
      },
      {
        title: 'Handover',
        columns: '2',
        fields: [
          { type: 'field', label: 'Current step', value: handover.stage, tone: handover.tone, noHover: true },
          { type: 'field', label: 'Next action', value: handover.next, noHover: true },
          { type: 'field', label: 'LPO status', value: row.lpoFiles?.length ? `${row.lpoFiles.length} file(s) uploaded` : 'Not uploaded', noHover: true },
          { type: 'field', label: 'Deal sheet', value: row.dealData?.dealId || 'Not created', noHover: true },
        ],
      },
    ];
  }

  // ---- follow-ups ----

  onScheduleFollowUp(): void {
    const row = this.quote;
    const open = this.followUpView.open;
    this.modal.open<FollowUpModalResult>(FollowUpCreateModalComponent, {
      width: '520px',
      data: { context: row.quoteId || row._id, mode: 'schedule', dueDate: open?.dueIso || null },
    }).afterClosed().subscribe((result) => {
      if (result?.mode === 'schedule') this.saveFollowUp(this._quoteService.scheduleQuoteFollowUp(row._id as string, { dueDate: result.dueDate, note: result.note }), 'Follow-up scheduled');
    });
  }

  onLogFollowUp(): void {
    const row = this.quote;
    const open = this.followUpView.open;
    this.modal.open<FollowUpModalResult>(FollowUpCreateModalComponent, {
      width: '520px',
      data: { context: row.quoteId || row._id, mode: 'complete', plannedFor: open?.due || null },
    }).afterClosed().subscribe((result) => {
      if (result?.mode === 'schedule') this.saveFollowUp(this._quoteService.scheduleQuoteFollowUp(row._id as string, { dueDate: result.dueDate, note: result.note }), 'Follow-up scheduled');
      else if (result?.mode === 'complete') {
        this.saveFollowUp(this._quoteService.completeQuoteFollowUp(row._id as string, {
          date: result.date, outcome: result.outcome, note: result.note, nextFollowUpDate: result.nextFollowUpDate,
        }), 'Follow-up logged');
      }
    });
  }

  async onCancelFollowUp(): Promise<void> {
    const open = this.followUpView.open;
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
    this.saveFollowUp(this._quoteService.cancelQuoteFollowUp(this.quote._id as string, reason), 'Follow-up cancelled');
  }

  private saveFollowUp(request: Observable<{ success: boolean; followUp: any }>, successMessage: string): void {
    if (this.followUpSaving) return;
    this.followUpSaving = true;
    request.subscribe({
      next: (response) => {
        this.quote.followUp = response.followUp;
        this.followUpSaving = false;
        this.rebuild();
        this.toaster.success(successMessage);
      },
      error: (err) => {
        this.followUpSaving = false;
        this.toaster.error(err?.error?.message || 'Failed to save follow-up');
      },
    });
  }

  // ---- events ----

  private loadEvents(): void {
    const id = this.quote._id as string;
    this._eventsService.fetchEvents(id).subscribe((events: Events[]) => {
      if (this.quote._id !== id) return;
      this.setEvents(events || []);
    });
  }

  private setEvents(events: Events[]): void {
    this.events = events;
    this.eventItems = this._eventActions.toItems(events);
  }

  onAddEvent(): void {
    const row = this.quote;
    this._eventActions.create({
      from: 'Quotation',
      collectionId: row._id as string,
      context: row.quoteId || (row._id as string),
      contactDetails: row.client?.contactDetails,
    }).subscribe((created) => {
      if (created) this.loadEvents();
    });
  }

  onToggleEvent(item: DetailTaskItem): void {
    this._eventActions.markCompleted(item).subscribe((ok) => {
      if (ok) this.setEvents(this.events.map((e) => (e._id === item.id ? { ...e, status: 'completed' } : e)));
    });
  }

  async onEventOutcome(item: DetailTaskItem, status: 'success' | 'cancelled'): Promise<void> {
    (await this._eventActions.setOutcome(item, status)).subscribe((ok) => {
      if (ok) this.setEvents(this.events.map((e) => (e._id === item.id ? { ...e, status } : e)));
    });
  }

  async onDeleteEvent(item: DetailTaskItem): Promise<void> {
    (await this._eventActions.delete(item)).subscribe((ok) => {
      if (ok) this.setEvents(this.events.filter((e) => e._id !== item.id));
    });
  }

  onPreviewEventFile(file: { id: string; name: string }): void {
    this._eventActions.previewFile(file);
  }

  onDeleteEventFile(item: DetailTaskItem, file: { id: string; name: string }): void {
    this._eventActions.deleteFile(item, file).subscribe((ok) => {
      if (!ok) return;
      this.setEvents(this.events.map((e) =>
        e._id === item.id ? { ...e, eventFiles: (e.eventFiles || []).filter((f) => f.fileName !== file.id) } : e));
    });
  }

  // ---- LPO documents ----

  private lpoFileKind(file: any): string {
    const name: string = file?.originalname || file?.fileName || '';
    const ext = name.split('.').pop();
    return ext ? ext.toUpperCase().slice(0, 4) : 'FILE';
  }

  readonly lpoRemoveDetails = (doc: DetailDocument) => [
    { label: 'Quotation Id', value: this.quote.quoteId ?? '' },
    { label: 'Customer', value: this.quote.client?.companyName ?? '' },
    { label: 'File Name', value: doc.name },
  ];

  private findLpoFile(doc: DetailDocument): any {
    return this.quote.lpoFiles?.find((file: any) => file.fileName === doc.id);
  }

  onLpoPreviewDoc(doc: DetailDocument): void {
    const file = this.findLpoFile(doc);
    if (!file) return;
    this._enquiryService.getFile(file.fileName).subscribe({
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

  onLpoDownloadDoc(doc: DetailDocument): void {
    const file = this.findLpoFile(doc);
    if (!file) return;
    this._enquiryService.downloadFile(file.fileName).subscribe({
      next: (event) => {
        if (event.type === HttpEventType.Response) FileSaver.saveAs(new Blob([event.body]), file.originalname);
      },
      error: (error) => {
        if (error.status === 404) this.toaster.warning('Sorry, the requested file was not found on the server.');
        else this.toaster.error('An error occurred while downloading the file.');
      },
    });
  }

  onLpoRemoveDoc(doc: DetailDocument): void {
    const index = this.quote.lpoFiles?.findIndex((file: any) => file.fileName === doc.id) ?? -1;
    const file = this.quote.lpoFiles?.[index];
    if (!file) return;
    this._quoteService.removeLpo(file.fileName, this.quote._id as string).subscribe((response: any) => {
      if (response?.success) {
        this.quote.lpoFiles?.splice(index, 1);
        this.rebuild();
      }
    });
  }
}
