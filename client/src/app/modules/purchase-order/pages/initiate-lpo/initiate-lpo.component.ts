import { CommonModule } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { ToastrService } from 'ngx-toastr';
import { PurchaseService } from 'src/app/core/services/purchase/purchase.service';
import { PurchaseData } from 'src/app/shared/interfaces/purchase.interface';

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

  purchaseId!: string;
  purchase: PurchaseData | null = null;
  isLoading = true;

  ngOnInit(): void {
    this.loadPurchase()
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
}
