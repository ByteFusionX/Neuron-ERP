import { CommonModule } from '@angular/common';
import { Component, inject, signal, OnInit, OnDestroy, ViewChild, OnChanges, SimpleChanges, Input } from '@angular/core';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { Subscription } from 'rxjs';
import { ToastrService } from 'ngx-toastr';

import { TableComponent } from 'src/app/shared/components/table/table.component';
import { TableColumn, TableFilter } from 'src/app/shared/components/table/table.model';
import { PaginationService } from 'src/app/core/services/pagination.service';
import { InvoiceService } from 'src/app/core/services/invoice.service';

@Component({
    selector: 'app-invoice-dn-linking',
    standalone: true,
    imports: [
        CommonModule,
        TableComponent,
        RouterModule
    ],
    templateUrl: './invoice-dn-linking.component.html',
    styleUrl: './invoice-dn-linking.component.css',
    providers: [PaginationService]
})
export class InvoiceDnLinkingComponent implements OnInit, OnDestroy, OnChanges {
    @Input() globalDateRange: { fromDate: string, toDate: string } | null = null;
    @ViewChild(TableComponent) tableComponent!: TableComponent;

    private invoiceService = inject(InvoiceService);
    private router = inject(Router);
    private route = inject(ActivatedRoute);
    private paginationService = inject(PaginationService);
    private notificationService = inject(ToastrService);
    private subscriptions = new Subscription();

    tableData = signal<any[]>([]);
    tableColumns: TableColumn[] = [];
    defaultColumns: string[] = [];

    isLoading = signal<boolean>(true);
    isEmpty = signal<boolean>(false);
    totalItems = signal<number>(0);

    statusOptions = ['Fully Invoiced', 'Partially Invoiced', 'Pending Invoice'];

    selectedStatus = signal<string[]>(this.statusOptions);

    ngOnInit(): void {
        this.setupTableColumns();
        this.initializeFromUrlParams();
    }

