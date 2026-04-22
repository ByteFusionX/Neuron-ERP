import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgSelectModule } from '@ng-select/ng-select';
import { InvoiceDnLinkingComponent } from '../invoice-dn-linking/invoice-dn-linking.component';
import { CancelledInvoicesComponent } from '../cancelled-invoices/cancelled-invoices.component';
import { CancelledReissuedReportComponent } from '../cancelled-reissued-report/cancelled-reissued-report.component';
import { ButtonComponent } from 'src/app/shared/components/button/button.component';
import { ToastrService } from 'ngx-toastr';

export interface GlobalDateRange {
  fromDate: string;
  toDate: string;
}

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    NgSelectModule,
    InvoiceDnLinkingComponent,
    CancelledInvoicesComponent,
    CancelledReissuedReportComponent,
    ButtonComponent
  ],
  templateUrl: './reports.component.html',
})
export class ReportsComponent {
  reportOptions = [
    { value: 'invoice-dn-linking', label: 'Invoice vs DN Linking Report' },
    { value: 'cancelled-invoices', label: 'Cancelled/Adjusted Invoices' },
    { value: 'reissued-invoices', label: 'Reissued Invoices' }
  ];

  selectedReport = signal<string | null>(null);
  fromDate = signal<string>('');
  toDate = signal<string>('');

  activeReport = signal<string | null>(null);
  activeDateRange = signal<GlobalDateRange | null>(null);
  maxDate: string;

  constructor(private toaster: ToastrService) {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    this.maxDate = `${year}-${month}-${day}`;
  }

  generateReport() {
    if (!this.selectedReport()) {
      this.toaster.warning('Please select a report type');
      return;
    }
    
    // If dates are provided, ensure both are selected or neither
    if (!this.fromDate() || !this.toDate()) {
      this.toaster.warning('Please select both From and To dates');
      return;
    }

    const start = new Date(this.fromDate());
    const end = new Date(this.toDate());
    const maxDateObj = new Date(this.maxDate);
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    maxDateObj.setHours(0, 0, 0, 0);

    if (start > end) {
      this.toaster.warning('From Date cannot be later than To Date');
      return;
    }

    if (start > maxDateObj || end > maxDateObj) {
      this.toaster.warning('Dates cannot be in the future');
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
