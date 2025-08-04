import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { ToastrService } from 'ngx-toastr';
import { PurchaseService } from 'src/app/core/services/purchase/purchase.service';
import { SupplierService } from 'src/app/core/services/supplier.service';
import { PurchaseData, QuoteItem } from 'src/app/shared/interfaces/purchase.interface';

@Component({
  selector: 'app-initiate-lpo',
  imports: [
    CommonModule,
    NgIcon,
  ],
  templateUrl: './initiate-lpo.component.html',
  styleUrl: './initiate-lpo.component.css'
})
export class InitiateLpoComponent implements OnInit {
  private purchaseService = inject(PurchaseService);
  private notificationService = inject(ToastrService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private supplierService = inject(SupplierService)

  purchaseId!: string;
  purchase: PurchaseData | null = null;
  isLoading = true;
  suppliersList = signal<any[]>([])

  ngOnInit(): void {
    this.loadPurchase()

    this.supplierService.supplierList().subscribe({
      next: (res) => {
        this.suppliersList.set(res.data)
      }, error: (error) => {
        console.log(error);
      }
    })
  }

  loadPurchase() {
    this.purchaseId = <string>this.route.snapshot.paramMap.get('id');
    if (this.purchaseId == 'none') return
    if (!this.purchaseId) {
      this.notificationService.error('Invalid Purchase ID');
      this.router.navigate(['/purchase/approves']);
      return;
    }

    this.purchaseService.getPurchaseById(this.purchaseId).subscribe({
      next: (response) => {
        this.purchase = response.data;
        this.isLoading = false;
        console.log(this.purchase)
      },
      error: (error) => {
        this.notificationService.error('Failed to load purchase details');
        console.error('Error loading purchase:', error);
        this.isLoading = false;
        this.router.navigate(['/purchase/approves']);
      }
    });
  }

  selectedComparison(items: QuoteItem[]) {
    const result: {
      detail: string;
      quantity: number;
      supplierName: string;
      unitPrice: number;
      totalPrice: number;
      etaTerms: string;
      paymentTerms: string;
    }[] = [];

    items.forEach((item: QuoteItem) => {
      item.itemDetails.forEach(detail => {
        const selected = detail.comparisons?.find(c => c.selected);
        if (selected) {
          const supplier = this.suppliersList().find(s => s._id === selected.supplierId);
          result.push({
            detail: detail.detail,
            quantity: selected.quantity,
            supplierName: supplier?.supplierName || 'Unknown Supplier',
            unitPrice: selected.unitPrice,
            totalPrice: selected.unitPrice * detail.quantity,
            etaTerms: selected.etaTerms,
            paymentTerms: selected.paymentTerms,
          });
        }
      });
    });

    return result;
  }
}