    ngOnDestroy(): void {
        this.subscriptions.unsubscribe();
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['globalDateRange'] && !changes['globalDateRange'].firstChange) {
            const paginationState = this.paginationService.paginationState();
            this.paginationService.updatePaginationState({
                page: 1,
                row: paginationState.row,
                total: paginationState.total
            });
            this.loadData();
        }
    }

    initializeFromUrlParams(): void {
        this.route.queryParams.subscribe(params => {
            const page = params['page'] ? parseInt(params['page']) : 1;
            const row = params['row'] ? parseInt(params['row']) : 10;
            const search = params['search'] || '';

            const status = params['status'] ? (Array.isArray(params['status']) ? params['status'] : [params['status']]) : null;

            this.paginationService.updatePaginationState({
                page,
                row,
                total: this.totalItems()
            });

            if (status) this.selectedStatus.set(status);

            this.loadData();
        });
    }

    setupTableColumns(): void {
        this.tableColumns = [
            {
                key: 'job.jobId',
                label: 'Job ID ',
                type: 'text',
                sortable: true,
                filterable: true,
                filterType: 'text',
                filterPlaceholder: 'Search Job ID or LPO...'
            },
            {
                key: 'clientName',
                label: 'Customer Name',
                type: 'text',
                filterable: true,
                filterType: 'text',
                filterPlaceholder: 'Search customer...'
            },
            {
                key: 'invoiceNos',
                label: 'Invoice No',
                type: 'text',
                filterable: true,
                filterType: 'text',
                filterPlaceholder: 'Search Invoice No...'
            },
            {
                key: 'invoiceDates',
                label: 'Invoice Date',
                type: 'date',
                pipeParams: 'dd/MM/yyyy',
                sortable: true,
                filterable: false
            },
            {
                key: 'dnNo',
                label: 'DN No',
                type: 'text',
                filterable: true,
                filterType: 'text',
                filterPlaceholder: 'Search DN No...'
            },
            {
                key: 'dnDate',
                label: 'DN Date',
                type: 'date',
                pipeParams: 'dd/MM/yyyy',
                sortable: true,
                filterable: false
            },
            {
                key: 'totalDeliveredQty',
                label: 'Delivered Qty',
                type: 'number',
                filterable: false
            },
            {
                key: 'totalInvoicedQty',
                label: 'Invoiced Qty',
                type: 'number',
                filterable: false
            },
            {
                key: 'balanceQty',
                label: 'Balance Qty',
                type: 'number',
                filterable: false
            },
            {
                key: 'linkingStatus',
                label: 'Status',
                type: 'status',
                filterable: true,
                filterType: 'select',
                filterOptions: this.statusOptions.map((s) => ({ label: s, value: s })),
                statusOptions: this.statusOptions
            }
        ];

        this.defaultColumns = [
            'invoiceNos', 'invoiceDates', 'job.jobId', 'clientName', 'dnNo', 'dnDate', 'totalDeliveredQty',
            'totalInvoicedQty', 'balanceQty', 'linkingStatus'
        ];
    }

    loadData(filters?: any): void {
        this.isLoading.set(true);
        const paginationState = this.paginationService.paginationState();

        const params: any = {
            page: paginationState.page,
            limit: paginationState.row,
            status: this.selectedStatus(),
            ...filters
        };

        if (this.globalDateRange) {
            params.fromDate = this.globalDateRange.fromDate;
            params.toDate = this.globalDateRange.toDate;
        }

        this.subscriptions.add(
            this.invoiceService.getInvoiceDnLinkingReport(params).subscribe({
                next: (response) => {
                    this.tableData.set(response.data.report || []);
                    const pagination = response.data.pagination;
                    this.totalItems.set(pagination.total);

                    this.paginationService.updatePaginationState({
                        page: pagination.page,
                        row: pagination.limit,
                        total: pagination.total
                    });

                    this.isEmpty.set(this.tableData().length === 0);
                    this.isLoading.set(false);
                    this.updateUrlParams();
                },
                error: (error) => {
                    this.notificationService.error('Failed to load DN Linking Report');
                    console.error('Error loading report:', error);
                    this.isLoading.set(false);
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

        const filterParams: any = filters.reduce((acc, filter) => {
            switch (filter.type) {
                case 'text':
                    if (filter.column === 'job.jobId') {
                        acc['jobId'] = filter.value;
                    } else if (filter.column === 'clientName') {
                        acc['customer'] = filter.value;
                    } else {
                        acc[filter.column] = filter.value;
                    }
                    break;
                case 'select':
                    if (filter.column === 'linkingStatus') {
                        acc['status'] = Array.isArray(filter.value) ? filter.value : [filter.value];
                        this.selectedStatus.set(acc['status']);
                    }
                    break;
                case 'date':
                    if (filter.column === 'invoiceDates') {
                        acc['fromDate'] = filter.value[0];
                        acc['toDate'] = filter.value[1];
                    }
                    break;
            }
            return acc;
        }, {} as any);

        this.loadData(filterParams);
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

    onRowClick(row: any): void {
        // Navigate to DN details or invoice details based on the row logic
        // We navigate to DN details for now as primary entity is DN
        if (row._id) {
            // this.router.navigate(['/dispatch/view', row._id]);
            // As per req: row click -> DN/Invoice detail. Assuming DN router view.
        }
    }

    exportReport(): void {
        const total = this.totalItems();
        if (total === 0) {
            this.notificationService.warning('No data to export');
            return;
        }

        const filterParams: any = {
            page: 1,
            limit: total,
            status: this.selectedStatus()
        };

        if (this.globalDateRange) {
            filterParams.fromDate = this.globalDateRange.fromDate;
            filterParams.toDate = this.globalDateRange.toDate;
        }

        this.invoiceService.getInvoiceDnLinkingReport(filterParams).subscribe({
            next: (response) => {
                if (this.tableComponent && response.data.report.length > 0) {
                    // Format data for export
                    const exportData = response.data.report.map((item: any) => ({
                        'Invoice Nos': item.invoiceNos || '-',
                        'Invoice Dates': item.invoiceDates ? new Date(item.invoiceDates).toLocaleDateString() : '-',
                        'Job ID': item.job?.jobId || '-',
                        'Customer Name': item.clientName || '-',
                        'DN No': item.dnNo,
                        'DN Date': item.dnDate ? new Date(item.dnDate).toLocaleDateString() : '-',
                        'Delivered Qty': item.totalDeliveredQty,
                        'Invoiced Qty': item.totalInvoicedQty,
                        'Balance Qty': item.balanceQty,
                        'Status': item.linkingStatus
                    }));
                    this.tableComponent.exportAllData(exportData);
                }
            },
            error: (error) => {
                this.notificationService.error('Failed to export data');
            }
        });
    }
}
