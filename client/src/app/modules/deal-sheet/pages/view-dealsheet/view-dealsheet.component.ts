import { Component, OnInit } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import {
  dealData,
  priceDetails,
  Quotatation,
  QuoteItem,
  QuoteItemDetail,
} from 'src/app/shared/interfaces/quotation.interface';
import { UpdateDealsheetComponent } from '../update-dealsheet/update-dealsheet.component';
import { QuotationService } from 'src/app/core/services/quotation/quotation.service';
import { ViewCommentComponent } from 'src/app/shared/components/view-comment/view-comment.component';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { NotificationService } from 'src/app/core/services/notification.service';
import { EnquiryService } from 'src/app/core/services/enquiry/enquiry.service';
import { HttpEventType } from '@angular/common/http';
import { switchMap, take } from 'rxjs';
import saveAs from 'file-saver';
import { ToastrService } from 'ngx-toastr';
import { dealSheetPrivileges, canDoDealSheet } from 'src/app/shared/utils/privilege-fallback';
import { DealDecisionService, canDecideDeal, describeDealWaiting } from '../../services/deal-decision.service';
import { describeApprovalGateError } from 'src/app/shared/utils/approval-gate-error.util';
import { dealSheetPriceDetails, selectedDealItems } from 'src/app/shared/utils/deal-pricing.util';
import { statusLabel } from 'src/app/shared/utils/text-format.util';
import {
  CommonModule,
  DatePipe,
} from '@angular/common';

import { NumberFormatterPipe } from '../../../../shared/pipes/numFormatter.pipe';
import { SupplierService } from '../../../../core/services/supplier.service';
import { Supplier } from '../../../../shared/interfaces/suppliers.interface';
import { PurchaseOrderService } from '../../../../core/services/purchaseOrder/purchaseOrder.service';
import { PurchaseOrder } from '../../../../shared/interfaces/purchase.interface';
import {
  FileUploadModalComponent,
  FileUploadModalData,
} from '../../../../shared/components/file-upload-modal/file-upload-modal.component';
import {
  DetailViewBadge,
  DetailViewBreadcrumb,
  DetailViewShellComponent,
  DetailViewStat,
  DetailViewTab,
} from 'src/app/shared/components/detail-view-shell/detail-view-shell.component';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { DetailSectionComponent } from 'src/app/shared/components/detail-panel/detail-section.component';
import { DetailFieldComponent } from 'src/app/shared/components/detail-panel/detail-field.component';
import { DetailBadgeComponent } from 'src/app/shared/components/detail-panel/detail-badge.component';
import { DetailTableComponent } from 'src/app/shared/components/detail-panel/detail-table.component';
import { DetailDocumentsComponent } from 'src/app/shared/components/detail-panel/detail-documents.component';
import {
  DetailDocument,
  DetailFootRow,
  DetailTableColumn,
} from 'src/app/shared/components/detail-panel/detail-panel.model';
import { DetailTone } from 'src/app/shared/components/detail-panel/detail-tone';

interface ViewDealsheetNavState {
  approval: boolean;
  quoteData: Quotatation;
  quoteItems: (QuoteItem | undefined)[];
  priceDetails: priceDetails;
  quoteView?: boolean;
  jobId?: string;
  returnUrl?: string;
}

@Component({
  selector: 'app-view-dealsheet',
  templateUrl: './view-dealsheet.component.html',
  styleUrls: ['./view-dealsheet.component.css'],
  standalone: true,
  imports: [
    UpdateDealsheetComponent,
    DatePipe,
    CommonModule,
    DetailViewShellComponent,
    ActionButtonComponent,
    DetailSectionComponent,
    DetailFieldComponent,
    DetailBadgeComponent,
    DetailTableComponent,
    DetailDocumentsComponent,
    RouterLink,
  ],
})
export class ViewDealsheetComponent implements OnInit {
  isApproving: boolean = false;
  isRejecting: boolean = false;
  suppliers: Supplier[] = [];

  approvedPo: PurchaseOrder | null = null;
  viewMode: 'deal' | 'po' = 'deal';

