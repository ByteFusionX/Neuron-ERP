import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { ToastrService } from 'ngx-toastr';
import { PurchaseService } from 'src/app/core/services/purchase/purchase.service';
import { SupplierService } from 'src/app/core/services/supplier.service';
import { PurchaseOrderService } from 'src/app/core/services/purchaseOrder/purchaseOrder.service';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { PurchaseData, QuoteItem } from 'src/app/shared/interfaces/purchase.interface';
import { LpoListComponent } from '../lpo-list/lpo-list.component';

@Component({
  selector: 'app-initiate-lpo',
  imports: [
    CommonModule,
    NgIcon,
    LpoListComponent
  ],
  templateUrl: './initiate-lpo.component.html',
  styleUrl: './initiate-lpo.component.css'
})
export class InitiateLpoComponent implements OnInit {
  private purchaseService = inject(PurchaseService);
  private employeeService = inject(EmployeeService);
  private notificationService = inject(ToastrService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private supplierService = inject(SupplierService)
  private purchaseOrderService = inject(PurchaseOrderService);

  purchaseId!: string;
  purchase: PurchaseData | null = null;
  isLoading = true;
  suppliersList = signal<any[]>([])
  canIssueLpo = signal<boolean>(false);
  canInitiateLPO = signal<boolean>(false);
  currency = signal<string>('');

  ngOnInit(): void {
    this.checkPrivileges();
    this.loadPurchase()
    this.supplierService.supplierList().subscribe({
      next: (res) => {
        this.suppliersList.set(res.data)
      }, error: (error) => {
        console.log(error);
      }
    })
  }

  checkPrivileges(): void {
    this.employeeService.employeeData$.subscribe((data) => {
      if (data?.category?.privileges) {
        this.canInitiateLPO.set(data.category.privileges.purchaseOrder?.canInitiateLPO || false);
        if (!this.canInitiateLPO()) {
          this.notificationService.warning('You do not have permission to initiate LPO');
          this.router.navigate(['/purchase/approves']);
        }
      }
    });
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
        if (this.purchase?.currency) {
          this.currency.set(this.purchase.currency);
        } else if (this.purchase?.jobId?.quoteId?.currency) {
          this.currency.set(this.purchase.jobId.quoteId.currency);
        } else if (this.purchase?.jobId?.quoteId?.dealData?.currency) {
          this.currency.set(this.purchase.jobId.quoteId.dealData.currency);
        }
        this.isLoading = false;
        this.checkSuppliersStatus();
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
      partNo: string;
      quantity: number;
      supplierName: string;
      unitPrice: number;
      totalPrice: number;
      etaTerms: string;
      paymentTerms: string;
      isNewlyAdded?: boolean;
      merged?: boolean;
    }[] = [];

    items.forEach((item: QuoteItem) => {
      item.itemDetails.forEach(detail => {
        const selected = detail.comparisons?.find(c => c.selected);
        if (selected) {
          const supplier = this.suppliersList().find(s => s._id === selected.supplierId);
          const partNo = this.getPartNumber(detail.partNo);
          result.push({
            detail: detail.detail,
            partNo: partNo,
            quantity: selected.quantity,
            supplierName: supplier?.supplierName || 'Unknown Supplier',
            unitPrice: selected.unitPrice,
            totalPrice: selected.unitPrice * detail.quantity,
            etaTerms: selected.etaTerms,
            paymentTerms: selected.paymentTerms,
            isNewlyAdded: detail.isNewlyAdded,
            merged: detail.merged
          });
        }
      });
    });

    return result;
  }

  private getPartNumber(detailPartNo: any): string {
    return this.formatPartNumber(detailPartNo);
  }

  formatPartNumber(partNo: any): string {
    if (!partNo) return '-';
    if (typeof partNo === 'string') return partNo;
    if (partNo.partNo) {
      return partNo.productDescription 
        ? `${partNo.partNo}`
        : partNo.partNo;
    }
    return '-';
  }

  onIssueLpoClick() {
    this.router.navigate(['/purchase/issue-lpo', this.purchaseId || 'none'])
  }

  hasComparisons(items: any[]): any[] {
    if (!items?.length) return [];

    return items.flatMap(item =>
      (item.itemDetails || []).flatMap((detail: any) =>
        (detail.comparisons || []).filter((c: any) => c.selected === true)
      )
    );
  }

  checkSuppliersStatus() {
    if (!this.purchaseId || this.purchaseId === 'none') {
      this.canIssueLpo.set(false);
      return;
    }

    this.purchaseOrderService.getSuppliersForPurchaseRequest(this.purchaseId).subscribe({
      next: (response) => {
        if (response.success && response.data) {
          const suppliers = response.data;
          const hasSelectableSupplier = suppliers.some((supplier: any) => supplier.canSelect === true);
          this.canIssueLpo.set(hasSelectableSupplier);
        } else {
          this.canIssueLpo.set(false);
        }
      },
      error: (error) => {
        console.error('Error checking suppliers status:', error);
        this.canIssueLpo.set(false);
      }
    });
  }


}
