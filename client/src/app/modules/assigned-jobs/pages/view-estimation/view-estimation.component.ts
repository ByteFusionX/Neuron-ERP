import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { NavigationExtras, Router } from '@angular/router';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { Estimations } from 'src/app/shared/interfaces/enquiry.interface';
import { QuoteItem } from 'src/app/shared/interfaces/quotation.interface';

@Component({
    selector: 'app-view-estimation',
    templateUrl: './view-estimation.component.html',
    styleUrls: ['./view-estimation.component.css'],
    standalone: false
})
export class ViewEstimationComponent {
  selectedOption: number = 0;
  constructor(
    private _dialog: MatDialog,
    private dialogRef: MatDialogRef<ViewEstimationComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { estimation: Estimations, enqId: string, isEdit: boolean },
    private _router: Router
  ) { }

  onEstimationEdit() {
    this.dialogRef.close()
    const navigationExtras: NavigationExtras = {
      state: { estimation: this.data.estimation, enquiryId: this.data.enqId }
    };
    this._router.navigate(['/assigned-jobs/edit-estimations'], navigationExtras);
  }

  onClearEstimation() {
    const dialogRef = this._dialog.open(ConfirmationDialogComponent,
      {
        data: {
          title: `Are you absolutely sure?`,
          description: `This action is irreversible and this will remove your estimation and you have to re-estmate. `,
          icon: 'heroExclamationCircle',
          IconColor: 'orange'
        }
      });

    dialogRef.afterClosed().subscribe((approved: boolean) => {
      if (approved) {
        this.dialogRef.close({ remove: true })
      }
    })
  }


  calculateTotalCost(i: number, j: number, k: number) {
    return this.data.estimation.optionalItems[this.selectedOption].items[j].itemDetails[k].quantity *
      this.data.estimation.optionalItems[this.selectedOption].items[j].itemDetails[k].unitCost;
  }

  calculateAllTotalCost() {
    let totalCost = 0;
    this.data.estimation.optionalItems[this.selectedOption].items.forEach((item, j) => {
        item.itemDetails.forEach((itemDetail, k) => {
          totalCost += this.calculateTotalCost(this.selectedOption, j, k)
        })
      })

    return totalCost;
  }

  calculateSellingPrice(): number {
    let totalCost = 0;
    this.data.estimation.optionalItems[this.selectedOption].items.forEach((item, j) => {
      item.itemDetails.forEach((itemDetail, k) => {
          totalCost += this.calculateTotalPrice(this.selectedOption, j, k)
        })
      })

    return totalCost;
  }

  calculateProfit(i: number, j: number, k: number) {
    const unitCost = this.data.estimation.optionalItems[i].items[j].itemDetails[k].unitCost;
    const unitSellingPrice = this.data.estimation.optionalItems[i].items[j].itemDetails[k].unitSellingPrice;
    
    if (unitCost && unitSellingPrice) {
      return ((unitSellingPrice - unitCost) / unitSellingPrice) * 100;
    }
    return 0;
  }

  calculateTotalPrice(i: number, j: number, k: number) {
    return this.data.estimation.optionalItems[i].items[j].itemDetails[k].unitSellingPrice * this.data.estimation.optionalItems[i].items[j].itemDetails[k].quantity;
  }

  calculateProfitMargin(): number {
    return this.calculateSellingPrice() - this.calculateAllTotalCost() || 0
  }

  calculateTotalProfit(): number {
    return ((this.calculateSellingPrice() - this.calculateAllTotalCost()) / this.calculateSellingPrice() * 100) || 0
  }

  calculateDiscoutPrice(): number {
    return this.calculateSellingPrice() - (this.data.estimation.totalDiscount || 0)
  }



  onClose() {
    this.dialogRef.close()
  }
}
