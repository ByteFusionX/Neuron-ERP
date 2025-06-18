import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { PurchaseService } from 'src/app/core/services/purchase/purchase.service';
import { Comparisons, QuoteItem, QuoteItemDetails } from 'src/app/shared/interfaces/purchase.interface';

@Component({
  selector: 'app-comparison-summary',
  imports: [CommonModule],
  templateUrl: './comparison-summary.component.html',
  styleUrl: './comparison-summary.component.css'
})
export class ComparisonSummaryComponent implements OnInit {
  private purchaseService = inject(PurchaseService)
  itemsList = signal<QuoteItem[]>([])
  isComparison: boolean = true

  ngOnInit(): void {
    this.purchaseService.purchaseFormData$.subscribe({
      next: (data) => {
        if (data.items) {
          this.itemsList.set(data.items)
        }
      },
      error: (error) => {
        console.log(error)
      }
    })
  }

  getApprovedComparison(item: QuoteItemDetails): Comparisons | undefined {
    return item.comparisons?.find(c => c.selected);
  }

  getMaxSupplierColumns(): number[] {
    const items = this.itemsList();
    const max = Math.max(
      ...items.map(item =>
        item.itemDetails.reduce((sum, detail) => {
          return sum + (detail.comparisons?.length || 0);
        }, 0)
      )
    );
    return Array.from({ length: max }, (_, i) => i);
  }
}
