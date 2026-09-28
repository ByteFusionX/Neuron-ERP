import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { StockEntryService, StockReservation } from 'src/app/core/services/stock-entry/stock-entry.service';

@Component({
  selector: 'app-stock-reservations',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './stock-reservations.component.html',
})
export class StockReservationsComponent implements OnInit {
  private stockEntryService = inject(StockEntryService);

  rows = signal<StockReservation[]>([]);
  isLoading = signal(false);

  ngOnInit(): void {
    this.loadReservations();
  }

  loadReservations(): void {
    this.isLoading.set(true);
    this.stockEntryService.getStockReservations({ status: 'Active' }).subscribe({
      next: (res) => this.rows.set(res.data || []),
      error: () => this.rows.set([]),
      complete: () => this.isLoading.set(false),
    });
  }

  productLabel(row: StockReservation): string {
    return row.product?.itemCode || row.product?.partNo || row.product?.productDescription || 'Product';
  }
}
