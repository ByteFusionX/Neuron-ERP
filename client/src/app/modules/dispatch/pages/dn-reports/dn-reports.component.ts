import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgSelectModule } from '@ng-select/ng-select';
import { PendingDeliveryComponent } from '../pending-delivery/pending-delivery.component';
import { InvoiceLinkingComponent } from '../invoice-linking/invoice-linking.component';
import { InventoryDeductionComponent } from '../inventory-deduction/inventory-deduction.component';
import { ButtonComponent } from 'src/app/shared/components/button/button.component';
import { ToastrService } from 'ngx-toastr';

export interface GlobalDateRange {
  fromDate: string;
  toDate: string;
}

@Component({
  selector: 'app-dn-reports',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    NgSelectModule,
    PendingDeliveryComponent,
    InvoiceLinkingComponent,
    InventoryDeductionComponent,
    ButtonComponent
  ],
  templateUrl: './dn-reports.component.html',
  })
export class DnReportsComponent {
  reportOptions = [
    { value: 'pending-delivery', label: 'Pending Delivery' },
    { value: 'invoice-linking', label: 'Invoice Linking' },
    { value: 'inventory-deduction', label: 'Inventory Deduction' }
  ];

  selectedReport = signal<string | null>(null);
  fromDate = signal<string>('');
  toDate = signal<string>('');

  activeReport = signal<string | null>(null);
  activeDateRange = signal<GlobalDateRange | null>(null);

  constructor(private toaster: ToastrService) {}

  generateReport() {
    if (!this.selectedReport()) {
      this.toaster.warning('Please select a report type');
      return;
    }
    
    // If dates are provided, ensure both are selected or neither
    if ((this.fromDate() && !this.toDate()) || (!this.fromDate() && this.toDate())) {
      this.toaster.warning('Please select both From and To dates');
      return;
    }

    if (this.fromDate() && this.toDate() && new Date(this.fromDate()) > new Date(this.toDate())) {
      this.toaster.warning('From Date cannot be later than To Date');
      return;
    }

    // Set the inputs that will be passed down to the child components
    if (this.fromDate() && this.toDate()) {
      this.activeDateRange.set({
        fromDate: this.fromDate(),
        toDate: this.toDate()
      });
    } else {
      this.activeDateRange.set(null);
    }
    
    this.activeReport.set(this.selectedReport());
  }
}
