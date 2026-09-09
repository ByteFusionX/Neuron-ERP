import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { Product } from 'src/app/core/services/product/product.service';
import { ModalLayoutComponent } from 'src/app/shared/components/modal-layout/modal-layout.component';
import { NgIcon } from '@ng-icons/core';
import { MatTooltip } from '@angular/material/tooltip';

export interface ProductViewModalData {
  product: Product;
}

@Component({
  selector: 'app-product-view',
  standalone: true,
  templateUrl: './product-view.component.html',
  styleUrls: ['./product-view.component.css'],
  imports: [CommonModule, ModalLayoutComponent, NgIcon, MatTooltip]
})
export class ProductViewComponent {
  productData: Product;

  constructor(
    public dialogRef: MatDialogRef<ProductViewComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ProductViewModalData
  ) {
    this.productData = this.data.product;
  }

  onEdit(): void {
    this.dialogRef.close('edit');
  }

  onClose(): void {
    this.dialogRef.close();
  }
}