  data!: ViewDealsheetNavState;
  returnUrl: string = '/deal-sheet/pendings';
  /** returnUrl may carry a query string, which router link arrays would encode into the path. */
  get returnPath(): string { return this.returnUrl.split('?')[0]; }
  tab: 'overview' | 'items' | 'costs' | 'documents' = 'overview';
  tabs: DetailViewTab[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'items', label: 'Items' },
    { id: 'costs', label: 'Costs' },
    { id: 'documents', label: 'Documents' },
  ];
  breadcrumbs: DetailViewBreadcrumb[] = [];
  badges: DetailViewBadge[] = [];
  stats: DetailViewStat[] = [];
  itemRows: Record<string, any>[] = [];
  costRows: Record<string, any>[] = [];
  documents: DetailDocument[] = [];
  private docFiles = new Map<string, any>();
  readonly itemColumns: DetailTableColumn[] = [
    { key: 'detail', label: 'Item Details', type: 'text', wrap: true },
    { key: 'quantity', label: 'Qty', type: 'number', align: 'center' },
    { key: 'unitSellingPrice', label: 'Unit Selling Price', type: 'currency', align: 'right' },
    { key: 'totalSellingPrice', label: 'Total Selling Price', type: 'currency', align: 'right', total: true },
    { key: 'unitCost', label: 'Unit Cost', type: 'currency', align: 'right' },
    { key: 'totalCost', label: 'Total Cost', type: 'currency', align: 'right', total: true },
    { key: 'supplier', label: 'Supplier', type: 'text' },
  ];
  readonly costColumns: DetailTableColumn[] = [
    { key: 'type', label: 'Type', type: 'text' },
    { key: 'name', label: 'Name', type: 'text', wrap: true },
    { key: 'value', label: 'Value', type: 'currency', align: 'right', total: true },
  ];

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private _dialog: MatDialog,
    private _quoteService: QuotationService,
    private _employeeService: EmployeeService,
    private _enquiryService: EnquiryService,
    private toast: ToastrService,
    private _notificationService: NotificationService,
    private supplierService: SupplierService,
    private _purchaseOrderService: PurchaseOrderService,
    private _decision: DealDecisionService,
  ) {}

  userId!: string;
  private roleId: string | undefined;
  private isSuperAdmin = false;
  private canApprove = false;
  private canReject = false;
  canUpdate = false;

  ngOnInit(): void {
    const state = history.state as ViewDealsheetNavState;

    if (state?.quoteData) {
      this.data = state;
      if (state.returnUrl) this.returnUrl = state.returnUrl;
      this.start();
      return;
    }

    // Opened by URL (bookmark, shared link, reload in a new tab): there is no list row to reuse, so fetch the deal.
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.router.navigateByUrl(this.returnUrl);
      return;
    }
    this._employeeService.employeeData$
      .pipe(
        take(1),
        switchMap((employee) =>
          this._quoteService.getQuotationById(
            id,
            dealSheetPrivileges(employee?.category?.privileges).viewReport,
            employee?._id,
          ),
        ),
      )
      .subscribe({
        next: (quote) => {
          if (!quote?.dealData) {
            this.toast.error('This quotation has no deal sheet yet.');
            this.router.navigateByUrl(this.returnUrl);
            return;
          }
          const listByStatus: Record<string, string> = {
            approved: '/deal-sheet/approved',
            rejected: '/deal-sheet/rejecteds',
          };
          this.returnUrl = listByStatus[quote.dealData.status ?? ''] ?? '/deal-sheet/pendings';
          this.data = {
            approval: quote.dealData.status === 'pending',
            quoteData: quote,
            quoteItems: selectedDealItems(quote.dealData.updatedItems),
            priceDetails: dealSheetPriceDetails(
              quote.dealData.updatedItems,
              quote.dealData.additionalCosts,
              quote.dealData.totalDiscount,
            ),
            quoteView: false,
          };
          this.start();
        },
        error: (error) => {
          this.toast.error(
            error?.status === 404
              ? 'Deal sheet not found.'
              : 'Could not load the deal sheet. Please try again.',
          );
          this.router.navigateByUrl(this.returnUrl);
        },
      });
  }

  private start(): void {
    this.loadSuppliers();
    this.loadApprovedPo();
    this.rebuildView();
    this._employeeService.employeeData$.subscribe((data) => {
      if (data?._id) {
        this.userId = data?._id;
        this.roleId = (data?.category as any)?._id;
        this.isSuperAdmin = /^superadmin$/i.test(String(data?.category?.role ?? ''));
        this.canApprove = canDoDealSheet(data, 'approve');
        this.canReject = canDoDealSheet(data, 'reject');
        this.canUpdate = canDoDealSheet(data, 'update');
        this.markQuotationSeenIfCreator();
      }
    });
  }

  // The PO-view tab only appears when an Approved LPO exists against this job -
  // silently skip the lookup if we weren't given a job to check.
  private loadApprovedPo(): void {
    if (!this.data.jobId) return;

    this._purchaseOrderService
      .getAllPurchaseOrders({ jobId: this.data.jobId, status: ['Approved'] })
      .subscribe({
        next: (response: any) => {
          const list = response?.data || response || [];
          this.approvedPo = list.length ? list[0] : null;
        },
        error: (error) => {
          console.error('Error loading approved purchase order:', error);
        },
      });
  }

  switchToPoView(): void {
    if (this.approvedPo) {
      this.viewMode = 'po';
      this.rebuildView();
    }
  }

  switchToDealView(): void {
    this.viewMode = 'deal';
    this.rebuildView();
  }

  private getPoItem(
    detail: QuoteItemDetail,
  ): { unitCost: number; totalCost: number } | undefined {
    return this.approvedPo?.items?.find((i) => i.detail === detail.detail);
  }

  getPoUnitCost(detail: QuoteItemDetail): number {
    const match = this.getPoItem(detail);
    return match ? match.unitCost : detail.unitCost;
  }

  getPoItemTotalCost(detail: QuoteItemDetail): number {
    const match = this.getPoItem(detail);
    return match ? match.totalCost : detail.quantity * detail.unitCost;
  }

  get poSummaryTotalCost(): number {
    let total = 0;
    this.data.quoteItems.forEach((item: any) => {
      item?.itemDetails?.forEach((detail: QuoteItemDetail) => {
        if (detail.dealSelected) {
          total += this.getPoItemTotalCost(detail);
        }
      });
    });
    return total;
  }

  get poSummaryProfit(): number {
    return this.data.priceDetails.totalSellingPrice - this.poSummaryTotalCost;
  }

  get poSummaryPerc(): number {
    return this.data.priceDetails.totalSellingPrice
      ? (this.poSummaryProfit / this.data.priceDetails.totalSellingPrice) * 100
      : 0;
  }

  // Only the salesperson who created the quotation can mark it seen - other
  // roles (e.g. superadmin browsing all deals) can view it without this
  // firing, since createdBy won't match them and the server would 404.
  private markQuotationSeenIfCreator(): void {
    if (this.data.quoteData.dealData.seenedBySalsePerson !== false) return;

    const createdBy = this.data.quoteData.createdBy;
    const creatorId =
      typeof createdBy === 'string' ? createdBy : createdBy?._id;
    if (!creatorId || creatorId !== this.userId) return;

    this._quoteService
      .markAsQuotationSeen(this.data.quoteData._id, this.userId)
      .subscribe({
        next: (res: any) => {
          if (res.success) {
          }
        },
        error: (error) => {
          console.error('Error marking quotation as seen:', error);
        },
      });
  }

  loadSuppliers() {
    this.supplierService.supplierList().subscribe({
      next: (response) => {
        this.suppliers = response.data || response;
        this.rebuildView();
      },
      error: (error) => {
        console.error('Error loading suppliers:', error);
      },
    });
  }

  onClose() {
    this.router.navigateByUrl(this.returnUrl);
  }

  openAttachments(): void {
    const modalData: FileUploadModalData = {
      title: `Deal Sheet Attachments - ${this.data.quoteData.dealData.dealId}`,
      existingFiles: this.data.quoteData.dealData.attachments as any,
      allowMultiple: true,
      showActions: { upload: false, download: true, view: true, delete: false },
    };

    this._dialog.open(FileUploadModalComponent, {
      data: modalData,
      width: '800px',
      maxHeight: '90vh',
    });
  }

  updateOpen = false;

  /** The drawer edits every saved line, not just the ticked ones the view shows. */
  updateData?: ViewDealsheetNavState;

  onUpdate() {
    this.updateData = { ...this.data, quoteItems: this.data.quoteData.dealData?.updatedItems ?? this.data.quoteItems };
    this.updateOpen = true;
  }

  onUpdateSaved(dealData: FormData) {
    this._quoteService.saveDealSheet(dealData, this.data.quoteData._id).subscribe({
      next: () => {
        this.updateOpen = false;
        this.toast.success('Deal sheet updated');
        this.router.navigateByUrl(this.returnUrl);
      },
      error: (error) => {
        console.error('Error saving deal sheet:', error);
        this.toast.error('Failed to save deal sheet');
      },
    });
  }

  calculateUnitPrice(item: any) {
    const decimalMargin = item.profit / 100;
    return Math.ceil(Number((item.unitCost / (1 - decimalMargin)).toFixed(2)));
  }

  onDownloadClicks(file: any) {
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
          this.toast.warning(
            'Sorry, The requested file was not found on the server. Please ensure that the file exists and try again.',
          );
        }
      },
    });
  }

  private rebuildView(): void {
    if (!this.data?.quoteData) return;
    const q = this.data.quoteData;
    const d = q.dealData;
    const currency = q.currency ? ` ${q.currency}` : '';
    this.breadcrumbs = [
      { label: 'Home', link: ['/home'] },
      { label: 'Deal Sheets', link: [this.returnPath] },
      { label: d.dealId || 'Deal Sheet' },
    ];
    this.badges = [
      { label: statusLabel(d.status || 'pending'), tone: this.statusTone(d.status) },
      ...(this.viewMode === 'po' ? [{ label: 'Purchase Order', tone: 'info' as DetailTone }] : []),
    ];
    this.stats = [
      { label: `Total Selling Price${currency}`, value: this.formatNumber(this.data.priceDetails.totalSellingPrice) },
      { label: `Total Cost${currency}`, value: this.formatNumber(this.viewMode === 'po' ? this.poSummaryTotalCost : this.data.priceDetails.totalCost) },
      { label: `Profit${currency}`, value: this.formatNumber(this.viewMode === 'po' ? this.poSummaryProfit : this.data.priceDetails.profit) },
      { label: 'Profit %', value: `${(this.viewMode === 'po' ? this.poSummaryPerc : this.data.priceDetails.perc).toFixed(2)}%` },
    ];
    this.itemRows = this.buildItemRows();
    this.costRows = this.buildCostRows();
    this.documents = this.buildDocuments();
  }

  get headerTitle(): string {
    return this.data?.quoteData?.dealData?.dealId || '';
  }

  get headerSubtitle(): string {
    return this.viewMode === 'po'
      ? `Purchase Order view for ${this.data?.quoteData?.client?.companyName || ''}`
      : `Deal sheet for ${this.data?.quoteData?.client?.companyName || ''}`;
  }

  get headerAvatarText(): string {
    return this.initials(this.data?.quoteData?.client?.companyName);
  }

  get salesPersonName(): string {
    const p = this.data?.quoteData?.createdBy;
    return p ? `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim() || 'N/A' : 'N/A';
  }

  get approverName(): string {
    const approver: any = this.data?.quoteData?.dealData?.approvedBy;
    return approver && typeof approver === 'object'
      ? `${approver.firstName ?? ''} ${approver.lastName ?? ''}`.trim()
      : '';
  }

  /** A deal that moved up after its time limit can only be decided by the role it moved to (or a Super Admin). */
  get canApproveDeal(): boolean {
    return this.canApprove && this.canDecide;
  }

  get canRejectDeal(): boolean {
    return this.canReject && this.canDecide;
  }

  get canDecide(): boolean {
    return canDecideDeal(this.data?.quoteData?.dealData?.waiting, { _id: this.userId, roleId: this.roleId, isSuperAdmin: this.isSuperAdmin });
  }

  get waitingText(): string {
    const deal = this.data?.quoteData?.dealData;
    return deal?.status === 'pending' ? describeDealWaiting(deal.waiting) : '';
  }

  /** Deal Sheet approval route, in the order the stages act. */
  get approvalStages(): any[] {
    const stages: any[] = this.data?.quoteData?.dealData?.approvalStatus ?? [];
    return stages.filter(stage => stage?.roleName);
  }

  /** Step number of the stage the deal is currently waiting at (null once nothing is pending). */
  get currentStageStep(): number | null {
    const pending = this.approvalStages.filter(stage => stage.status === 'pending').map(stage => stage.step);
    return pending.length ? Math.min(...pending) : null;
  }

  stageTone(stage: any): DetailTone {
    if (stage.status === 'approved') return 'good';
    if (stage.status === 'rejected') return 'bad';
    return stage.step === this.currentStageStep ? 'warn' : 'neutral';
  }

  stageLabel(stage: any): string {
    if (stage.status === 'pending') return stage.step === this.currentStageStep ? 'Waiting' : 'Queued';
    return stage.status === 'approved' ? 'Approved' : 'Rejected';
  }

  get reviewComment(): string {
    const comments = this.data?.quoteData?.dealData?.comments || [];
    return comments.length ? String(comments[comments.length - 1] || '').trim() : '';
  }

  get hasReviewComment(): boolean {
    return !!this.reviewComment;
  }

  /** Same breakdown as the Financial summary in the deal sheet list's detail panel. */
  get financialSummary(): { label: string; value: string; tone?: DetailTone }[] {
    const po = this.viewMode === 'po';
    const deal = this.data.quoteData.dealData;
    const currency = this.data.quoteData.currency ? ` ${this.data.quoteData.currency}` : '';
    const money = (v: number) => `${this.formatNumber(v)}${currency}`;
    const net = this.data.priceDetails.totalSellingPrice;
    const quoteDiscount = Number(deal?.totalDiscount) || 0;
    const customerDiscount = (deal?.additionalCosts ?? [])
      .filter((c: any) => c.type === 'Customer Discount')
      .reduce((sum: number, c: any) => sum + (Number(c.value) || 0), 0);
    const cost = po ? this.poSummaryTotalCost : this.data.priceDetails.totalCost;
    const profit = po ? this.poSummaryProfit : this.data.priceDetails.profit;
    const perc = po ? this.poSummaryPerc : this.data.priceDetails.perc;
    return [
      { label: 'Subtotal', value: money(net + quoteDiscount + customerDiscount) },
      ...(quoteDiscount ? [{ label: 'Quotation discount', value: money(quoteDiscount) }] : []),
      ...(customerDiscount ? [{ label: 'Customer discount', value: money(customerDiscount) }] : []),
      { label: 'Net deal value', value: money(net), tone: 'good' as DetailTone },
      { label: 'Total cost', value: money(cost) },
      { label: 'Profit', value: money(profit) },
      { label: 'Profit margin', value: `${perc.toFixed(1)}%` },
    ];
  }

  /** Totals shown in the item table footer, each figure under the column it belongs to. */
  get itemFootRows(): DetailFootRow[] {
    const po = this.viewMode === 'po';
    const cost = po ? this.poSummaryTotalCost : this.data.priceDetails.totalCost;
    const profit = po ? this.poSummaryProfit : this.data.priceDetails.profit;
    const perc = po ? this.poSummaryPerc : this.data.priceDetails.perc;
    const sell = this.data.priceDetails.totalSellingPrice;
    const deal = this.data.quoteData?.dealData;
    const quoteDiscount = Number(deal?.totalDiscount) || 0;
    const customerDiscount = (deal?.additionalCosts ?? [])
      .filter((c: any) => c.type === 'Customer Discount')
      .reduce((sum: number, c: any) => sum + (Number(c.value) || 0), 0);
    const discountRows: DetailFootRow[] = quoteDiscount || customerDiscount
      ? [
          { label: 'Subtotal', cells: { totalSellingPrice: { value: sell + quoteDiscount + customerDiscount, format: 'currency' } } },
          ...(quoteDiscount ? [{ label: 'Quotation discount', cells: { totalSellingPrice: { value: -quoteDiscount, format: 'currency' as const } } }] : []),
          ...(customerDiscount ? [{ label: 'Customer discount', cells: { totalSellingPrice: { value: customerDiscount, format: 'currency' as const } } }] : []),
        ]
      : [];
    return [
      ...discountRows,
      { label: discountRows.length ? 'Net deal value' : 'Total', emphasis: true, cells: { totalSellingPrice: { value: sell, format: 'currency' }, totalCost: { value: cost, format: 'currency' } } },
      { label: 'Profit', cells: { totalSellingPrice: { value: profit, format: 'currency' } } },
      { label: 'Profit %', cells: { totalSellingPrice: { value: perc, format: 'percent' } } },
    ];
  }

  get customer(): any {
    return this.data?.quoteData?.client ?? {};
  }

  /** Customer ref shown in the side panel; falls back to nothing when the client is not populated. */
  get customerRef(): string {
    return this.customer.clientRef || '';
  }

  statusText = statusLabel;

  statusTone(status?: string): DetailTone {
    const s = (status || '').toLowerCase();
    if (s === 'approved') return 'good';
    if (s === 'rejected') return 'bad';
    if (s === 'pending') return 'warn';
    return 'neutral';
  }

  private buildItemRows(): Record<string, any>[] {
    const rows: Record<string, any>[] = [];
    this.data.quoteItems.forEach((item: any) => {
      const selected = (item?.itemDetails || []).filter((detail: QuoteItemDetail) => detail.dealSelected);
      if (!selected.length) return;
      rows.push({ _group: true, label: item.itemName });
      selected.forEach((detail: QuoteItemDetail) => {
        const unitCost = this.viewMode === 'po' ? this.getPoUnitCost(detail) : detail.unitCost;
        rows.push({
          detail: detail.detail,
          quantity: detail.quantity,
          unitSellingPrice: detail.unitSellingPrice,
          totalSellingPrice: detail.unitSellingPrice * detail.quantity,
          unitCost,
          totalCost: this.viewMode === 'po' ? this.getPoItemTotalCost(detail) : detail.quantity * detail.unitCost,
          supplier: detail.supplierName || (detail.supplierId ? this.getSupplierName(detail.supplierId) : '-') || '-',
        });
      });
    });
    return rows;
  }

  private buildCostRows(): Record<string, any>[] {
    return (this.data.quoteData.dealData.additionalCosts || []).map((cost: any) => ({
      type: cost.type || 'Cost',
      name: cost.type === 'Supplier Discount'
        ? cost.supplierDetails?.supplierName || cost.name || 'Supplier discount'
        : cost.name || cost.type || 'Additional cost',
      value: cost.value || 0,
    }));
  }

  private buildDocuments(): DetailDocument[] {
    const docs: DetailDocument[] = [];
    this.docFiles.clear();
    const add = (file: any, source: string) => {
      const name = file.originalname || file.fileName || 'Document';
      const id = `${source}:${file.fileName}`;
      this.docFiles.set(id, file);
      docs.push({
        id,
        name,
        uploadedBy: source,
        kind: (name.split('.').pop() || 'FILE').toUpperCase().slice(0, 4),
      });
    };
    (this.data.quoteData.lpoFiles || []).forEach((file: any) => add(file, 'LPO'));
    return docs;
  }

  onDocumentOpen(doc: DetailDocument): void {
    const file = this.docFiles.get(doc.id);
    if (file) this.onViewPDF(file);
  }

  onDocumentDownload(doc: DetailDocument): void {
    const file = this.docFiles.get(doc.id);
    if (file) this.onDownloadClicks(file);
  }

  private formatNumber(value: number): string {
    return new NumberFormatterPipe().transform(value || 0);
  }

  private initials(name?: string): string {
    return (name || '')
      .split(' ')
      .filter(Boolean)
      .map((part) => part[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  }

  openReview() {
    this._dialog.open(ViewCommentComponent, {
      data: { comment: this.reviewComment || 'No comment recorded.' },
      width: '500px',
    });
  }

  onApprove() {
    this._decision
      .ask('approved', this.data.quoteData.dealData.dealId)
      .subscribe((result) => {
        if (!result) return;
        this.isApproving = true;
        this._quoteService
          .approveDeal(this.data.quoteData._id, result.reason, this.userId)
          .subscribe({
            next: (res) => {
              this.isApproving = false;
              if (res.success) {
                this.toast.success(res.awaitingNextApproval ? (res.message || 'Approved at your stage') : 'Deal approved');
                this.router.navigateByUrl(this.returnUrl);
              }
            },
            error: (error) => {
              this.isApproving = false;
              this.toast.error(describeApprovalGateError(error, 'Failed to approve deal'));
            },
          });
      });
  }

  onReject() {
    this._decision
      .ask('rejected', this.data.quoteData.dealData.dealId)
      .subscribe((result) => {
        if (!result?.reason) return;
        this.isRejecting = true;
        this._quoteService
          .rejectDeal(result.reason, this.data.quoteData._id)
          .subscribe({
            next: () => {
              this.isRejecting = false;
              this.toast.success('Deal rejected');
              this.router.navigateByUrl(this.returnUrl);
            },
            error: (error) => {
              this.isRejecting = false;
              this.toast.error(error?.error?.message || 'Failed to reject deal');
            },
          });
      });
  }

  checkAtLeastOneDealSelected(item: any) {
    return item?.itemDetails?.some((detail: any) => detail.dealSelected);
  }

  getSupplierById(supplierId: string): Supplier | undefined {
    return this.suppliers.find((supplier) => supplier._id === supplierId);
  }

  getSupplierName(supplierId: string): string {
    const supplier = this.getSupplierById(supplierId);
    return supplier ? supplier.supplierName : '';
  }

  getSupplierEmail(supplierId: string): string {
    const supplier = this.getSupplierById(supplierId);
    return supplier && supplier.contactDetails
      ? supplier.contactDetails.email
      : '';
  }

  getSupplierPhone(supplierId: string): string {
    const supplier = this.getSupplierById(supplierId);
    return supplier && supplier.contactDetails
      ? supplier.contactDetails.phoneNumber
      : '';
  }

  onViewPDF(file: any) {
    // Check if the file is a PDF
    if (file.fileName && file.fileName.toLowerCase().endsWith('.pdf')) {
      this._enquiryService.downloadFile(file.fileName).subscribe({
        next: (event) => {
          if (event.type === HttpEventType.Response) {
            const fileContent: Blob = new Blob([event['body']], {
              type: 'application/pdf',
            });

            // Create an object URL for the PDF blob
            const fileURL = URL.createObjectURL(fileContent);

            // Open the PDF in a new tab
            window.open(fileURL, '_blank');

            // Optionally revoke the object URL after some time
            setTimeout(() => {
              URL.revokeObjectURL(fileURL);
            }, 10000);
          }
        },
        error: (error) => {
          if (error.status === 404) {
            this.toast.warning(
              'Sorry, The requested file was not found on the server. Please ensure that the file exists and try again.',
            );
          } else {
            this.toast.error(
              'An error occurred while trying to view the PDF. Please try again later.',
            );
          }
        },
      });
    } else {
      // If the file is not a PDF, show a toaster notification
      this.toast.warning(
        'This file type is not supported for viewing. Please download and view the file.',
      );
    }
  }
}
