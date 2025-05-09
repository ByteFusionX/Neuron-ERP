import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { NgIcon } from '@ng-icons/core';

@Component({
  selector: 'app-supplier-discount',
  imports: [NgIcon, CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './supplier-discount.component.html',
  styleUrl: './supplier-discount.component.css'
})
export class SupplierDiscountComponent {
}
