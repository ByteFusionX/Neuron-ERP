import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule, formatDate } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { ToastrService } from 'ngx-toastr';
import { HttpEventType } from '@angular/common/http';
import { BehaviorSubject, Subscription, combineLatest, filter, map, switchMap, take, tap } from 'rxjs';
import { EventsService } from 'src/app/core/services/events/events.service';
import { EnquiryService } from 'src/app/core/services/enquiry/enquiry.service';
import { ModalService } from 'src/app/shared/components/modal';
import { EventCreateModalComponent, EventModalResult } from 'src/app/shared/components/detail-panel/task-create-modal/event-create-modal.component';
import { DetailTaskListComponent } from 'src/app/shared/components/detail-panel/detail-task-list.component';
import { SfOption } from 'src/app/shared/components/smart-form';
import { ContactDetail } from 'src/app/shared/interfaces/customer.interface';
import { Events } from 'src/app/shared/interfaces/evets.interface';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { ProfileService } from 'src/app/core/services/profile/profile.service';
import { getDepartment } from 'src/app/shared/interfaces/department.interface';
import { StatusUpdateModalComponent, StatusUpdateModalData, StatusUpdateResult } from '../status-update-modal/status-update-modal.component';
import { QuotationService } from 'src/app/core/services/quotation/quotation.service';
import { PdfPreviewComponent } from 'src/app/shared/components/pdf-preview/pdf-preview.component';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { ConfirmDialogService } from 'src/app/shared/components/confirm-dialog';
import { EditHistoryModalComponent } from 'src/app/shared/components/edit-history-modal/edit-history-modal.component';
import { RevisionHistoryModalComponent } from '../revision-history-modal/revision-history-modal.component';
import { QuoteFormDrawerComponent } from '../quote-form-drawer/quote-form-drawer.component';
import { DetailRevisionChipComponent } from 'src/app/shared/components/detail-panel/detail-revision-chip.component';
import {
  FileUploadModalComponent,
  FileUploadModalData,
} from 'src/app/shared/components/file-upload-modal/file-upload-modal.component';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { DetailSectionComponent } from 'src/app/shared/components/detail-panel/detail-section.component';
import { DetailFieldComponent } from 'src/app/shared/components/detail-panel/detail-field.component';
import { DetailBadgeComponent } from 'src/app/shared/components/detail-panel/detail-badge.component';
import { DetailTableComponent } from 'src/app/shared/components/detail-panel/detail-table.component';
import { DetailDocumentsComponent } from 'src/app/shared/components/detail-panel/detail-documents.component';
import { DetailMetricsComponent } from 'src/app/shared/components/detail-panel/detail-metrics.component';
import { DetailOverviewComponent } from 'src/app/shared/components/detail-panel/detail-overview.component';
import { DetailClauseListComponent } from 'src/app/shared/components/detail-panel/detail-clause-list.component';
import { DetailClause, DetailDocument, DetailSummaryRow, DetailTableColumn, DetailTaskItem } from 'src/app/shared/components/detail-panel/detail-panel.model';
import { DetailTone } from 'src/app/shared/components/detail-panel/detail-tone';
import { DEAL_COST_COLUMNS, DealView, buildDealView, hasDeal } from '../deal-form/deal-view';
import { marginFromPrice } from '../deal-form/deal-pricing';
import {
  DetailViewBadge,
  DetailViewBreadcrumb,
  DetailViewShellComponent,
  DetailViewStat,
} from 'src/app/shared/components/detail-view-shell/detail-view-shell.component';
import { getQuotatation, QuoteStatus } from 'src/app/shared/interfaces/quotation.interface';
import { DomSanitizer } from '@angular/platform-browser';
import { ParseBoldTextPipe } from '../../../../shared/pipes/boldParse.pipe';
import { ParseBracketsTextPipe } from '../../../../shared/pipes/highlightParse.pipe';
import { NumberFormatterPipe } from '../../../../shared/pipes/numFormatter.pipe';

type Tab = 'overview' | 'items' | 'pricing' | 'deal' | 'documents' | 'events' | 'history';

const QUOTE_STATUS_TONE: Record<string, DetailTone> = {
  Won: 'good',
  Lost: 'bad',
  Expired: 'neutral',
  Draft: 'neutral',
};
const DEAL_STATUS_TONE: Record<string, DetailTone> = { pending: 'warn', approved: 'good', rejected: 'bad' };

/** A label/value row in the quotation view's right panel. */
export interface QvFact {
  label: string;
  value: string;
  tone?: DetailTone | null;
  numeric?: boolean;
  /** Renders the value as a status pill (tone-coloured). */
  pill?: boolean;
  /** Renders the value as a violet link to that route (with optional query params). */
  link?: any[];
  queryParams?: Record<string, any>;
  /** Renders the value as a violet button that opens the deal sheet. */
  deal?: boolean;
}

/** One field-level edit inside a history entry. */
export interface QvHistoryChange {
  label: string;
  from: string;
  to: string;
  /** True when the old value was never recorded, so "from" is a placeholder rather than a real value. */
  fromUnknown?: boolean;
  toUnknown?: boolean;
}

/** One entry of the quotation's audit log, as the History tab renders it. */
export interface QvHistoryEntry {
  /** What happened, e.g. "Edited" or "Deal approved". */
  action: string;
  /** The raw action key, used by the filter chips. */
  kind: string;
  tone: DetailTone;
  /** Who did it. */
  who: string;
  initials: string;
  /** "20 Sep 2026, 4:12 PM". */
  when: string;
  /** "2 hours ago". */
  ago: string;
  /** ISO timestamp, for sorting and the date group heading. */
  at: string;
  /** Date-only heading this entry sits under, e.g. "Today" or "18 Sep 2026". */
  day: string;
  /** One line describing the entry when there are no field rows to show. */
  summary: string;
  /** Present on status changes only. */
  status: { from: string; to: string } | null;
  reason: string;
  /** Set only on edits that produced a new revision, so the entry can carry a "Rev N" chip. */
  revision: number | null;
  changes: QvHistoryChange[];
}

