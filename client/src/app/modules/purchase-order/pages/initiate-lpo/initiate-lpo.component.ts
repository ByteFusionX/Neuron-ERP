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
import { DeliveryNoteService } from 'src/app/core/services/delivery-note/delivery-note.service';
import { DnStatus } from 'src/app/shared/interfaces/delivery-note.interface';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { PurchaseData, QuoteItem } from 'src/app/shared/interfaces/purchase.interface';
import { LpoListComponent } from '../lpo-list/lpo-list.component';
import { ItemIssueHistoryModalComponent, ItemIssueEntry, LpoStatusEntry } from 'src/app/shared/components/item-issue-history-modal/item-issue-history-modal.component';

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
  private deliveryNoteService = inject(DeliveryNoteService);
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
  canReissueAndRevoke = signal<boolean>(false);
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
        this.canReissueAndRevoke.set(data.category.privileges.purchaseOrder?.canReissueAndRevoke || false);
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

  private getLpoComment(lpo: any): string {
    if (lpo.approvedHistory && lpo.approvedHistory.length > 0) {
      const lastApproval = lpo.approvedHistory[lpo.approvedHistory.length - 1];
      if (lastApproval.reason) return lastApproval.reason;
    }
    if (lpo.rejectedHistory && lpo.rejectedHistory.length > 0) {
      const lastRejection = lpo.rejectedHistory[lpo.rejectedHistory.length - 1];
      if (lastRejection.reason) return lastRejection.reason;
    }
    return '';
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
      const lpoStatuses: LpoStatusEntry[] = [];

      await Promise.all(
        lpos.map(async (lpo: any) => {
          // List every LPO this item was issued on, regardless of its current
          // status (Draft through Closed), so the modal shows the full trail.
          (lpo.items || []).forEach((lpoItem: any) => {
            const partNoMatch = this.matchPartNo(lpoItem.partNo, item.partNo);
            const descriptionMatch = lpoItem.detail === item.detail;
            if (partNoMatch || descriptionMatch) {
              lpoStatuses.push({
                lpoId: lpo._id,
                purchaseId: lpo.purchaseId?._id || lpo.purchaseId || this.purchaseId,
                poNo: lpo.poNo,
                poStatus: lpo.poStatus,
                poDate: lpo.poDate,
                issuedQty: lpoItem.quantity || 0,
                comment: this.getLpoComment(lpo),
                lpo,
              });
            }
          });

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

      // Delivery notes (Dispatch) are only linked to a Job, not to a specific
      // LPO, so delivered/pending-delivery quantities are aggregated at the
      // job level and matched to this item by part number / description.
      let deliveredQty = 0;
      const jobId = this.purchase?.jobId?._id;
      if (jobId) {
        try {
          const dnResponse = await firstValueFrom(this.deliveryNoteService.getDnsByJobId(jobId));
          const dns = dnResponse?.data || dnResponse?.dns || (Array.isArray(dnResponse) ? dnResponse : []);

          (dns || []).forEach((dn: any) => {
            if (dn.status === DnStatus.CANCELLED) return;
            (dn.items || []).forEach((dnItem: any) => {
              const partNoMatch = this.matchPartNo(dnItem.partNo, item.partNo);
              const descriptionMatch = dnItem.description === item.detail;
              if (partNoMatch || descriptionMatch) {
                deliveredQty += dnItem.currentDeliveryQty || 0;
              }
            });
          });
        } catch (error) {
          console.error('Error loading delivery notes for job:', jobId, error);
        }
      }
      const pendingDeliveryQty = Math.max(0, item.quantity - deliveredQty);

      const dialogRef = this.dialog.open(ItemIssueHistoryModalComponent, {
        width: '1100px',
        maxWidth: '95vw',
        maxHeight: '90vh',
        data: {
          itemDetail: item.detail,
          partNo: item.partNo,
          orderedQty: item.quantity,
          issues,
          lpoStatuses,
          deliveredQty,
          pendingDeliveryQty,
          canInitiateLPO: this.canInitiateLPO(),
          canReissueAndRevoke: this.canReissueAndRevoke(),
        },
      });

      // An action taken inside the modal (send for approval / revoke) can
      // change this item's issue trail, so reload the same history in place
      // rather than leaving a stale table behind after the modal closes.
      dialogRef.afterClosed().subscribe((result) => {
        if (result?.refreshed) {
          this.viewItemIssueHistory(item);
        }
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
