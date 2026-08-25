import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatMenuModule } from '@angular/material/menu';
import { Router, ActivatedRoute } from '@angular/router';
import { NgSelectModule } from '@ng-select/ng-select';
import { ToastrService } from 'ngx-toastr';
import { PaginationService } from 'src/app/core/services/pagination.service';
import { PurchaseService } from 'src/app/core/services/purchase/purchase.service';
import { IconsModule } from 'src/app/lib/icons/icons.module';
import { ButtonComponent } from 'src/app/shared/components/button/button.component';
import { TableComponent } from 'src/app/shared/components/table/table.component';
import { TableColumn, TableFilter } from 'src/app/shared/components/table/table.model';
import { MatDialog } from '@angular/material/dialog';
import { ApprovalStatusComponent, ApprovalStatusData } from 'src/app/shared/components/approval-status/approval-status.component';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-pendings',
  imports: [
    TableComponent,
    CommonModule,
    NgSelectModule,
    MatMenuModule,
    IconsModule,
    ButtonComponent,
    FormsModule
  ],
  templateUrl: './pendings-purchase.component.html',
  styleUrl: './pendings-purchase.component.css',
  providers: [PaginationService]
})
export class PendingPurchaseComponent implements OnInit, OnDestroy {
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private paginationService = inject(PaginationService);
  private purchaseService = inject(PurchaseService);
  private notificationService = inject(ToastrService);
  private dialog = inject(MatDialog);
  private subscriptions = new Subscription();

  tableData = signal<any[]>([]);
  tableColumns: TableColumn[] = [];
  defaultColumns: string[] = [];
  jobColumns: string[] = [];
  manualColumns: string[] = [];

  isLoading = signal<boolean>(false);
  isEmpty = signal<boolean>(false);
  totalItems = signal<number>(0);

  selectedLocation = signal<string>('');
  selectedCategory = signal<string>('');
  selectedStatus = signal<string[]>(['Pending', 'Drafted', 'Rejected']);
  statusOptions: string[] = ['Pending', 'Drafted', 'Rejected'];
  searchQuery = signal<string>('');
  sourceTypeView = signal<'job' | 'manual'>('job');

  ngOnInit(): void {
    this.setupTableColumns();
    this.initializeFromUrlParams();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  initializeFromUrlParams(): void {
    this.route.queryParams.subscribe(params => {
      const page = params['page'] ? parseInt(params['page']) : 1;
      const row = params['row'] ? parseInt(params['row']) : 10;
      const search = params['search'] || '';
      const sourceType = params['sourceType'] === 'general' ? 'manual' : 'job';

      this.paginationService.updatePaginationState({
        page,
        row,
        total: this.totalItems()
      });

      if (search) this.searchQuery.set(search);
      this.sourceTypeView.set(sourceType);
      this.defaultColumns = sourceType === 'manual' ? this.manualColumns : this.jobColumns;

      this.getPurchases();
    });
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
        cellRenderer: (item: any) => {
          const value = typeof item.totalLpo === 'number' ? item.totalLpo : parseFloat(item.totalLpo) || 0;
          const currency = item.currency || '';
          const formattedValue = value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          if (currency) {
            return `${formattedValue} ${currency}`;
          }
          return formattedValue;
        }
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
        key: 'supplierId.supplierName',
        label: 'Supplier',
        type: 'text',
        filterable: false,
        cellRenderer: (item: any) => item.supplierId?.supplierName || '-'
      },
      {
        key: 'procurementPerson',
        label: 'Procurement Person',
        type: 'text',
        filterable: false,
        cellRenderer: (item: any) => {
          if (item.procurementPerson && item.procurementPerson.firstName) {
            return `${item.procurementPerson.firstName} ${item.procurementPerson.lastName}`;
          }
          return '-';
        }
      },
      {
        key: 'status',
        label: 'Status',
        type: 'status',
        filterable: true,
        filterType: 'select',
        filterOptions: this.statusOptions.map(type => ({ label: type, value: type })),
        headerClass: 'text-center',
        cellRenderer: (item: any) => {
          if (item.status === 'Drafted') {
            return 'Drafted';
          }
          return item.overallStatus || item.status || 'Pending';
        }
      },
      {
        key: 'actions',
        label: 'Actions',
        type: 'action',
        actions: [
          { icon: 'heroListBullet', tooltip: 'View Approval Status', action: 'viewApprovalStatus' },
        ]
      },
    ]

