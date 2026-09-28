import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { StockEntryService, InventoryPlanningRow } from 'src/app/core/services/stock-entry/stock-entry.service';

@Component({
  selector: 'app-inventory-planning',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './inventory-planning.component.html',
})
export class InventoryPlanningComponent implements OnInit {
  private stockEntryService = inject(StockEntryService);

  rows = signal<InventoryPlanningRow[]>([]);
  isLoading = signal(false);

  ngOnInit(): void {
    this.loadPlanning();
  }

  loadPlanning(): void {
    this.isLoading.set(true);
    this.stockEntryService.getInventoryPlanning().subscribe({
      next: (res) => this.rows.set(res.data || []),
      error: () => this.rows.set([]),
      complete: () => this.isLoading.set(false),
    });
  }
}
