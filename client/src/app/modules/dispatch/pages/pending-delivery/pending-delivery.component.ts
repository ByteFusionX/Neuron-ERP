import { Component, OnInit, ViewChild, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { TableComponent } from 'src/app/shared/components/table/table.component';
import { TableColumn } from 'src/app/shared/components/table/table.model';
import { DeliveryNoteService } from 'src/app/core/services/delivery-note/delivery-note.service';
import { PaginationService } from 'src/app/core/services/pagination.service';
import { ButtonComponent } from 'src/app/shared/components/button/button.component';
import { IconsModule } from 'src/app/lib/icons/icons.module';

@Component({
  selector: 'app-pending-delivery',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    TableComponent,
    ButtonComponent,
    IconsModule
  ],
  templateUrl: './pending-delivery.component.html',
  styleUrl: './pending-delivery.component.css',
  providers: [PaginationService]
})
export class PendingDeliveryComponent implements OnInit {
  @ViewChild(TableComponent) tableComponent!: TableComponent;

  private dnService = inject(DeliveryNoteService);
  private router = inject(Router);
  private toaster = inject(ToastrService);
  private paginationService = inject(PaginationService);

  tableData = signal<any[]>([]);
  tableColumns: TableColumn[] = [];
  defaultColumns: string[] = [];

  isLoading = signal<boolean>(true);
  isEmpty = signal<boolean>(false);
  totalItems = signal<number>(0);

  ngOnInit(): void {
    this.setupTableColumns();
    this.loadData();
  }

  setupTableColumns(): void {
    this.tableColumns = [
      {
        key: 'jobId',
        label: 'Job ID',
        type: 'text',
        filterable: true,
        filterType: 'text'
      },
      {
        key: 'customer',
        label: 'Customer',
        type: 'text',
        filterable: true,
        filterType: 'text'
      },
      {
        key: 'status',
        label: 'Status',
        type: 'status',
        headerClass: 'text-center',
        filterable: true,
        filterType: 'select',
        filterOptions: [
          { label: 'To be Delivered', value: 'To be Delivered' },
          { label: 'Partially Delivered', value: 'Partially Delivered' }
        ]
      },
      {
        key: 'actions',
        label: 'Action',
        type: 'action',
        headerClass: '!text-center',
        actions: [
          {
            icon: 'heroEye',
            tooltip: 'View Pending Items',
            action: 'viewJob',
            buttonClass: 'cursor-pointer w-8 h-8 rounded-full border border-gray-300 hover:border-gray-500 flex justify-center items-center'
          }
        ]
      }
    ];

    this.defaultColumns = ['jobId', 'customer', 'status', 'actions'];
  }

  loadData(): void {
    this.isLoading.set(true);
    const paginationState = this.paginationService.paginationState();

    const payload = {
      page: paginationState.page,
      row: paginationState.row
    };

    this.dnService.getPendingDeliveries(payload).subscribe({
      next: (res) => {
        this.tableData.set(res.jobs || []);
        this.totalItems.set(res.total || 0);

        this.paginationService.updatePaginationState({
          page: paginationState.page,
          row: paginationState.row,
          total: res.total || 0
        });

        this.isEmpty.set(this.tableData().length === 0);
        this.isLoading.set(false);
      },
      error: (error) => {
        this.toaster.error('Failed to load pending deliveries');
        console.error('Error loading pending deliveries:', error);
        this.isLoading.set(false);
        this.isEmpty.set(true);
      }
    });
  }

  onPaginationChange(event: { page: number; row: number }): void {
    this.paginationService.updatePaginationState({
      page: event.page,
      row: event.row,
      total: this.totalItems()
    });
    this.loadData();
  }

  onActionClick(event: { action: string; item: any }): void {
    const { action, item } = event;
    if (action === 'viewJob') {
      this.viewJob(item);
    }
  }

  onRowClick(row: any): void {
    this.viewJob(row);
  }

  viewJob(row: any): void {
    this.router.navigate(['/dispatch/pending-delivery-reports', row.jobMongoId]);
  }

  onExportRequest(): void {
    const total = this.totalItems();
    if (total === 0) {
      this.toaster.warning('No data to export');
      return;
    }

    const payload = {
      page: 1,
      row: total
    };

    this.dnService.getPendingDeliveries(payload).subscribe({
      next: (res) => {
        if (this.tableComponent && res.jobs && res.jobs.length > 0) {
          this.tableComponent.exportAllData(res.jobs);
        }
      },
      error: (error) => {
        this.toaster.error('Failed to export pending deliveries');
        console.error('Error exporting pending deliveries:', error);
      }
    });
  }
}
