import { CommonModule, DatePipe } from '@angular/common';
import { Component, ViewChild, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin, Subscription } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { PurchaseService } from 'src/app/core/services/purchase/purchase.service';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
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
import { DetailOverviewSection, DetailTableColumn } from 'src/app/shared/components/detail-panel/detail-panel.model';
import { DetailOverviewComponent } from 'src/app/shared/components/detail-panel/detail-overview.component';
import { DetailTableComponent } from 'src/app/shared/components/detail-panel/detail-table.component';

const RFQ_BADGE_CLASSES: Record<string, string> = {
  Open: 'bg-gray-100 text-gray-700 ring-gray-200 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700 dark:border-gray-700',
  Quoted: 'bg-sky-50 text-sky-700 ring-sky-200 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:ring-sky-900 dark:border-sky-900',
  Awarded: 'bg-emerald-50 text-emerald-700 ring-emerald-200 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900 dark:border-emerald-900',
  Closed: 'bg-slate-100 text-slate-700 ring-slate-200 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700 dark:border-slate-700',
  Cancelled: 'bg-red-50 text-red-700 ring-red-200 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900 dark:border-red-900',
};

@Component({
  selector: 'app-rfq-list',
  imports: [CommonModule, DataGridComponent, DetailOverviewComponent, DetailTableComponent, ActionButtonComponent],
  providers: [DatePipe],
  templateUrl: './rfq-list.component.html',
  styleUrl: './rfq-list.component.css',
})
export class RfqListComponent {
  @ViewChild('grid') grid!: DataGridComponent<any>;

  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private purchaseService = inject(PurchaseService);
  private notificationService = inject(ToastrService);
  private datePipe = inject(DatePipe);
  private subscriptions = new Subscription();

  rows: any[] = [];
  total = 0;
  isLoading = false;
  detailLoading = false;

  page = 1;
  row = 15;
  searchQuery = '';
  private activeViewId = 'all';

  breadcrumbs: DataGridBreadcrumb[] = [{ label: 'Home', link: '/' }, { label: 'Purchase' }, { label: 'RFQ' }];
  views: DataGridView<any>[] = [
    { id: 'all', label: 'All' },
    { id: 'open', label: 'Open' },
    { id: 'quoted', label: 'Quoted' },
    { id: 'awarded', label: 'Awarded' },
  ];
  columns: DataGridColumn<any>[] = [];
  rowActions: DataGridRowAction<any>[] = [];
  detailTabs: DataGridDetailTab[] = [
    { id: 'overview', label: 'Details', icon: 'info' },
    { id: 'quotes', label: 'Supplier Offers', icon: 'card' },
  ];

  quoteColumns: DetailTableColumn[] = [
    { key: 'item', label: 'Item' },
    { key: 'supplier', label: 'Supplier' },
    { key: 'qty', label: 'Qty', type: 'number' },
    { key: 'unitPrice', label: 'Unit Price', type: 'currency' },
    { key: 'discount', label: 'Discount' },
    { key: 'tax', label: 'Tax' },
    { key: 'freight', label: 'Freight', type: 'currency' },
    { key: 'amount', label: 'Landed Total', type: 'currency', total: true },
    { key: 'selected', label: 'Awarded' },
  ];

  rfqTitle = (row: any) => row.rfqNo ?? '';
  rfqSubtitle = (row: any) => row.purchaseNo || row.customerId?.companyName || row.jobId?.jobId || '';

