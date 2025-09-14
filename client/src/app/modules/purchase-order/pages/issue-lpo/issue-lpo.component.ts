import { CommonModule } from '@angular/common';
import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { Subscription } from 'rxjs';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { PurchaseService } from 'src/app/core/services/purchase/purchase.service';
import { PurchaseOrderService } from 'src/app/core/services/purchaseOrder/purchaseOrder.service';
import { SupplierService } from 'src/app/core/services/supplier.service';
import { SelectDropdownComponent } from 'src/app/shared/components/forms/select-dropdown/select-dropdown.component';
import { PurchaseData } from 'src/app/shared/interfaces/purchase.interface';

@Component({
  selector: 'app-issue-lpo',
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    SelectDropdownComponent,
  ],
  templateUrl: './issue-lpo.component.html',
  styleUrl: './issue-lpo.component.css'
})
export class IssueLpoComponent implements OnInit, OnDestroy {

  private purchaseService = inject(PurchaseService);
  private supplierService = inject(SupplierService);
  private notificationService = inject(ToastrService);
  private employeeService = inject(EmployeeService);
  private purchaseOrderService = inject(PurchaseOrderService)
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  placeOfDelivery: string = 'Neuron Technologies WLL';
  requestedSupplierId = signal<string>('')
  purchaseId!: string;
  purchase: PurchaseData | null = null;
  isLoading: boolean = true;
  suppliersList = signal<any[]>([]);
  isSubmitted = signal<boolean>(false);
  selectedSupplier = signal<any>(null);
  tokenData!: { id: string, employeeId: string };
  subscriptions = new Subscription();

  ngOnInit(): void {
    this.tokenData = this.employeeService.employeeToken();
    this.purchaseId = <string>this.route.snapshot.paramMap.get('id');
    if (!this.purchaseId) {
      this.notificationService.error('Invalid Purchase ID');
      this.router.navigate(['/purchase/approves']);
      return;
    }

    this.subscriptions.add(
      this.purchaseService.getPurchaseById(this.purchaseId).subscribe({
        next: (response) => {
          this.purchase = response.data;
          this.isLoading = false;
          if (this.purchase) {
            const items = this.hasComparisons(this.purchase)
            items.forEach(item => {
              this.getSupplierData(item.comparisons.supplierId)
            })
          }
        },
        error: (error) => {
          this.notificationService.error('Failed to load purchase details');
          console.error('Error loading purchase:', error);
          this.isLoading = false;
          this.router.navigate(['/purchase/approves']);
        }
      })
    )
  }

  hasComparisons(purchase: any): any[] {
    if (!purchase?.items?.length) return [];

    return purchase.items.flatMap((item: any) =>
      (item.itemDetails || []).flatMap((details: any) => {
        const selected = (details.comparisons || []).find((c: any) => c.selected === true);
        if (!selected) return [];
        return [{
          ...details,
          itemName: item.itemName,
          comparisons: selected
        }];
      })
    );
  }

  onSupplierSelected(supplierId: any) {
    const suppliers = this.suppliersList()
    const items = this.hasComparisons(this.purchase)
    const hasSupplier = suppliers.find(supplier => supplier._id === supplierId)
    if (items) {
      const hasItem = items.find(item => item.comparisons.supplierId === supplierId);
      if (hasSupplier && hasItem) {
        hasItem.comparisons.supplierId = hasSupplier
        this.selectedSupplier.set(hasItem)
        console.log(this.selectedSupplier());
      } else {
        this.notificationService.error('Selected supplier is not associated with this purchase order.');
        this.requestedSupplierId.set('');
      }
    }
  }

  getSupplierData(supplierId: string) {
    this.subscriptions.add(
      this.supplierService.getSupplierById(supplierId).subscribe({
        next: (res) => {
          this.suppliersList.set([res.data])
        }, error: (error) => {
          console.log(error);
        }
      })
    )
  }

  onIssueClicks() {
    console.log(this.purchase)

    const totalLpoValue = this.selectedSupplier().comparisons.quantity * this.selectedSupplier().comparisons.unitPrice
    let purchaseOrderData = {
      lpoValue: totalLpoValue,
      items: this.selectedSupplier().comparisons,
      purchaseId: this.purchaseId,
      jobId: this.purchase?.jobId._id,
      quoteId: this.purchase?.quoteId?._id,
      createdBy: this.tokenData.id,
    }
    this.subscriptions.add(
      this.purchaseOrderService.createPurchaseOrder(purchaseOrderData).subscribe({
        next: (res) => {
          console.log(res)
          this.notificationService.success('LPO issued successfully');
          this.router.navigate(['/purchase/initiate-lpo', this.purchaseId]);
        }, error: (error) => {
          this.notificationService.error('Failed to issue LPO, try again');
          console.log(error);
        }
      })
    )
  }

  onSaveClicks() {

  }

  onDiscardClicks() {
    this.router.navigate(['/purchase/initiate-lpo', this.purchaseId]);
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }
}
