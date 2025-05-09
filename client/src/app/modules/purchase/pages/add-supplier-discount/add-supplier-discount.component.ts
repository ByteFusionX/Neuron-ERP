import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { NgIcon } from '@ng-icons/core';

@Component({
  selector: 'app-add-supplier-discount',
  imports: [CommonModule, NgIcon],
  templateUrl: './add-supplier-discount.component.html',
  styleUrl: './add-supplier-discount.component.css'
})
export class AddSupplierDiscountComponent {

constructor(private dialogRef: MatDialogRef<AddSupplierDiscountComponent>) { }

  onCloseClicks() {
    this.dialogRef.close()
  }
}
