import { Component } from '@angular/core';
import { MasterDataGridComponent, MasterTab } from './master-data-grid.component';

@Component({
  selector: 'app-product-data',
  standalone: true,
  imports: [MasterDataGridComponent],
  template: `
    <app-master-data-grid label="Product Data" storageKey="product" [tabs]="tabs"
      description="Product setup lists used by product records and quantity/tax calculations."></app-master-data-grid>
  `,
})
export class ProductDataComponent {
  tabs: MasterTab[] = [
    { id: 'unit', label: 'Units of Measure', title: 'Unit', list: 'unit', hint: 'Used by Product records and quantity-based sales documents.' },
    { id: 'tax', label: 'Tax Rates', title: 'Tax rate', list: 'tax', valueLabel: 'Rate %', hint: 'Used by Product now and intended for Quotation/Deal tax calculation.' },
  ];
}
