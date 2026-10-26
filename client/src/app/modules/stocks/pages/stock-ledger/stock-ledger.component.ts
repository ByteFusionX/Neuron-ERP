import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { StockLedgerParams, StockMovement, StockService } from 'src/app/core/services/stock/stock.service';
import { DataGridComponent } from 'src/app/shared/components/data-grid/data-grid.component';
import { DataGridBreadcrumb, DataGridColumn, DataGridQuery, DataGridView } from 'src/app/shared/components/data-grid/data-grid.model';

/** Read-only history of every stock movement: receipts, deliveries, returns and adjustments, newest first. */
@Component({
  selector: 'app-stock-ledger',
  standalone: true,
  imports: [CommonModule, DataGridComponent],
  templateUrl: './stock-ledger.component.html',
  styleUrl: './stock-ledger.component.css'
})
export class StockLedgerComponent implements OnInit, OnDestroy {
  private stockService = inject(StockService);
  private toastr = inject(ToastrService);
  private route = inject(ActivatedRoute);
  private subscription = new Subscription();

  readonly breadcrumbs: DataGridBreadcrumb[] = [{ label: 'Home', link: '/' }, { label: 'Inventory' }, { label: 'Stock Movement' }];

  tableData = signal<StockMovement[]>([]);
  isLoading = signal(false);
  totalItems = signal(0);
  subtitle = 'Every receipt, delivery, return and adjustment. Nothing here can be edited or deleted.';

  views: DataGridView<StockMovement>[] = [
    { id: 'all', label: 'All' },
    { id: 'Receipt', label: 'Receipts' },
    { id: 'Delivery', label: 'Deliveries' },
    { id: 'Return', label: 'Returns' },
    { id: 'Adjustment', label: 'Adjustments' },
  ];

  columns: DataGridColumn<StockMovement>[] = [
    { key: 'movementDate', label: 'Date', type: 'date' },
    { key: 'product', label: 'Item', valueGetter: (r) => [r.product?.itemCode || r.product?.partNo, r.product?.productDescription].filter(Boolean).join(' - ') },
    { key: 'warehouse', label: 'Warehouse', valueGetter: (r) => r.warehouse?.wareHouseName || '-' },
    { key: 'movementType', label: 'Type' },
    { key: 'quantityIn', label: 'In', type: 'number', cellClass: (r) => (r.quantityIn ? 'text-emerald-600 font-semibold' : '') },
    { key: 'quantityOut', label: 'Out', type: 'number', cellClass: (r) => (r.quantityOut ? 'text-red-600 font-semibold' : '') },
    { key: 'stockStatus', label: 'Stock', valueGetter: (r) => (r.stockStatus === 'Quarantine' ? 'Quarantine' : 'Available') },
    { key: 'referenceNo', label: 'Document', valueGetter: (r) => [r.referenceType, r.referenceNo].filter(Boolean).join(' ') || '-' },
    { key: 'reason', label: 'Reason', valueGetter: (r) => r.reason || r.remarks || '' },
    { key: 'createdBy', label: 'By', valueGetter: (r) => [r.createdBy?.firstName, r.createdBy?.lastName].filter(Boolean).join(' ') },
  ];

  page = 1;
  row = 15;
  private searchTerm = '';
  private movementType = '';
  private product = '';

  ngOnInit(): void {
    this.subscription.add(this.route.queryParamMap.subscribe((params) => {
      this.product = params.get('product') || '';
      this.subtitle = this.product && params.get('label')
        ? `History for ${params.get('label')}`
        : 'Every receipt, delivery, return and adjustment. Nothing here can be edited or deleted.';
      this.page = 1;
      this.load();
    }));
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }

  load(): void {
    this.isLoading.set(true);
    const params: StockLedgerParams = {
      page: this.page,
      row: this.row,
      search: this.searchTerm || undefined,
      movementType: this.movementType || undefined,
      product: this.product || undefined,
    };
    this.stockService.getLedger(params).subscribe({
      next: (res) => {
        this.tableData.set(res.data.movements);
        this.totalItems.set(res.data.pagination.total);
        this.isLoading.set(false);
      },
      error: () => {
        this.toastr.error('Failed to load the stock ledger');
        this.isLoading.set(false);
      },
    });
  }

  onQueryChange(query: DataGridQuery): void {
    this.searchTerm = query.search;
    this.page = query.page;
    this.row = query.pageSize;
    this.load();
  }

  onViewChange(view: DataGridView<StockMovement>): void {
    this.movementType = view.id === 'all' ? '' : view.id;
    this.page = 1;
    this.load();
  }
}