@Component({
  selector: 'app-quotation-view',
  standalone: true,
  templateUrl: './quotation-view.component.html',
  styleUrls: ['./quotation-view.component.css'],
  imports: [
    CommonModule,
    FormsModule,
    DetailViewShellComponent,
    ActionButtonComponent,
    DetailSectionComponent,
    DetailFieldComponent,
    DetailBadgeComponent,
    DetailTableComponent,
    RouterLink,
    DetailDocumentsComponent,
    DetailTaskListComponent,
    DetailClauseListComponent,
    DetailMetricsComponent,
    DetailOverviewComponent,
    DetailRevisionChipComponent,
    QuoteFormDrawerComponent,
    NumberFormatterPipe,
  ],
})
export class QuotationViewComponent implements OnInit, OnDestroy {
  quoteData: getQuotatation | null = null;
  loading = true;
  tab: Tab = 'overview';
  selectedOption = 0;
  isDownloading = false;
  isDownloadingStamped = false;
  isPreviewing = false;
  isNoteOwner = false;
  isSuperAdmin = false;
  editOpen = false;
  /** Nudged after an edit so the page refetches the quote the same way the route does. */
  private reload$ = new BehaviorSubject<void>(undefined);

  tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'items', label: 'Items' },
    { id: 'pricing', label: 'Pricing' },
    { id: 'documents', label: 'Documents' },
    { id: 'events', label: 'Events' },
  ];
  private readonly baseTabs = this.tabs;
  private readonly dealTab: { id: Tab; label: string } = { id: 'deal', label: 'Deal sheet' };
  private readonly historyTab: { id: Tab; label: string } = { id: 'history', label: 'History' };
  /** Deal sheet tab content, built with the same helper the list panel's summary uses. */
  dealView: DealView | null = null;
  /** Selected deal lines, laid out like the Items tab. */
  dealItemRows: Record<string, any>[] = [];
  readonly dealCostCols = DEAL_COST_COLUMNS;
  /** `?tab=` is honoured once, on the first load, so later reloads don't yank the user back. */
  private tabFromUrlApplied = false;
  historyLog: QvHistoryEntry[] = [];
  events: Events[] = [];
  docList: DetailDocument[] = [];
  private docFiles = new Map<string, any>();
  readonly itemCols: DetailTableColumn[] = [
    { key: 'detail', label: 'Item Details', type: 'html', wrap: true },
    { key: 'quantity', label: 'Qty', type: 'number' },
    { key: 'unitCost', label: 'Unit Cost', align: 'right' },
    { key: 'totalCost', label: 'Total Cost', align: 'right', total: true, totalKey: 'totalCostRaw', totalFormat: '1.2-2' },
    { key: 'profit', label: 'Profit', align: 'right' },
    { key: 'unitPrice', label: 'Unit Price', align: 'right' },
    { key: 'totalPrice', label: 'Total Price', align: 'right', emphasis: true, total: true, totalKey: 'totalPriceRaw', totalFormat: '1.2-2' },
    // Anything that isn't off the shelf falls back to a neutral badge, so lead times read as "not yet".
    { key: 'availability', label: 'Avbl.', type: 'badge', badgeTones: { 'Ex-Stock': 'good', 'ex-stock': 'good' } },
  ];
  itemRows: Record<string, any>[] = [];
  /** Totals shown as the table's summary card instead of a footer row. */
  itemSummary: DetailSummaryRow[] = [];

  /** Customer notes and T&C as numbered clauses, like the project page's Terms tab. */
  get noteClauses(): DetailClause[] {
    const q = this.quoteData;
    if (!q) return [];
    // Typed as DefaultAndText, but the API returns plain strings (the PDF builder uses them as text too).
    const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
    return [
      { id: 'notes', title: 'Customer Notes', body: text(q.customerNote) },
      { id: 'terms', title: 'Terms and Conditions', body: text(q.termsAndCondition) },
    ].filter((c): c is DetailClause => !!c.body);
  }
  breadcrumbs: DetailViewBreadcrumb[] = [];
  badges: DetailViewBadge[] = [];
  stats: DetailViewStat[] = [];
  /** Sidebar label/value rows per linked record; empty values are dropped when built. */
  customerFacts: QvFact[] = [];
  enquiryFacts: QvFact[] = [];
  dealFacts: QvFact[] = [];

  private subscriptions = new Subscription();
  private confirm = inject(ConfirmDialogService);
  private numberFormatter = new NumberFormatterPipe();
  private boldPipe = new ParseBoldTextPipe();
  private bracketsPipe = new ParseBracketsTextPipe(inject(DomSanitizer));

  constructor(
    private _route: ActivatedRoute,
    private _router: Router,
    private quotationService: QuotationService,
    private _dialog: MatDialog,
    private toast: ToastrService,
    private _employeeService: EmployeeService,
    private _eventsService: EventsService,
    private _enquiryService: EnquiryService,
    private modal: ModalService,
    private _profileService: ProfileService,
  ) {}

  ngOnInit(): void {
    this.subscriptions.add(
      this._employeeService.employeeData$.subscribe((employee) => {
        this.isSuperAdmin = employee?.category.role == 'superAdmin';
        this.syncTabs();
        this.isNoteOwner = !!employee && !!this.quoteData && employee._id === this.quoteData.createdBy?._id;
      }),
    );

    this.subscriptions.add(
      combineLatest([this._route.paramMap, this.reload$])
        .pipe(
          map(([params]) => params),
          tap(() => (this.loading = true)),
          switchMap((params) =>
            this._employeeService.employeeData$.pipe(
              filter((employee) => !!employee),
              take(1),
              switchMap((employee) =>
                this.quotationService.getQuotationById(
                  params.get('id') ?? '',
                  employee?.category.privileges.quotation.viewReport,
                  employee?._id,
                ),
              ),
            ),
          ),
        )
        .subscribe({
          next: (quote) => {
            this.quoteData = quote as unknown as getQuotatation;
            this.selectedOption = 0;
            this._employeeService.employeeData$.pipe(take(1)).subscribe((employee) => {
              this.isNoteOwner = !!employee && employee._id === this.quoteData?.createdBy?._id;
            });
            this.rebuild();
            this.loading = false;
          },
          error: () => {
            this.quoteData = null;
            this.loading = false;
          },
        }),
    );
  }

  /** Base tabs, plus Deal sheet once a deal exists and History for super admins. */
  private syncTabs(): void {
    const tabs = [...this.baseTabs];
    if (hasDeal(this.quoteData)) { tabs.splice(tabs.findIndex((t) => t.id === 'pricing') + 1, 0, this.dealTab); }
    if (this.isSuperAdmin) { tabs.push(this.historyTab); }
    this.tabs = tabs;
    if (!tabs.some((t) => t.id === this.tab)) { this.tab = 'overview'; }
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  get isDealApproved(): boolean {
    return this.quoteData?.dealData?.status?.toLowerCase() === 'approved';
  }

  get departmentNames(): string {
    return (this.quoteData?.departments || []).map((d: any) => d.departmentName).join(', ');
  }

  get isEditDisabled(): boolean {
    return this.isDealApproved || (this.quoteData?.status === 'Won' && !this.isSuperAdmin);
  }

  /** Same lock the quotation list applies: an active (non-rejected) deal sheet freezes the status. */
  get isStatusLocked(): boolean {
    const q = this.quoteData;
    return q?.status === 'Expired' || (!!q?.dealData?.status && q.dealData.status !== 'rejected');
  }

  /** The status endpoint only returns the new status, so pull the fresh history entry (and revision) separately. */
  private reloadHistory(): void {
    const q = this.quoteData;
    if (!q?._id) return;
    this._employeeService.employeeData$
      .pipe(
        filter((e) => !!e),
        take(1),
        switchMap((e) => this.quotationService.getQuotationById(q._id as string, e?.category.privileges.quotation.viewReport, e?._id)),
      )
      .subscribe((fresh: any) => {
        q.editHistory = fresh?.editHistory ?? q.editHistory;
        q.revision = fresh?.revision ?? q.revision;
        this.rebuild();
      });
  }

  /** Records the customer's response (status + note). Content edits go through the full edit page. */
  onUpdateStatus(): void {
    const q = this.quoteData;
    if (!q?._id || this.isStatusLocked) return;
    this._dialog
      .open<StatusUpdateModalComponent, StatusUpdateModalData, StatusUpdateResult | null>(StatusUpdateModalComponent, {
        data: { quoteId: q._id, currentStatus: q.status as QuoteStatus },
        width: '480px',
        maxWidth: '95vw',
        autoFocus: false,
      })
      .afterClosed()
      .subscribe((result) => {
        if (!result) return;
        this.quotationService.updateQuoteStatus(q._id as string, result.status, result.reason).subscribe({
          next: (res) => {
            q.status = (res as any) || result.status;
            if (result.status === 'Won') { q.lpoFiles = [] as any; delete (q as any).dealData; }
            this.toast.success('Status updated.');
            this.reloadHistory();
            this.rebuild();
          },
          error: (e) => this.toast.error(e?.error?.message || 'Failed to update status.'),
        });
      });
  }

  onTabChange(id: string): void {
    this.tab = id as Tab;
  }

  onOptionChange(): void {
    this.rebuild();
  }

  /** The deal sheet page reads its data from router state (same shape the deal-sheet lists send), not from the URL. */
  onDealClick(): void {
    const q = this.quoteData as any;
    if (!q?.dealData) {
      return;
    }
    const priceDetails = { totalSellingPrice: 0, totalCost: 0, profit: 0, perc: 0 };
    const quoteItems = (q.dealData.updatedItems || []).map((item: any) => {
      let selected = 0;
      item.itemDetails.forEach((d: any) => {
        if (d.dealSelected) {
          selected++;
          priceDetails.totalSellingPrice += d.unitSellingPrice * d.quantity;
          priceDetails.totalCost += d.quantity * d.unitCost;
        }
      });
      return selected ? item : undefined;
    });
    (q.dealData.additionalCosts || []).forEach((cost: any) => {
      if (cost.type === 'Customer Discount') {
        priceDetails.totalSellingPrice -= cost.value;
      } else if (cost.type === 'Supplier Discount') {
        priceDetails.totalCost -= cost.value;
      } else {
        priceDetails.totalCost += cost.value;
      }
    });
    priceDetails.profit = priceDetails.totalSellingPrice - priceDetails.totalCost;
    priceDetails.perc = (priceDetails.profit / priceDetails.totalSellingPrice) * 100;

    const approved = this.isDealApproved;
    this._router.navigate(['/deal-sheet/view', q._id], {
      state: {
        approval: !approved,
        quoteData: q,
        quoteItems,
        priceDetails,
        returnUrl: `/quotations/view/${q._id}`,
      },
    });
  }

  onViewNote(): void {
    const quoteId = this.quoteData?._id;
    if (!quoteId) {
      this.toast.error('Unable to load note: quote ID is missing');
      return;
    }

    this.quotationService.getQuoteNote(quoteId).subscribe({
      next: (res) => {
        this.confirm.open({
          tone: 'note',
          title: 'Quote Note',
          message: res.saveNote || 'No note available for this quote.',
          acknowledgeOnly: true,
          confirmLabel: 'Close',
        });
      },
      error: () => this.toast.error('Failed to load note'),
    });
  }

  onViewEditHistory(): void {
    this._dialog.open(EditHistoryModalComponent, {
      data: { editHistory: this.quoteData!.editHistory || [] },
      width: '680px',
      maxWidth: '95vw',
      autoFocus: false,
    });
  }

  /** Current revision number; 0 on quotes that were never edited after being sent. */
  get revision(): number {
    return this.quoteData?.revision ?? 0;
  }

  onViewRevisions(): void {
    if (!this.quoteData?._id) {
      return;
    }
    this._dialog.open(RevisionHistoryModalComponent, {
      data: { quoteId: this.quoteData._id, quoteRef: this.quoteData.quoteId },
      width: '920px',
      maxWidth: '95vw',
      autoFocus: false,
    });
  }

  onQuoteEdit(): void {
    if (this.isEditDisabled) {
      return;
    }
    this.editOpen = true;
  }

  onQuoteEdited(): void {
    this.reload$.next();
  }

  onDownloadPdf(includeStamp: boolean): void {
    if (includeStamp) {
      this.isDownloadingStamped = true;
    } else {
      this.isDownloading = true;
    }
    const quoteData = this.quoteData!;
    this.quotationService
      .generatePDF(quoteData, includeStamp)
      .then((pdf) => {
        pdf.download(quoteData.quoteId as string);
      })
      .catch((error) => {
        console.error('Error generating PDF:', error);
        this.toast.error('Error generating PDF. Please try again.');
      })
      .finally(() => {
        if (includeStamp) {
          this.isDownloadingStamped = false;
        } else {
          this.isDownloading = false;
        }
      });
  }

  onPreviewPdf(): void {
    this.isPreviewing = true;
    const quoteData = this.quoteData!;
    this.quotationService
      .generatePDF(quoteData, true)
      .then((pdf) => {
        pdf.getBlob((blob: Blob) => {
          const url = window.URL.createObjectURL(blob);
          this.isPreviewing = false;
          this._dialog.open(PdfPreviewComponent, {
            data: { url: url, formatedQuote: quoteData },
          });
        });
      })
      .catch((error) => {
        this.isPreviewing = false;
        console.error('Error generating PDF:', error);
        this.toast.error('Error generating PDF. Please try again.');
      });
  }

  viewAttachments(): void {
    const enquiry = this.quoteData?.enqId;
    if (!enquiry?.attachments?.length) {
      this.toast.info('No attachments uploaded for this enquiry');
      return;
    }
    this.openFiles(`Enquiry Attachments - ${enquiry.enquiryId}`, enquiry.attachments as any);
  }

  viewPresaleFiles(): void {
    const enquiry = this.quoteData?.enqId;
    if (!enquiry?.preSale?.presaleFiles?.length) {
      this.toast.info('No pre-sale files uploaded for this enquiry');
      return;
    }
    this.openFiles(`Pre-Sale Files - ${enquiry.enquiryId}`, enquiry.preSale.presaleFiles as any);
  }

  openDocument(doc: DetailDocument): void {
    const file = this.docFiles.get(doc.id);
    if (file) {
      this.openFiles(`${doc.uploadedBy} - ${doc.name}`, [file]);
    }
  }

  deleteQuote(): void {
    if (this.isDealApproved) {
      return;
    }
    const employee = this._employeeService.employeeToken();
    const dialogRef = this._dialog.open(ConfirmationDialogComponent, {
      data: {
        title: 'Delete Quote',
        description: 'Are you sure you want to delete this quote?',
        icon: 'heroExclamationCircle',
        IconColor: 'red',
      },
    });

    dialogRef.afterClosed().subscribe((confirmed: boolean) => {
      if (confirmed) {
        this.quotationService
          .deleteQuotation({
            dataId: this.quoteData!._id!,
            employeeId: employee.id,
          })
          .subscribe({
            next: () => {
              this.toast.success('Quote deleted successfully');
              this._router.navigate(['/quotations']);
            },
            error: (error) => {
              this.toast.error(error.error.message || 'Failed to delete quote');
            },
          });
      }
    });
  }

  private static readonly HISTORY_LABELS: Record<string, [string, DetailTone]> = {
    Created: ['Drafted', 'neutral'],
    Updated: ['Edited', 'info'],
    StatusChanged: ['Status changed', 'info'],
    DealApproved: ['Deal approved', 'good'],
    DealRejected: ['Deal rejected', 'bad'],
    DealRevoked: ['Approval revoked', 'warn'],
  };

  private buildHistory(q: getQuotatation): QvHistoryEntry[] {
    return [...(q.editHistory || [])].reverse().map((e) => {
      const [action, tone] = QuotationViewComponent.HISTORY_LABELS[e.action] || ['Updated', 'info' as DetailTone];
      const who = this.fullName(e.editedBy);
      const changes = this.readableChanges(e.changes || []);
      const at = e.editedAt ? String(e.editedAt) : '';
      const isStatus = e.action !== 'Updated' && !!(e.fromStatus || e.toStatus);
      let summary = '';
      if (changes.length) {
        summary = `${changes.length} ${changes.length === 1 ? 'field' : 'fields'} changed`;
      } else if (e.action === 'Created') {
        summary = 'Quotation created';
      } else if (!isStatus) {
        summary = e.reason || 'No field-level detail was recorded for this entry';
      }
      return {
        action,
        kind: e.action || 'Updated',
        tone,
        who,
        initials: this.initials(who) || '?',
        when: at ? formatDate(at, 'dd MMM yyyy, h:mm a', 'en-US') : 'Date not recorded',
        ago: this.timeAgo(at),
        at,
        day: this.historyDay(at),
        summary,
        status: isStatus ? { from: e.fromStatus || '—', to: e.toStatus || '—' } : null,
        reason: e.reason || '',
        revision: typeof e.revision === 'number' ? e.revision : null,
        changes,
      };
    });
  }

  /** The log split into date headings, newest first. Cached per log so *ngFor keeps its DOM between passes. */
  get historyGroups(): { day: string; entries: QvHistoryEntry[] }[] {
    if (this.historyCache.log !== this.historyLog) {
      const groups: { day: string; entries: QvHistoryEntry[] }[] = [];
      for (const e of this.historyLog) {
        const last = groups[groups.length - 1];
        if (last && last.day === e.day) last.entries.push(e);
        else groups.push({ day: e.day, entries: [e] });
      }
      this.historyCache = { log: this.historyLog, groups };
    }
    return this.historyCache.groups;
  }

  private historyCache: { log: QvHistoryEntry[] | null; groups: { day: string; entries: QvHistoryEntry[] }[] } = {
    log: null,
    groups: [],
  };

  /** "Today" / "Yesterday" / "18 Sep 2026" — the heading entries are bucketed under. */
  private historyDay(iso: string): string {
    if (!iso) return 'Undated';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return 'Undated';
    const midnight = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const days = Math.round((midnight(new Date()) - midnight(d)) / 86400000);
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    return formatDate(d, 'dd MMM yyyy', 'en-US');
  }

  /** Coarse "how long ago", enough to place an entry without reading the full date. */
  private timeAgo(iso: string): string {
    if (!iso) return '';
    const then = new Date(iso).getTime();
    if (isNaN(then)) return '';
    const mins = Math.floor((Date.now() - then) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} ${days === 1 ? 'day' : 'days'} ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months} ${months === 1 ? 'month' : 'months'} ago`;
    const years = Math.floor(months / 12);
    return `${years} ${years === 1 ? 'year' : 'years'} ago`;
  }

  /** Dot / avatar ring colour for an entry's tone. */
  historyToneClass(tone: DetailTone): string {
    const map: Record<string, string> = {
      good: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 dark:text-emerald-300',
      bad: 'text-red-600 bg-red-50 dark:bg-red-500/10 dark:text-red-300',
      warn: 'text-amber-600 bg-amber-50 dark:bg-amber-500/10 dark:text-amber-300',
      info: 'text-violet-600 bg-violet-50 dark:bg-violet-500/10 dark:text-violet-300',
      neutral: 'text-gray-600 bg-gray-100 dark:bg-white/10 dark:text-gray-300',
    };
    return map[tone] || map['neutral'];
  }

  /** Only real, human-meaningful changes: no id-only swaps, no empty-to-empty noise. */
  private readableChanges(list: { field: string; from: string; to: string }[]): QvHistoryChange[] {
    const out: QvHistoryChange[] = [];
    for (const c of list) {
      const from = this.historyValue(c.from);
      const to = this.historyValue(c.to);
      if (from === to || this.sameRef(c.from, c.to)) continue;
      // Unresolvable values (raw ids / unnamed objects) tell the reader nothing.
      if (this.isOpaque(from) && this.isOpaque(to)) continue;
      const fromUnknown = this.isOpaque(from);
      const toUnknown = this.isOpaque(to);
      out.push({
        label: this.fieldLabel(c.field),
        from: fromUnknown ? 'Not recorded' : from,
        to: toUnknown ? 'Not recorded' : to,
        fromUnknown,
        toUnknown,
      });
    }
    return out;
  }

  private isOpaque(v: string): boolean {
    return v === 'Updated' || /^[a-f0-9]{24}$/i.test(v);
  }

  /** A plain id on one side and a populated object with that same _id on the other is not a change. */
  private sameRef(a: string, b: string): boolean {
    const id = (raw: string) => {
      if (!raw) return '';
      try {
        const v = JSON.parse(raw);
        return typeof v === 'object' && v ? String(v._id || '') : String(v);
      } catch {
        return raw;
      }
    };
    const x = id(a);
    return !!x && x === id(b);
  }

  private fieldLabel(field: string): string {
    const spaced = field.replace(/([A-Z])/g, ' $1').replace(/[._]/g, ' ').trim();
    return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
  }

  /** History stores values as strings/JSON; show something a person can read. */
  private historyValue(raw: string): string {
    if (raw === undefined || raw === null || raw === '') return 'Empty';
    try {
      const v = JSON.parse(raw);
      if (Array.isArray(v)) return v.length ? v.length + (v.length === 1 ? ' item' : ' items') : 'Empty';
      if (v && typeof v === 'object') return this.pickName(v) || 'Updated';
      if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) return formatDate(v, 'dd MMM yyyy', 'en-US');
      return String(v);
    } catch {
      // Values over 300 chars are stored cut off, so the JSON no longer parses: pull the name out by pattern.
      if (/^\s*[{[]/.test(raw)) {
        const grab = (key: string) => new RegExp('"' + key + '"\\s*:\\s*"([^"]+)"').exec(raw)?.[1] || '';
        return this.pickName({
          companyName: grab('companyName'),
          name: grab('name'),
          contactName: grab('contactName'),
          firstName: grab('firstName'),
          lastName: grab('lastName'),
        }) || 'Updated';
      }
      return raw;
    }
  }

  /** The one readable label of a customer / contact / user object. */
  private pickName(v: any): string {
    return (
      v.companyName ||
      v.name ||
      v.contactName ||
      [v.firstName, v.lastName].filter(Boolean).join(' ') ||
      ''
    );
  }

  fullName(person?: { firstName?: string; lastName?: string }): string {
    return ((person?.firstName || '') + ' ' + (person?.lastName || '')).trim() || 'N/A';
  }

  /** Two-letter monogram for the header avatar, from the customer company. */
  initials(name?: string): string {
    return (name || '')
      .split(' ')
      .filter(Boolean)
      .map((w) => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  }

  get headerAvatarText(): string {
    return this.initials(this.quoteData?.client?.companyName);
  }

  get headerTitle(): string {
    return this.quoteData?.quoteId || '';
  }

  get headerSubtitle(): string {
    const q = this.quoteData;
    if (!q) return '';
    const by = this.fullName(q.createdBy);
    return by !== 'N/A' ? 'Quoted by ' + by : '';
  }

  calculateTotalCost(i: number, j: number, k: number): number {
    const detail = this.quoteData!.optionalItems[i].items[j].itemDetails[k];
    return detail.quantity * detail.unitCost;
  }

  calculateAllTotalCost(): number {
    let totalCost = 0;
    this.quoteData!.optionalItems[this.selectedOption].items.forEach((item, j) => {
      if (item.isOptional && !item.includeInTotal) {
        return;
      }
      item.itemDetails.forEach((_, k) => {
        totalCost += this.calculateTotalCost(this.selectedOption, j, k);
      });
    });
    return totalCost;
  }

  calculateSellingPrice(): number {
    let totalPrice = 0;
    this.quoteData!.optionalItems[this.selectedOption].items.forEach((item, j) => {
      if (item.isOptional && !item.includeInTotal) {
        return;
      }
      item.itemDetails.forEach((_, k) => {
        totalPrice += this.calculateTotalPrice(this.selectedOption, j, k);
      });
    });
    return totalPrice;
  }

  calculateProfit(i: number, j: number, k: number): string | number {
    const detail = this.quoteData!.optionalItems[i].items[j].itemDetails[k];
    if (detail.unitCost && detail.unitSellingPrice) {
      return (((detail.unitSellingPrice - detail.unitCost) / detail.unitSellingPrice) * 100).toFixed(2);
    }
    return 0;
  }

  calculateTotalPrice(i: number, j: number, k: number): number {
    const detail = this.quoteData!.optionalItems[i].items[j].itemDetails[k];
    return detail.unitSellingPrice * detail.quantity;
  }

  calculateProfitMargin(): number {
    return this.calculateDiscoutPrice() - this.calculateAllTotalCost() || 0;
  }

  calculateTotalProfit(): number {
    return ((this.calculateDiscoutPrice() - this.calculateAllTotalCost()) / this.calculateDiscoutPrice()) * 100 || 0;
  }

  calculateDiscoutPrice(): number {
    return this.calculateSellingPrice() - this.quoteData!.optionalItems[this.selectedOption].totalDiscount;
  }

  private openFiles(title: string, existingFiles: any): void {
    const modalData: FileUploadModalData = {
      title,
      existingFiles,
      allowMultiple: true,
      showActions: { upload: false, download: true, view: true, delete: false },
    };
    this._dialog.open(FileUploadModalComponent, {
      data: modalData,
      width: '800px',
      maxHeight: '90vh',
    });
  }

  get eventItems(): DetailTaskItem[] {
    return this.events.map((e) => ({
      id: e._id,
      title: e.event,
      kind: 'event' as const,
      date: e.date as any,
      done: e.status === 'completed' || e.status === 'success',
      eventStatus: (e.status || 'pending') as DetailTaskItem['eventStatus'],
      outcomeable: true,
      assignee: e.employee ? `Assigned to ${[e.employee.firstName, e.employee.lastName].filter(Boolean).join(' ') || e.employee.fullName || ''}`.trim() : undefined,
      description: e.summary,
      deletable: this.isEventCreator(e.createdBy),
      attachments: (e.eventFiles || []).map((f) => ({ id: f.fileName, name: f.originalname })),
    }));
  }

  async onEventOutcome(item: DetailTaskItem, status: 'success' | 'cancelled'): Promise<void> {
    const success = status === 'success';
    const { confirmed } = await this.confirm.open({
      tone: success ? 'approve' : 'reject',
      title: success ? 'Mark Event Successful' : 'Cancel Event',
      message: success ? 'Mark this event as successful?' : 'Mark this event as cancelled?',
      details: [{ label: 'Event', value: item.title }],
      confirmLabel: success ? 'Mark successful' : 'Cancel event',
      cancelLabel: 'Keep as is',
    });
    if (!confirmed) { return; }
    this._eventsService.eventStatus(item.id, status).subscribe((res: any) => {
      if (res.success === true) {
        this.toast.success(success ? 'Event marked successful' : 'Event cancelled');
        this.events = this.events.map((e) => (e._id === item.id ? { ...e, status } : e));
      }
    });
  }

  private isEventCreator(createdBy: any): boolean {
    const employeeId = this._employeeService.employeeToken()?.id;
    if (!employeeId || !createdBy) { return false; }
    const idToCompare = typeof createdBy === 'string' ? createdBy : createdBy._id || createdBy;
    return employeeId == idToCompare;
  }

  private reloadEvents(): void {
    const id = this.quoteData?._id;
    if (!id) { return; }
    this._eventsService.fetchEvents(id).subscribe((events: Events[]) => {
      this.events = events || [];
      if (this.quoteData) { this.buildDocuments(this.quoteData); }
    });
  }

  onAddEvent(): void {
    const q = this.quoteData;
    if (!q) { return; }
    const contactPersons: SfOption[] = ((q.client as any)?.contactDetails || []).map((c: ContactDetail) => ({
      label: `${c.firstName} ${c.lastName}`,
      value: c._id,
    }));

    this.modal.open<EventModalResult>(EventCreateModalComponent, {
      width: '560px',
      data: {
        context: q.quoteId || q._id,
        assignable: true,
        employees: this._employeeService.getAllEmployees(),
        contactPersonable: true,
        contactPersons,
        requireSummary: true,
      },
    }).afterClosed().subscribe((event) => {
      if (!event) { return; }
      const eventData = {
        from: 'Enquiry',
        collectionId: q._id,
        event: event.title,
        date: event.date,
        employee: event.employeeId,
        contactPerson: event.contactPersonId,
        summary: event.description,
      };
      const formData = new FormData();
      formData.append('eventData', JSON.stringify(eventData));
      this._eventsService.newEvent(formData).subscribe({
        next: (res) => {
          if (res?.event) {
            this.toast.success(res.message || 'Event created successfully');
            this.reloadEvents();
          }
        },
        error: () => this.toast.error('Failed to create event'),
      });
    });
  }

  onToggleEvent(item: DetailTaskItem): void {
    if (item.done) { return; }
    this._eventsService.eventStatus(item.id, 'completed').subscribe((res: any) => {
      if (res.success === true) {
        this.toast.success('Event completion updated');
        this.events = this.events.map((e) => (e._id === item.id ? { ...e, status: 'completed' } : e));
      }
    });
  }

  async onDeleteEvent(item: DetailTaskItem): Promise<void> {
    const { confirmed } = await this.confirm.open({
      tone: 'reject',
      title: 'Delete Event',
      message: 'Are you sure you want to delete this event?',
      details: [{ label: 'Event', value: item.title }],
      confirmLabel: 'Delete',
      cancelLabel: 'Keep',
    });
    if (!confirmed) { return; }
    this._eventsService.eventDelete(item.id).subscribe((res: any) => {
      if (res.success) {
        this.toast.success('Event Deleted');
        this.events = this.events.filter((e) => e._id !== item.id);
      }
    });
  }

  onPreviewEventFile(file: { id: string; name: string }): void {
    this._enquiryService.downloadFile(file.id).subscribe({
      next: (event) => {
        if (event.type === HttpEventType.Response) {
          const fileURL = URL.createObjectURL(new Blob([event.body], { type: event.body.type || 'application/octet-stream' }));
          window.open(fileURL, '_blank');
          setTimeout(() => URL.revokeObjectURL(fileURL), 10000);
        }
      },
      error: (error) => {
        if (error.status === 404) {
          this.toast.warning('Sorry, the requested file was not found on the server.');
        } else {
          this.toast.error('An error occurred while trying to preview the file.');
        }
      },
    });
  }

  onDeleteEventFile(item: DetailTaskItem, file: { id: string; name: string }): void {
    this._dialog
      .open(ConfirmationDialogComponent, {
        data: { title: 'Delete File', description: 'Are you sure you want to delete this file?', icon: 'heroExclamationCircle', IconColor: 'red' },
      })
      .afterClosed()
      .subscribe((confirmed: boolean) => {
        if (!confirmed) { return; }
        this._eventsService.eventFileDelete(item.id, file.id).subscribe((res: any) => {
          if (res.success) {
            this.toast.success('File Deleted');
            this.events = this.events.map((e) =>
              e._id === item.id ? { ...e, eventFiles: (e.eventFiles || []).filter((f) => f.fileName !== file.id) } : e,
            );
            if (this.quoteData) { this.buildDocuments(this.quoteData); }
          }
        });
      });
  }

  /** The shell takes new-array inputs, so header data is rebuilt on load / option change rather than in getters. */
  private rebuild(): void {
    const q = this.quoteData;
    if (!q) {
      this.breadcrumbs = this.badges = this.stats = this.itemRows = this.docList = [];
      this.dealView = null;
      this.dealItemRows = [];
      return;
    }
    this.dealView = hasDeal(q)
      ? buildDealView(q, { number: (n) => this.numberFormatter.transform(n), date: (v) => (v ? this.formatDate(v as string) : null) })
      : null;
    this.dealItemRows = this.dealView ? this.buildDealItemRows() : [];
    this.syncTabs();
    if (!this.tabFromUrlApplied) {
      this.tabFromUrlApplied = true;
      const wanted = this._route.snapshot.queryParamMap.get('tab');
      if (wanted && this.tabs.some((t) => t.id === wanted)) { this.tab = wanted as Tab; }
    }
    this.buildDocuments(q);
    this.events = (q.events || []) as Events[];
    this.historyLog = this.buildHistory(q);
    const num = (v: number) => this.numberFormatter.transform(v);
    const currency = q.currency ? ` (${q.currency})` : '';

    this.breadcrumbs = [
      { label: 'Home', link: ['/home'] },
      { label: 'Quotations', link: ['/quotations'] },
      { label: q.quoteId || 'Quote' },
    ];

    this.badges = [];
    if (q.status) {
      this.badges.push({ label: q.status, tone: QUOTE_STATUS_TONE[q.status] ?? 'info' });
    }
    const dealStatus = q.dealData?.status;
    if (dealStatus) {
      this.badges.push({
        label: `Deal ${dealStatus}`,
        tone: DEAL_STATUS_TONE[dealStatus.toLowerCase()] ?? 'neutral',
      });
    }

    this.buildSidebarFacts(q);

    const hasItems = !!q.optionalItems?.[this.selectedOption];
    this.itemRows = hasItems ? this.buildItemRows(num) : [];
    this.stats = hasItems
      ? [
          { label: 'Total Cost' + currency, value: num(this.calculateAllTotalCost()) },
          { label: 'Total Selling Price' + currency, value: num(this.calculateDiscoutPrice()) },
          { label: 'Profit Margin' + currency, value: num(this.calculateProfitMargin()) },
          { label: 'Profit Margin %', value: this.calculateTotalProfit().toFixed(2) + '%' },
          { label: 'Discount' + currency, value: num(q.optionalItems[this.selectedOption].totalDiscount) },
          { label: 'Total Amount' + currency, value: num(this.calculateDiscoutPrice()) },
        ]
      : [];
    // The same figures as the stats strip, but as the card under the items table, ending on the amount due.
    this.itemSummary = hasItems
      ? [
          { label: 'Total Cost', value: num(this.calculateAllTotalCost()), note: q.currency || '' },
          { label: 'Profit Margin', value: num(this.calculateProfitMargin()), note: this.calculateTotalProfit().toFixed(2) + '%' },
          { label: 'Discount', value: num(q.optionalItems[this.selectedOption].totalDiscount) },
          { label: 'Total Amount', value: num(this.calculateDiscoutPrice()), emphasis: true },
        ]
      : [];
  }

  /**
   * Right-panel rows, one per detail. The ids are the way out to the linked module
   * (violet, clickable); the rest is that record's own data. Empty values are dropped.
   */
  private buildSidebarFacts(q: getQuotatation): void {
    const keep = (facts: QvFact[]) => facts.filter((f) => !!f.value);
    const date = (v?: string | Date | null) => (v ? this.formatDate(v as string) : '');
    const clientId = (q.client as any)?._id;
    const d = q.dealData;

    this.customerFacts = keep([
      { label: 'Customer ID', value: q.client?.clientRef || '', link: ['/customers'], queryParams: { search: q.client?.companyName } },
      { label: 'Company', value: q.client?.companyName || '' },
      { label: 'Contact', value: this.personName(q.attention) },
      { label: 'Email', value: q.attention?.email || q.client?.customerEmailId || '' },
      { label: 'Phone', value: q.attention?.phoneNo || (q.client?.contactNo ? String(q.client.contactNo) : '') },
    ]);

    this.enquiryFacts = keep([
      { label: 'Enquiry ID', value: q.enqId?.enquiryId || '', link: ['/enquiry'], queryParams: clientId ? { customer: clientId } : undefined },
      { label: 'Date', value: date(q.enqId?.date) },
      { label: 'Sales person', value: this.personName(q.enqId?.salesPerson) },
      { label: 'Pre-sale', value: this.personName(q.enqId?.preSale?.presalePerson) },
    ]);

    this.dealFacts = d
      ? keep([
          { label: 'Deal ID', value: d.dealId || '', deal: true },
          { label: 'Status', value: d.status || '', pill: true, tone: DEAL_STATUS_TONE[(d.status || '').toLowerCase()] ?? 'neutral' },
          { label: 'Saved date', value: date(d.savedDate) },
          { label: 'Payment terms', value: d.paymentTerms || '' },
          { label: 'Approved by', value: this.personName(d.approvedBy) },
          { label: 'Deal discount', value: this.numberFormatter.transform(d.totalDiscount), numeric: true },
          ...(d.additionalCosts || []).map((c) => ({
            label: c.type,
            value: this.numberFormatter.transform(c.value),
            numeric: true,
          })),
          { label: 'Comments', value: (d.comments || []).join(' · ') },
        ])
      : [];
  }

  /** Every file the quote can reach, tagged with where it came from (shown in the row's meta line). */
  private buildDocuments(q: getQuotatation): void {
    const sources: { label: string; files?: any[] }[] = [
      { label: 'LPO', files: q.lpoFiles },
      { label: 'Deal', files: q.dealData?.attachments },
      { label: 'Enquiry', files: q.enqId?.attachments as any[] },
      { label: 'Pre-Sale', files: q.enqId?.preSale?.presaleFiles as any[] },
      { label: 'Event', files: (q.events || []).flatMap((e: any) => e.eventFiles || []) },
    ];
    this.docFiles.clear();
    this.docList = [];
    sources.forEach((s) =>
      (s.files || []).forEach((f: any, i: number) => {
        const id = `${s.label}-${i}-${f.fileName}`;
        this.docFiles.set(id, f);
        this.docList.push({ id, name: f.originalname || f.fileName, uploadedBy: s.label });
      }),
    );
  }

  private personName(p: any): string {
    return p && typeof p === 'object' ? [p.firstName, p.lastName].filter(Boolean).join(' ') : '';
  }

  private formatDate(value: string): string {
    return formatDate(value, 'dd MMM yyyy', 'en-US');
  }

  private buildDealItemRows(): Record<string, any>[] {
    const num = (v: number) => this.numberFormatter.transform(v);
    const rows: Record<string, any>[] = [];
    ((this.quoteData as any).dealData.updatedItems ?? []).forEach((item: any) => {
      const picked = (item.itemDetails ?? []).filter((d: any) => d.dealSelected);
      if (!picked.length) return;
      rows.push({ _group: true, label: item.itemName, badge: '', note: '' });
      picked.forEach((d: any) => {
        const totalCost = (d.quantity ?? 0) * (d.unitCost ?? 0);
        const totalPrice = (d.quantity ?? 0) * (d.unitSellingPrice ?? 0);
        rows.push({
          detail: this.boldPipe.transform(this.bracketsPipe.transform(d.detail) as string),
          quantity: d.quantity,
          unitCost: num(d.unitCost ?? 0),
          totalCost: num(totalCost),
          totalCostRaw: totalCost,
          totalPriceRaw: totalPrice,
          profit: marginFromPrice(d.unitCost, d.unitSellingPrice) + '%',
          unitPrice: num(d.unitSellingPrice ?? 0),
          totalPrice: num(totalPrice),
          availability: d.availability,
        });
      });
    });
    return rows;
  }

  private buildItemRows(num: (v: number) => string): Record<string, any>[] {
    const rows: Record<string, any>[] = [];
    this.quoteData!.optionalItems[this.selectedOption].items.forEach((item, j) => {
      rows.push({
        _group: true,
        label: item.itemName,
        badge: item.isOptional ? 'Optional' : '',
        note: item.isOptional ? (item.includeInTotal ? 'Included in total' : 'Excluded from total') : '',
      });
      item.itemDetails.forEach((d, k) => {
        rows.push({
          detail: this.boldPipe.transform(this.bracketsPipe.transform(d.detail) as string),
          quantity: d.quantity,
          unitCost: num(d.unitCost),
          totalCost: num(d.quantity * d.unitCost),
          totalCostRaw: d.quantity * d.unitCost,
          totalPriceRaw: Number(this.calculateTotalPrice(this.selectedOption, j, k)),
          _excludeFromTotal: !!item.isOptional && !item.includeInTotal,
          profit: Number(this.calculateProfit(this.selectedOption, j, k)).toFixed(2) + '%',
          unitPrice: num(d.unitSellingPrice),
          totalPrice: num(this.calculateTotalPrice(this.selectedOption, j, k)),
          availability: d.availability,
        });
      });
    });
    return rows;
  }
}
