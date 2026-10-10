import { Component } from '@angular/core';
import { GrnStockHoldsComponent } from 'src/app/modules/grn/pages/stock-holds/stock-holds.component';

@Component({
  selector: 'app-purchase-returns',
  standalone: true,
  imports: [GrnStockHoldsComponent],
  template: '<app-grn-stock-holds></app-grn-stock-holds>',
})
export class PurchaseReturnsComponent {}
