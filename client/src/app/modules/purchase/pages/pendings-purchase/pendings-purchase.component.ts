import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
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
  selector: 'app-pendings',
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
  templateUrl: './pendings-purchase.component.html',
  styleUrl: './pendings-purchase.component.css',
  providers: [PaginationService]
})
export class PendingPurchaseComponent implements OnInit {
  private router = inject(Router);
  private paginationService = inject(PaginationService);
  private supplierService = inject(PurchaseService);
  private notificationService = inject(ToastrService);

  tableData = signal<any[]>([]);
  tableColumns: TableColumn[] = [];
  defaultColumns: string[] = [];

  isLoading = signal<boolean>(false);
  isEmpty = signal<boolean>(false);
  totalItems = signal<number>(0);

  selectedLocation = signal<string>('');
  selectedCategory = signal<string>('');
  selectedStatus = signal<string>('Pending');

  ngOnInit(): void {
    this.setupTableColumns()
  }

  setupTableColumns(): void {
    this.tableColumns = [
      {
        key: 'createdDate',
        label: 'Created Date',
        type: 'date',
        pipeParams: 'dd/MM/yyyy',
        sortable: true,
      },
      {
        key: 'purchaseNo',
        label: 'PR NO',
        type: 'text',
      },
      {
        key: 'jobId',
        label: 'Job ID',
        type: 'text',
      },
      {
        key: 'customer',
        label: 'Customer',
        type: 'text',
      },
      {
        key: 'salesManager',
        label: 'Sales Manager',
        type: 'text',
      },
      {
        key: 'lpoValue',
        label: 'LPO Value',
        type: 'text',
      },
      {
        key: 'mrRequest',
        label: 'MR Request',
        type: 'text',
      },
      {
        key: 'actions',
        label: 'Action',
        type: 'action',
        headerClass: '!text-center',
        actions: []
      }
    ]

    this.defaultColumns = [
      'createdDate','purchaseNo', 'jobId', 'customer', 'salesManager', 'lpoValue', 'mrRequest','actions'
    ];
  }

  viewPurchaseDetails(purchase: any): void {
    // console.log(purchase);
    this.router.navigate(['/purchase', purchase._id]);
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
    this.supplierService.getPurchases({
      page: 1,
      row: currentState.row,
      status: this.selectedStatus(),
      category: this.selectedCategory(),
      supplierType: this.selectedLocation(),
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
