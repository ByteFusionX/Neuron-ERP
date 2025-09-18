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
import { TableComponent } from 'src/app/shared/components/table/table.component';
import { TableColumn } from 'src/app/shared/components/table/table.model';
import { PurchaseData } from 'src/app/shared/interfaces/purchase.interface';

@Component({
  selector: 'app-approved',
  imports: [
    TableComponent,
    CommonModule,
    NgSelectModule,
    MatMenuModule,
    IconsModule,
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
  selectedStatus = signal<string[]>(['Approved']);
  statusOptions: string[] = ['Pending', 'Drafted'];

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
        filterable: true,
        filterType: 'date'
      },
      {
        key: 'customerId.companyName',
        label: 'Customer Name',
        type: 'text',
        filterable: true,
        filterType: 'text',
        filterPlaceholder: 'Search customer...'
      },
      {
        key: 'purchaseNo',
        label: 'PR NO',
        type: 'text',
        filterable: true,
        filterType: 'text',
        filterPlaceholder: 'Search PR No...'
      },
      {
        key: 'jobId.jobId',
        label: 'Job ID',
        type: 'text',
        filterable: true,
        filterType: 'text',
        filterPlaceholder: 'Search Job ID...'
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
        filterable: true,
        filterType: 'text',
        filterPlaceholder: 'Search created by...'
      },
      {
        key: 'status',
        label: 'Status',
        type: 'status',
        headerClass: 'text-center',
        filterable: true,
        filterType: 'select',
        filterOptions: this.statusOptions.map(type => ({ label: type, value: type }))
      },
      {
        key: 'initiateLpo',
        label: 'Initiate LPO',
        type: 'action',
        actions: [
          {
            icon: 'heroPaperAirplane',
            tooltip: 'Initiate LPO',
            action: 'initiateLpo',
            buttonClass: 'cursor-pointer text-center flex justify-center items-center gap-2 px-2 py-2 border border-gray-300 hover:border-gray-500 text-sm rounded-full font-medium'
          },
        ]
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
    this.router.navigate(['/purchase/initiate-lpo', purchase._id]);
  }

  onRowClick(row: any): void {
    this.viewPurchaseDetails(row);
  }

  onActionClick(event: { action: string; item: PurchaseData }): void {
    const { action, item } = event;
    switch (action) {
      case 'initiateLpo':
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