  ngOnInit(): void {
    this.buildColumns();
    this.buildRowActions();
    this.route.queryParams.subscribe((params) => {
      this.page = params['page'] ? parseInt(params['page'], 10) : 1;
      this.row = params['row'] ? parseInt(params['row'], 10) : 15;
      this.searchQuery = params['search'] || '';
      this.activeViewId = params['view'] || 'all';
      if (this.grid) this.grid.page = this.page;
      this.getRfqs();
    });
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  private buildColumns(): void {
    this.columns = [
      { key: 'createdAt', label: 'Date', type: 'date', sortable: true, width: '120px' },
      { key: 'rfqNo', label: 'RFQ No', sortable: true, locked: true },
      { key: 'purchaseNo', label: 'PR No', sortable: true },
      { key: 'customer', label: 'Customer', valueGetter: (row) => row.customerId?.companyName || '-' },
      { key: 'jobId', label: 'Job ID', valueGetter: (row) => row.jobId?.jobId || '-' },
      { key: 'requestedLineCount', label: 'Lines', align: 'right', valueGetter: (row) => row.requestedLineCount ?? row.requestedLines?.length ?? 0 },
      { key: 'quoteLineCount', label: 'Offers', align: 'right', valueGetter: (row) => row.quoteLineCount ?? 0 },
      { key: 'awardedLineCount', label: 'Awarded Lines', align: 'right', valueGetter: (row) => row.awardedLineCount ?? 0 },
      { key: 'supplier', label: 'Awarded Supplier', valueGetter: (row) => this.awardedSuppliers(row) || '-' },
      { key: 'rfqStatusLabel', label: 'Status', type: 'badge', valueGetter: (row) => this.rfqStatusLabel(row), badgeClasses: RFQ_BADGE_CLASSES },
    ];
  }

  private buildRowActions(): void {
    this.rowActions = [
      { id: 'comparisonSheet', label: 'Manage Offers', icon: 'pencil', quick: true, panel: true },
      { id: 'comparisonSummary', label: 'Award Summary', icon: 'eye', quick: true, panel: true },
      {
        id: 'initiatePo',
        label: 'Create PO',
        icon: 'send',
        quick: true,
        hidden: (row) => (row.awardedLineCount ?? 0) <= 0,
      },
    ];
  }

  private rfqStatusForView(viewId: string): string[] | undefined {
    if (viewId === 'open') return ['Open'];
    if (viewId === 'quoted') return ['Quoted'];
    if (viewId === 'awarded') return ['Awarded'];
    return undefined;
  }

  onQueryChange(query: DataGridQuery): void {
    this.searchQuery = query.search;
    this.page = query.page;
    this.row = query.pageSize;
    this.activeViewId = query.viewId || 'all';
    this.getRfqs();
    this.updateUrlParams();
  }

  getRfqs(): void {
    this.isLoading = true;
    this.subscriptions.add(
      this.purchaseService.getRfqs({
        page: this.page,
        row: this.row,
        search: this.searchQuery || undefined,
        status: this.rfqStatusForView(this.activeViewId),
      }).subscribe({
        next: (response) => {
          this.rows = response.rfqs?.data ?? [];
          this.total = response.rfqs?.total ?? 0;
          this.isLoading = false;
        },
        error: (error) => {
          this.notificationService.error('Failed to load RFQs');
          console.error('Error loading RFQs:', error);
          this.isLoading = false;
        },
      })
    );
    this.loadViewCounts();
  }

  private loadViewCounts(): void {
    const requests = this.views.reduce((acc, view) => {
      acc[view.id] = this.purchaseService.getRfqs({
        page: 1,
        row: 1,
        search: this.searchQuery || undefined,
        status: this.rfqStatusForView(view.id),
      });
      return acc;
    }, {} as Record<string, ReturnType<PurchaseService['getPurchases']>>);

    this.subscriptions.add(
      forkJoin(requests).subscribe({
        next: (results) => {
          this.views = this.views.map((view) => ({ ...view, count: results[view.id]?.rfqs?.total ?? 0 }));
        },
        error: (error) => console.error('Error loading RFQ counts:', error),
      })
    );
  }

  private updateUrlParams(): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        page: this.page !== 1 ? this.page : null,
        row: this.row !== 15 ? this.row : null,
        search: this.searchQuery || null,
        view: this.activeViewId !== 'all' ? this.activeViewId : null,
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  onRowOpen(): void {
    this.detailLoading = true;
    setTimeout(() => (this.detailLoading = false), 200);
  }

  onRowAction(event: DataGridRowActionEvent<any>): void {
    if (event.action.id === 'comparisonSheet') this.openComparisonSheet(event.row);
    if (event.action.id === 'comparisonSummary') this.openComparisonSummary(event.row);
    if (event.action.id === 'initiatePo') this.router.navigate(['/purchase/initiate-lpo', event.row.purchaseRequestId?._id || event.row.purchaseRequestId]);
  }

  openComparisonSheet(row: any, event?: Event): void {
    event?.stopPropagation();
    this.router.navigate(['/purchase/comparison-sheet', row.purchaseRequestId?._id || row.purchaseRequestId]);
  }

  openComparisonSummary(row: any, event?: Event): void {
    event?.stopPropagation();
    this.router.navigate(['/purchase/comparison-summary', row.purchaseRequestId?._id || row.purchaseRequestId]);
  }

  openPr(row: any, event?: Event): void {
    event?.stopPropagation();
    this.router.navigate(['/purchase/view-purchase', row.purchaseRequestId?._id || row.purchaseRequestId]);
  }

  rfqStatusLabel(row: any): string {
    return row.status || 'Open';
  }

  awardedSuppliers(row: any): string {
    const names = new Set<string>((row.awardedSuppliers || []).filter(Boolean));
    (row.quotes || []).forEach((quote: any) => {
      if (quote.selected && quote.supplierName) names.add(quote.supplierName);
    });
    return Array.from(names).join(', ');
  }

  quoteRows(row: any): Record<string, any>[] {
    return (row.quotes || []).map((quote: any) => ({
      item: quote.detail || quote.itemName || '-',
      supplier: quote.supplierName || '-',
      qty: quote.quantity ?? 0,
      unitPrice: quote.unitPrice ?? 0,
      discount: this.discountLabel(quote),
      tax: `${Number(quote.taxPercent) || 0}%`,
      freight: Number(quote.freightCost) || 0,
      amount: this.offerTotal(quote),
      selected: quote.selected ? 'Yes' : 'No',
    }));
  }

  private offerTotal(quote: any): number {
    return Number(quote?.landedCost) || Number(quote?.netAmount) || Number(quote?.totalCost) || ((Number(quote?.quantity) || 0) * (Number(quote?.unitPrice) || 0));
  }

  private discountLabel(quote: any): string {
    const value = Number(quote?.discountValue) || 0;
    if (!value) return '-';
    return quote?.discountType === 'percent' ? `${value}%` : value.toLocaleString('en-US', { maximumFractionDigits: 2 });
  }

  overviewSections(row: any): DetailOverviewSection[] {
    return [
      {
        title: 'General',
        columns: '2',
        fields: [
          { type: 'field', label: 'RFQ No', value: row.rfqNo, numeric: true },
          { type: 'field', label: 'PR No', value: row.purchaseNo || row.purchaseRequestId?.purchaseNo || '-', numeric: true },
          { type: 'dg', key: 'rfqStatusLabel', label: 'RFQ Status' },
          { type: 'field', label: 'Customer', value: row.customerId?.companyName || '-' },
          { type: 'field', label: 'Job ID', value: row.jobId?.jobId || '-' },
          { type: 'field', label: 'Created By', value: row.createdBy ? `${row.createdBy.firstName} ${row.createdBy.lastName}` : '-' },
          { type: 'field', label: 'Date', value: this.datePipe.transform(row.createdAt, 'dd MMM yyyy') },
        ],
      },
      {
        title: 'Quote Decision',
        columns: '2',
        fields: [
          { type: 'field', label: 'Requested Lines', value: row.requestedLineCount ?? row.requestedLines?.length ?? 0, numeric: true, noHover: true },
          { type: 'field', label: 'Offers Received', value: row.quoteLineCount ?? 0, numeric: true, noHover: true },
          { type: 'field', label: 'Awarded Lines', value: row.awardedLineCount ?? 0, numeric: true, noHover: true },
          { type: 'field', label: 'Awarded Supplier', value: this.awardedSuppliers(row) || '-', noHover: true },
          { type: 'field', label: 'Deadline', value: this.datePipe.transform(row.deadline, 'dd MMM yyyy') || '-', noHover: true },
        ],
      },
    ];
  }
}
