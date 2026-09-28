import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { StockEntryService, StockMovement } from 'src/app/core/services/stock-entry/stock-entry.service';

@Component({
  selector: 'app-stock-ledger',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './stock-ledger.component.html',
})
export class StockLedgerComponent implements OnInit {
  private stockEntryService = inject(StockEntryService);

  rows = signal<StockMovement[]>([]);
  isLoading = signal(false);

  ngOnInit(): void {
    this.loadMovements();
  }

  loadMovements(): void {
    this.isLoading.set(true);
    this.stockEntryService.getStockMovements({ limit: 200 }).subscribe({
      next: (res) => this.rows.set(res.data || []),
      error: () => this.rows.set([]),
      complete: () => this.isLoading.set(false),
    });
  }
}