    this.jobColumns = [
      'createdAt', 'customerId.companyName', 'purchaseNo', 'jobId.jobId', 'totalLpo', `createdBy.firstName`, 'procurementPerson', 'status', 'actions'
    ];
    this.manualColumns = [
      'createdAt', 'purchaseNo', 'totalLpo', `createdBy.firstName`, 'supplierId.supplierName', 'status', 'actions'
    ];
    this.defaultColumns = this.sourceTypeView() === 'manual' ? this.manualColumns : this.jobColumns;
  }

  onPaginationChange(event: { page: number, row: number }): void {
    this.paginationService.updatePaginationState({
      page: event.page,
      row: event.row,
      total: this.totalItems()
    });
    this.getPurchases();
  }

  onFilterChange(filters: TableFilter[]): void {
    this.isLoading.set(true);
    const currentState = this.paginationService.paginationState();
    this.paginationService.updatePaginationState({
      page: 1,
      row: currentState.row,
      total: currentState.total
    });

    // Convert filters to backend format
    const filterParams: Partial<any> = filters.reduce((acc, filter) => {
      switch (filter.type) {
        case 'text':
          acc[filter.column] = filter.value;
          break;
        case 'select':
          acc[filter.column] = filter.value;
          break;
        case 'date':
          if (filter.column === 'createdAt') {
            acc['fromDate'] = filter.value[0];
            acc['toDate'] = filter.value[1];
          }
          break;
        case 'number':
          acc[filter.column] = filter.value;
          break;
      }
      return acc;
    }, {} as Partial<any>);

    this.getPurchases(filterParams);
    this.updateUrlParams();
  }

  getPurchases(filters?: Partial<any>) {
    this.isLoading.set(true);
    const currentState = this.paginationService.paginationState();

    const filterParams = {
      page: currentState.page,
      row: currentState.row,
      status: this.selectedStatus(),
      search: this.searchQuery() || undefined,
      sourceType: this.sourceTypeView(),
      ...filters
    }

    this.subscriptions.add(
      this.purchaseService.getPurchases(filterParams).subscribe({
        next: (response) => {
          this.tableData.set(response.purchase.data);
          const total = response.purchase.total;
          this.totalItems.set(total);
          
          this.paginationService.updatePaginationState({
            page: currentState.page,
            row: currentState.row,
            total: total
          });
          
          this.isEmpty.set(this.tableData().length === 0);
          this.isLoading.set(false);
          this.updateUrlParams();
        }, error: (error) => {
          this.notificationService.error('Failed to load purchases');
          console.error('Error loading purchases:', error);
          this.isLoading.set(false);
        }
      })
    );
  }

  updateUrlParams(): void {
    const paginationState = this.paginationService.paginationState();
    const queryParams: any = {};

    queryParams.page = paginationState.page !== 1 ? paginationState.page : null;
    queryParams.row = paginationState.row !== 10 ? paginationState.row : null;
    queryParams.search = this.searchQuery() || null;
    queryParams.sourceType = this.sourceTypeView() === 'manual' ? 'general' : null;

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: queryParams,
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
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
      case 'viewApprovalStatus':
        this.viewApprovalStatus(item);
        break;
      default:
        console.warn('Unknown action:', action);
        break;
    }
  }

  viewApprovalStatus(purchase: any): void {
    if (!purchase) {
      this.notificationService.error('Purchase data is missing');
      return;
    }
    
    try {
      const dialogData: ApprovalStatusData = {
        entity: purchase,
        entityType: 'purchaseRequest'
      };
      
      this.dialog.open(ApprovalStatusComponent, {
        width: '800px',
        maxHeight: '90vh',
        data: dialogData
      });
    } catch (error) {
      console.error('Error opening approval status dialog:', error);
      this.notificationService.error('Failed to open approval status');
    }
  }

  editPurchase(purchase: any): void {
    this.router.navigate(['/purchase', purchase.id, 'edit']);
  }

  viewDocuments(purchase: any): void {
    console.log('Viewing documents for purchase:', purchase);
  }

  setSourceTypeView(sourceType: 'job' | 'manual'): void {
    if (this.sourceTypeView() === sourceType) return;
    this.sourceTypeView.set(sourceType);
    this.defaultColumns = sourceType === 'manual' ? this.manualColumns : this.jobColumns;
    const currentState = this.paginationService.paginationState();
    this.paginationService.updatePaginationState({
      page: 1,
      row: currentState.row,
      total: currentState.total
    });
    this.getPurchases();
  }

  onSearch(searchInput: string) {
    this.searchQuery.set(searchInput || '');
    const currentState = this.paginationService.paginationState();
    this.paginationService.updatePaginationState({
      page: 1,
      row: currentState.row,
      total: currentState.total
    });
    this.getPurchases();
    this.updateUrlParams();
  }
}
