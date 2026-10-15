import { Component } from '@angular/core';
import { MasterDataGridComponent, MasterTab } from './master-data-grid.component';

@Component({
  selector: 'app-supplier-data',
  standalone: true,
  imports: [MasterDataGridComponent],
  template: `
    <app-master-data-grid label="Supplier Data" storageKey="supplier" [tabs]="tabs"
      description="Classification lists used by supplier records."></app-master-data-grid>
  `,
})
export class SupplierDataComponent {
  tabs: MasterTab[] = [
    { id: 'supplierCategory', label: 'Category', title: 'Category', list: 'supplierCategory', hint: 'Used by the Category field on supplier records. The first letters of the category name form the code in the supplier ID.' },
    { id: 'supplierType', label: 'Supplier Type', title: 'Supplier type', list: 'supplierType', hint: 'Used by the Supplier Type field on supplier records.' },
  ];
}
