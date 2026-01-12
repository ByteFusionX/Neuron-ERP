import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatMenuModule } from '@angular/material/menu';
import { Router, ActivatedRoute } from '@angular/router';
import { NgSelectModule } from '@ng-select/ng-select';
import { ToastrService } from 'ngx-toastr';
import { PaginationService } from 'src/app/core/services/pagination.service';
import { TechnicalService } from 'src/app/core/services/technical.service';
import { IconsModule } from 'src/app/lib/icons/icons.module';
import { TableComponent } from 'src/app/shared/components/table/table.component';
import { TableColumn, TableFilter } from 'src/app/shared/components/table/table.model';
import { Subscription } from 'rxjs';

interface FilterParams {
  [key: string]: any;
  page: number;
  row: number;
  jobId?: string;
  customerName?: string;
  search?: string;
}

@Component({
  selector: 'app-mr-approval-requests',
  standalone: true,
  imports: [
    TableComponent,
    CommonModule,
    NgSelectModule,
    MatMenuModule,
    IconsModule,
    FormsModule
  ],
  templateUrl: './mr-approval-requests.component.html',
  styleUrl: './mr-approval-requests.component.css',
  providers: [PaginationService]
})
export class MrApprovalRequestsComponent implements OnInit, OnDestroy {
  private technicalService = inject(TechnicalService);
  private notificationService = inject(ToastrService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private dialog = inject(MatDialog);
  private paginationService = inject(PaginationService);
  private subscriptions = new Subscription();

  tableData = signal<any[]>([]);
  tableColumns: TableColumn[] = [];
  defaultColumns: string[] = [];
  currentRoute = this.router.url;
  currentPage = 'MR Approval Requests';

  isLoading = signal<boolean>(true);
  isEmpty = signal<boolean>(false);
  totalItems = signal<number>(0);

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

      this.paginationService.updatePaginationState({
        page,
        row,
        total: this.totalItems()
      });

      this.loadData();
    });
  }

  setupTableColumns(): void {
    this.tableColumns = [
      {
        key: 'jobId.jobId',
        label: 'Job ID',
        type: 'text',
        sortable: true,
        filterable: true,
        filterType: 'text',
        filterPlaceholder: 'Search Job ID...',
      },
      {
        key: 'customer.companyName',
        label: 'Project Name',
        type: 'text',
        sortable: true,
        filterable: true,
        filterType: 'text',
        filterPlaceholder: 'Search Project Name...',
      },
      {
        key: 'actions',
        label: 'Actions',
        type: 'action',
        headerClass: '!text-center',
        actions: [
          {
            icon: 'heroEye',
            tooltip: 'View MR',
            action: 'viewMr',
            buttonClass: 'cursor-pointer text-center flex justify-center items-center gap-2 px-2 py-2 border border-gray-300 hover:border-gray-500 text-sm rounded-full font-medium'
          }
        ]
      }
    ];

    this.defaultColumns = [
      'jobId.jobId',
      'customer.companyName',
      'actions'
    ];
  }

  loadData(filters?: Partial<FilterParams>): void {
    this.isLoading.set(true);
    const paginationState = this.paginationService.paginationState();

    const filterParams: FilterParams = {
      page: paginationState.page,
      row: paginationState.row,
      ...filters
    };

    this.subscriptions.add(
      this.technicalService.getPendingMaterialRequestProjects(filterParams).subscribe({
        next: (response) => {
          this.tableData.set(response.data || []);
          const total = response.total || 0;
          this.totalItems.set(total);

          this.paginationService.updatePaginationState({
            page: paginationState.page,
            row: paginationState.row,
            total: total
          });

          this.isEmpty.set(this.tableData().length === 0);
          this.isLoading.set(false);
          this.updateUrlParams();
        },
        error: (error) => {
          this.notificationService.error('Failed to load MR approval requests');
          console.error('Error loading MR approval requests:', error);
          this.isLoading.set(false);
          this.isEmpty.set(true);
        }
      })
    );
  }

  onPaginationChange(event: { page: number, row: number }): void {
    this.paginationService.updatePaginationState({
      page: event.page,
      row: event.row,
      total: this.totalItems()
    });
    this.loadData();
  }

  onFilterChange(filters: TableFilter[]): void {
    this.isLoading.set(true);
    const currentState = this.paginationService.paginationState();
    this.paginationService.updatePaginationState({
      page: 1,
      row: currentState.row,
      total: currentState.total
    });

    const filterParams: Partial<FilterParams> = filters.reduce((acc, filter) => {
      switch (filter.type) {
        case 'text':
          if (filter.column === 'jobId.jobId') {
            acc['jobId'] = filter.value;
          } else if (filter.column === 'customer.companyName') {
            acc['customerName'] = filter.value;
          }
          break;
      }
      return acc;
    }, {} as Partial<FilterParams>);

    this.loadData(filterParams);
    this.updateUrlParams();
  }

  onActionClick(event: { action: string; item: any }): void {
    const { action, item } = event;

    if (action === 'viewMr') {
      this.viewMaterialRequest(item);
    }
  }

  viewMaterialRequest(item: any): void {
    this.router.navigate(['/technical/mr-approval-requests/view', item._id]);
  }

  updateUrlParams(): void {
    const paginationState = this.paginationService.paginationState();
    const queryParams: any = {};

    queryParams.page = paginationState.page !== 1 ? paginationState.page : null;
    queryParams.row = paginationState.row !== 10 ? paginationState.row : null;

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: queryParams,
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
  }
}


