import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatMenuModule } from '@angular/material/menu';
import { Router } from '@angular/router';
import { NgSelectModule } from '@ng-select/ng-select';
import { ToastrService } from 'ngx-toastr';
import { PaginationService } from 'src/app/core/services/pagination.service';
import { PurchaseService } from 'src/app/core/services/purchase/purchase.service';
import { IconsModule } from 'src/app/lib/icons/icons.module';
import { ButtonComponent } from 'src/app/shared/components/button/button.component';
import { SearchComponent } from 'src/app/shared/components/search/search.component';
import { TableComponent } from 'src/app/shared/components/table/table.component';
import { TableColumn } from 'src/app/shared/components/table/table.model';

@Component({
  selector: 'app-approved',
  imports: [
    TableComponent,
    CommonModule,
    NgSelectModule,
    MatMenuModule,
    IconsModule,
    SearchComponent,
    ButtonComponent,
    FormsModule
  ],
  templateUrl: './approved.component.html',
  styleUrl: './approved.component.css',
  providers: [PaginationService]
})
export class ApprovedPurchaseComponent {
  private router = inject(Router);
  private paginationService = inject(PaginationService);
  private purchaseService = inject(PurchaseService);
  private notificationService = inject(ToastrService);

  tableData = signal<any[]>([]);
  tableColumns: TableColumn[] = [];
  defaultColumns: string[] = [];

  isLoading = signal<boolean>(false);
  isEmpty = signal<boolean>(false);
  totalItems = signal<number>(0);

  selectedLocation = signal<string>('');
  selectedCategory = signal<string>('');
  selectedStatus = signal<string>('Approved');

  ngOnInit(): void {
    this.setupTableColumns()
    this.getPurchases()
  }

  setupTableColumns(): void {
    this.tableColumns = [
      {
        key: 'createdAt',
        label: 'Created Date',
        type: 'date',
        pipeParams: 'dd/MM/yyyy',
        sortable: true,
      },
      {
        key: 'customerId.companyName',
        label: 'Customer Name',
        type: 'text',
      },
      {
        key: 'purchaseNo',
        label: 'PR NO',
        type: 'text',
      },
      {
        key: 'jobId.jobId',
        label: 'Job ID',
        type: 'text',
      },
      {
        key: 'totalLpo',
        label: 'LPO Value',
        type: 'text',
      },
      {
        key: 'createdBy.firstName',
        label: 'Created By',
        type: 'text',
      },
      {
        key: 'status',
        label: 'Status',
        type: 'status',
        headerClass: 'text-center'
      },
      {
        key: 'initiateLpo',
        label: 'Initiate LPO',
        type: 'action',
      }
    ]

    this.defaultColumns = [
      'createdAt', 'customerId.companyName', 'purchaseNo', 'jobId.jobId', 'totalLpo', `createdBy.firstName`, 'status', 'initiateLpo'
    ];
  }

  getPurchases() {
    this.isLoading.set(true);
    const currentState = this.paginationService.paginationState();
    this.purchaseService.getPurchases({
      page: 1,
      row: currentState.row,
      status: this.selectedStatus(),
    }).subscribe({
      next: (response) => {
        this.tableData.set(response.purchase.data);
        this.totalItems.set(response.purchase.total);
        this.isEmpty.set(this.tableData().length === 0);
        this.isLoading.set(false);
      }, error: (error) => {
        console.log(error);
      }
    })
  }

  viewPurchaseDetails(purchase: any): void {
    this.router.navigate(['/purchase/view-purchase', purchase._id]);
  }

  onRowClick(row: any): void {
    this.viewPurchaseDetails(row);
  }

  onActionClick(event: { action: string; item: any }): void {
    const { action, item } = event;
    switch (action) {
      case 'viewPurchase':
        this.viewPurchaseDetails(item);
        break;
      case 'editPurchase':
        this.editPurchase(item);
        break;
      case 'viewDocuments':
        this.viewDocuments(item);
        break;
    }
  }

  editPurchase(purchase: any): void {
    this.router.navigate(['/purchase', purchase.id, 'edit']);
  }

  viewDocuments(purchase: any): void {
    // Implement document viewing logic
    console.log('Viewing documents for purchase:', purchase);
  }

  onSearch(searchInput: string) {
    this.isLoading.set(true);
    const currentState = this.paginationService.paginationState();
    this.paginationService.updatePaginationState({
      page: 1,
      row: currentState.row,
      total: currentState.total
    });
    this.purchaseService.getPurchases({
      page: 1,
      row: currentState.row,
      status: this.selectedStatus(),
      search: searchInput
    }).subscribe({
      next: (response) => {
        this.tableData.set(response.data.purchase);
        this.totalItems.set(response.data.pagination.total);
        this.isEmpty.set(this.tableData().length === 0);
        this.isLoading.set(false);
      },
      error: (error) => {
        this.notificationService.error('Failed to search purchases');
        console.error('Error searching pruchases:', error);
        this.isLoading.set(false);
      }
    });
  }
}
