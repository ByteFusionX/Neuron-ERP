import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { ToastrService } from 'ngx-toastr';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { PurchaseService } from 'src/app/core/services/purchase/purchase.service';
import { SupplierService } from 'src/app/core/services/supplier.service';
import { PurchaseOrderService } from 'src/app/core/services/purchaseOrder/purchaseOrder.service';
import { GrnService } from 'src/app/core/services/grn/grn.service';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { PurchaseData, QuoteItem } from 'src/app/shared/interfaces/purchase.interface';
import { LpoListComponent } from '../lpo-list/lpo-list.component';
import { ItemIssueHistoryModalComponent, ItemIssueEntry } from 'src/app/shared/components/item-issue-history-modal/item-issue-history-modal.component';

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
  private grnService = inject(GrnService);
  private dialog = inject(MatDialog);
  loadingIssueHistoryFor: string | null = null;

  purchaseId!: string;
  purchase: PurchaseData | null = null;
  // Computed once when the purchase loads, instead of being called inline from
  // the template's *ngFor (which reran on every change-detection tick, tearing
  // down and recreating the whole row - including its click listeners - constantly).
  comparisonItems: ReturnType<InitiateLpoComponent['selectedComparison']> = [];
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
        // Supplier names are looked up by ID inside selectedComparison(), so
        // recompute in case the purchase already loaded before suppliers did.
        if (this.purchase) {
          this.comparisonItems = this.selectedComparison(this.purchase.items);
        }
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
        this.comparisonItems = this.purchase ? this.selectedComparison(this.purchase.items) : [];
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

  private matchPartNo(grnPartNo: any, itemPartNo: any): boolean {
    const formatPartNo = (partNo: any): string => {
      if (!partNo) return '';
      if (typeof partNo === 'string') return partNo;
      if (partNo.partNo) return partNo.partNo;
      return '';
    };
    return formatPartNo(grnPartNo) === formatPartNo(itemPartNo);
  }

  async viewItemIssueHistory(item: { detail: string; partNo: string; quantity: number }) {
    if (!this.purchaseId || this.purchaseId === 'none') return;

    const itemKey = `${item.detail}-${item.partNo}`;
    this.loadingIssueHistoryFor = itemKey;

    try {
      const lposResponse = await firstValueFrom(
        this.purchaseOrderService.getAllPurchaseOrders({ purchaseId: this.purchaseId, row: 200 }),
      );
      const lpos = lposResponse?.success ? lposResponse.data : [];

      const issues: ItemIssueEntry[] = [];

      await Promise.all(
        lpos.map(async (lpo: any) => {
          try {
            const grnResponse = await firstValueFrom(this.grnService.getAllGRNsByLpoId(lpo._id));
            const grns = grnResponse?.success && grnResponse?.data ? grnResponse.data : [];

            grns.forEach((grn: any) => {
              (grn.items || []).forEach((grnItem: any) => {
                const partNoMatch = this.matchPartNo(grnItem.partNo, item.partNo);
                const descriptionMatch = grnItem.itemDescription === item.detail;
                if (partNoMatch || descriptionMatch) {
                  const receivedQty = grnItem.receivedQty || 0;
                  const acceptedQty = grnItem.acceptedQty || 0;
                  issues.push({
                    grnNo: grn.grnNo,
                    grnDate: grn.grnDate,
                    poNo: lpo.poNo,
                    receivedQty,
                    acceptedQty,
                    rejectedQty: Math.max(0, receivedQty - acceptedQty),
                  });
                }
              });
            });
          } catch (error) {
            console.error('Error loading GRNs for LPO:', lpo._id, error);
          }
        }),
      );

      this.dialog.open(ItemIssueHistoryModalComponent, {
        width: '800px',
        maxHeight: '90vh',
        data: {
          itemDetail: item.detail,
          partNo: item.partNo,
          orderedQty: item.quantity,
          issues,
        },
      });
    } catch (error) {
      console.error('Error loading item issue history:', error);
      this.notificationService.error('Failed to load item issue history');
    } finally {
      this.loadingIssueHistoryFor = null;
    }
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
