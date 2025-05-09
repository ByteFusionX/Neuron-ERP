import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { NgIcon } from '@ng-icons/core';
import { AddSupplierDiscountComponent } from '../add-supplier-discount/add-supplier-discount.component';

@Component({
  selector: 'app-supplier-discount',
  imports: [NgIcon, CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './supplier-discount.component.html',
  styleUrl: './supplier-discount.component.css'
})
export class SupplierDiscountComponent {
  private _dialog = inject(MatDialog)

  onAddFieldClicks() {
    this._dialog.open(AddSupplierDiscountComponent,{
      width: '500px'
    })
  }
}
