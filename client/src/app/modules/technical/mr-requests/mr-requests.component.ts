import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatMenuModule } from '@angular/material/menu';
import { Router } from '@angular/router';
import { NgSelectModule } from '@ng-select/ng-select';
import { ToastrService } from 'ngx-toastr';
import { PaginationService } from 'src/app/core/services/pagination.service';
import { ProjectService } from 'src/app/core/services/project.service';
import { TechnicalService } from 'src/app/core/services/technical.service';
import { IconsModule } from 'src/app/lib/icons/icons.module';
import { ButtonComponent } from 'src/app/shared/components/button/button.component';
import { TableComponent } from 'src/app/shared/components/table/table.component';
import { TableColumn, TableFilter } from 'src/app/shared/components/table/table.model';
import { Project } from 'src/app/shared/interfaces/project.interface';


interface FilterParams {
  [key: string]: any;
  page: number;
  row: number;
  // engineer?: string;
  // jobId?: string;
  // purchaseNo?: string;
  // message?: string;
  requestedBy?: string;
  fromDate?: string;
  toDate?: string;
  search?: string;
}
@Component({
  selector: 'app-mr-requests',
  standalone: true,
  imports: [
     TableComponent,
        CommonModule,
        NgSelectModule,
        MatMenuModule,
        IconsModule,
        ButtonComponent,
        FormsModule
  ],
  templateUrl: './mr-requests.component.html',
  styleUrl: './mr-requests.component.css',
  providers: [PaginationService]
})
export class MrRequestsComponent {
    private technincalService = inject(TechnicalService);
  private notificationService = inject(ToastrService);
  private router = inject(Router);
  private dialog = inject(MatDialog);
  private paginationService = inject(PaginationService);


  tableData = signal<Project[]>([]);
  tableColumns: TableColumn[] = [];
  defaultColumns: string[] = [];
    currentRoute = this.router.url;
  currentPage =  `Pending ${this.router.url.split('/').pop()?.split('-').map(word => 
    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  ).join(' ')}`;

  isLoading = signal<boolean>(true);
  isEmpty = signal<boolean>(false);
  totalItems = signal<number>(0);


  ngOnInit() : void{
    this.setupTableColumns();
    this.loadData();
  }

  setupTableColumns(){
      this.tableColumns = [
            {
              key: 'mrRequest.engineer',
              label: 'Engineer',
              type: 'text',
              sortable: true,
              filterable: true,
              filterType: 'text',
              filterPlaceholder: 'Search Engineer...'
            },
            {
              key: 'jobId.jobId',
              label: 'Job ID',
              type: 'text',
              sortable: true,
              filterable: true,
              filterType: 'text',
              filterPlaceholder: 'Search job ID...',
            },
            {
              key: 'purchaseNo',
              label: 'Purchase No.',
              type: 'text',
              sortable: true,
              filterable: true,
              filterType: 'text',
              filterPlaceholder: 'Search Purchase No...',
            },
             {
              key: 'mrRequest.message',
              label: 'Message',
              type: 'text',
              sortable: true,
              filterable: true,
              filterType: 'text',
              filterPlaceholder: 'Search Message...',
            },
            { key: 'mrRequest.createdDate', label: 'Date', type: 'date', filterable: true, filterType: 'date', filterPlaceholder: 'Search date...' },
           
          
           
            {
              key: 'createdBy.fullName',
              label: 'Requested By',
              type: 'text',
              sortable: true,
              filterable: true,
              filterType: 'text',
              filterPlaceholder: 'Search Requested by...',
              // cellRenderer: (item: any) =>
              //   item?.createdBy
              //     ? `${item.createdBy.fullName}`
              //     : ''
            },
            
          
            // {
            //   key: 'actions',
            //   label: 'Action',
            //   type: 'action',
            //   headerClass: '!text-center',
            //   actions: [
            //     {
            //       icon: 'heroPencilSquare',
            //       tooltip: 'Edit Project',
            //       action: 'editProject',
            //       buttonClass: 'cursor-pointer text-center flex justify-center items-center gap-2 px-2 py-2 border border-gray-300 hover:border-gray-500 text-sm rounded-full font-medium'
            //     },
            //     {
            //       icon: 'heroTrash',
            //       tooltip: 'Delete Project',
            //       action: 'deleteProject',
            //       buttonClass: 'cursor-pointer w-8 h-8 rounded-full bg-red-600 flex justify-center items-center text-white',
            //       condition: (item) => item.status === ProjectStatus.Pending
            //     }
            //   ]
            // }
          ];
      
          this.defaultColumns = [
            'mrRequest.engineer', 'jobId.jobId', 'purchaseNo', 'mrRequest.message', 'mrRequest.createdDate', 'createdBy.fullName'
          ];
  }

  loadData(filters?: Partial<FilterParams>):void{
 this.isLoading.set(true);
    const paginationState = this.paginationService.paginationState();

    const filterParams: FilterParams = {
      page: paginationState.page,
      row: paginationState.row,
      ...filters
    };

    this.technincalService.getMrRequests(filterParams).subscribe({
      next: (response) => {
        console.log("mr requests response :")
        console.log(response);
        this.tableData.set(response.data);
        this.totalItems.set(response.data.length);
        this.isEmpty.set(this.tableData().length === 0);
        this.isLoading.set(false);
      },
      error: (error) => {

        this.notificationService.error('Failed to load projects');
        console.error('Error loading projects:', error);
        this.isLoading.set(false);
      }
    });
  }

  onFilterChange(filters: TableFilter[]): void {
      console.log('Received filters:', filters); // Add this to debug

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
            acc[filter.column] = filter.value;
            break;
          case 'select':
            acc[filter.column] = filter.value;
            break;
          case 'date':
            if (filter.column === 'createdDate') {
              acc.fromDate = filter.value[0];
              acc.toDate = filter.value[1];
            }
            break;
          case 'number':
            acc[filter.column] = filter.value;
            break;
        }
        return acc;
      }, {} as Partial<FilterParams>);
  
      this.loadData(filterParams);
    }

 }
