import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
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
  private route = inject(ActivatedRoute)
  private router = inject(Router)
  
  purchaseId!: string;
  itemsList = signal<QuoteItem[]>([])
  isComparison: boolean = true
  currency = signal<string>('')

  ngOnInit(): void {
    this.purchaseId = this.route.snapshot.paramMap.get('purchaseId') || '';
    
    if (!this.purchaseId) {
      this.router.navigate(['/purchase/pendings']);
      return;
    }

    this.loadPurchaseData();
  }

  loadPurchaseData(): void {
    this.purchaseService.getPurchaseById(this.purchaseId).subscribe({
      next: (res) => {
        if (res.data?.items) {
          this.itemsList.set(res.data.items);
        }
        if (res.data?.currency) {
          this.currency.set(res.data.currency);
        }
      },
      error: (error) => {
        console.error('Error loading purchase data:', error);
        this.router.navigate(['/purchase/pendings']);
      }
    });
  }

  onBack(): void {
    this.router.navigate(['/purchase/edit', this.purchaseId]);
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
