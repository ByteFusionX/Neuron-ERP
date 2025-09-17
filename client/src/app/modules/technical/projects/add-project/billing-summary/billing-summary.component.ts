import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ToastrService } from 'ngx-toastr';

import { TableComponent } from 'src/app/shared/components/table/table.component';
import { TableColumn } from 'src/app/shared/components/table/table.model';
import { ButtonComponent } from 'src/app/shared/components/button/button.component';
import { FormFieldComponent } from 'src/app/shared/components/forms/form-field/form-field.component';
import { TechnicalService, BillingSummary } from 'src/app/core/services/technical.service';
import { PaginationService } from 'src/app/core/services/pagination.service';
import { MatDialog } from '@angular/material/dialog';
import { InvoiceFormComponent } from './invoice-form/invoice-form.component';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';

interface BillingSummaryData {
  billingSummary: BillingSummary[];
  lpoValue: number;
  projectId: string;
}

@Component({
  selector: 'app-billing-summary',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TableComponent,
    ButtonComponent,

  ],
  templateUrl: './billing-summary.component.html',
  styleUrl: './billing-summary.component.css',
  providers: [PaginationService]
})
export class BillingSummaryComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private technicalService = inject(TechnicalService);
  private notificationService = inject(ToastrService);
  private dialog = inject(MatDialog);

  billingSummaryData = signal<BillingSummaryData>({
    billingSummary: [],
    lpoValue: 0,
    projectId: ''
  });
  isLoading = signal<boolean>(false);

  projectId = '';

  tableColumns: TableColumn[] = [
    {
      key: 'invoicedAmount',
      label: 'Invoiced Amount',
      type: 'currency',
      pipeParams: { currency: 'QAR', format: '1.2-2' },
      sortable: false,
      filterable: false
    },
    {
      key: 'invoicedAgainst',
      label: 'Invoiced against',
      type: 'text',
      sortable: false,
      filterable: false
    },
    {
      key: 'balanceToBeInvoiced',
      label: 'Balance to be invoice',
      type: 'currency',
      pipeParams: { currency: 'QAR', format: '1.2-2' },
      sortable: false,
      filterable: false
    },
    {
      key: 'invoicedDate',
      label: 'Invoiced date',
      type: 'date',
      pipeParams: 'dd/MM/yyyy',
      sortable: false,
      filterable: false
    },
    {
      key: 'actions',
      label: 'Actions',
      type: 'action',
      actions: [
        {
          icon: 'heroPencil',
          tooltip: 'Edit',
          action: 'edit',
          color: '#6366f1'
        },
        {
          icon: 'heroTrash',
          tooltip: 'Delete',
          action: 'delete',
          color: '#ef4444'
        }
      ]
    }
  ];

  ngOnInit(): void {
    this.projectId = this.route.snapshot.paramMap.get('id') || '';
    if (this.projectId) {
      this.loadBillingSummaries();
    }
  }

  private loadBillingSummaries(): void {
    this.isLoading.set(true);
    this.technicalService.getBillingSummaries(this.projectId).subscribe({
      next: (response) => {
        const data = response.data;
        if (data.length) {
          const processedBillingSummary = data.map((item: any, index: number) => ({
            ...item,
            balanceToBeInvoiced: this.calculateBalance(data, index, response.lpoValue)
          }));

          this.billingSummaryData.set({
            ...data,
            billingSummary: processedBillingSummary,
            lpoValue: response.lpoValue
          });
        }


        this.isLoading.set(false);
      },
      error: (error) => {
        this.isLoading.set(false);
        this.notificationService.error('Failed to load billing summaries');
        console.error('Error loading billing summaries:', error);
      }
    });
  }

  private calculateBalance(summaries: BillingSummary[], currentIndex: number, lpoValue: number): number {
    const totalInvoiced = summaries
      .slice(0, currentIndex + 1)
      .reduce((sum, item) => sum + item.invoicedAmount, 0);

    return Math.max(0, lpoValue - totalInvoiced);
  }

  private calculateTotalBalance(summaries: BillingSummary[], lpoValue: number): number {
    const totalInvoiced = summaries.reduce((sum, item) => sum + item.invoicedAmount, 0);
    return Math.max(0, lpoValue - totalInvoiced);
  }

  onActionClick(event: any): void {
    switch (event.action) {
      case 'edit':
        this.openInvoiceForm(event.item);
        break;
      case 'delete':
        this.deleteBillingSummary(event.item);
        break;
    }
  }

  openInvoiceForm(item?: BillingSummary): void {
    const totalBalance = this.calculateTotalBalance(this.billingSummaryData().billingSummary, this.lpoValue);
    const dialogRef = this.dialog.open(InvoiceFormComponent, {
      data: {
        projectId: this.projectId,
        billingSummary: item || undefined,
        totalBalance: totalBalance
      }
    });

    dialogRef.afterClosed().subscribe((isUpdated: boolean) => {
      if (isUpdated) {
        this.loadBillingSummaries();
      }
    });
  }


  deleteBillingSummary(item: BillingSummary): void {
    this.dialog.open(ConfirmationDialogComponent, {
      data: {
        title: 'Delete Invoice',
        description: 'Are you sure you want to delete this invoice?',
        icon: 'heroExclamationCircle',
        IconColor: 'orange'
      }
    }).afterClosed().subscribe((isConfirmed: boolean) => {
      if (isConfirmed) {
        this.technicalService.deleteBillingSummary(this.projectId, item._id!).subscribe({
          next: () => {
            this.notificationService.success('Billing summary deleted successfully');
            this.loadBillingSummaries();
          },
          error: (error) => {
            this.notificationService.error('Failed to delete billing summary');
            console.error('Error deleting billing summary:', error);
          }
        });
      }
    });
  }

  // Helper to get current data for table
  get tableData() {
    return this.billingSummaryData().billingSummary;
  }

  // Helper to get LPO value
  get lpoValue() {
    return this.billingSummaryData().lpoValue || 0;
  }

  // Helper to get project ID display
  get projectIdDisplay() {
    return this.billingSummaryData().projectId || 'xxxx';
  }
}
