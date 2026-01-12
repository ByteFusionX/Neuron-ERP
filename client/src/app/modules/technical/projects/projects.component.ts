import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { MatMenuModule } from '@angular/material/menu';
import { NgSelectModule } from '@ng-select/ng-select';
import { FormsModule } from '@angular/forms';
import { IconsModule } from 'src/app/lib/icons/icons.module';
import { ButtonComponent } from 'src/app/shared/components/button/button.component';
import { SearchComponent } from 'src/app/shared/components/search/search.component';
import { TableComponent } from 'src/app/shared/components/table/table.component';
import { TableColumn, TableFilter } from 'src/app/shared/components/table/table.model';
import { ProjectService } from 'src/app/core/services/project.service';
import { ToastrService } from 'ngx-toastr';
import { Router, ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { Project, ProjectType, ProjectStatus } from 'src/app/shared/interfaces/project.interface';
import { PaginationService } from 'src/app/core/services/pagination.service';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { MatDialog } from '@angular/material/dialog';
import { CreateProjectComponent } from '../create-project/create-project.component';
import { TransferEngineerComponent } from './transfer-engineer/transfer-engineer.component';

interface FilterParams {
  [key: string]: any;
  page: number;
  row: number;
  projectType?: string;
  status?: ProjectStatus[];
  assignedEngineer?: string;
  fromDate?: string;
  toDate?: string;
  search?: string;
}

@Component({
  selector: 'app-projects',
  standalone: true,
  imports: [
    TableComponent,
    CommonModule,
    NgSelectModule,
    MatMenuModule,
    IconsModule,
    FormsModule
  ],
  templateUrl: './projects.component.html',
  styleUrl: './projects.component.css',
  providers: [PaginationService]
})
export class ProjectsComponent implements OnInit, OnDestroy {
  private projectService = inject(ProjectService);
  private notificationService = inject(ToastrService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private dialog = inject(MatDialog);
  private paginationService = inject(PaginationService);
  private subscriptions = new Subscription();


  tableData = signal<Project[]>([]);
  tableColumns: TableColumn[] = [];
  defaultColumns: string[] = [];
  currentRoute = this.router.url;
  currentPage =  `Pending ${this.router.url.split('?')[0].split('/').pop()?.split('-').map(word => 
    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  ).join(' ')}`;

  isLoading = signal<boolean>(true);
  isEmpty = signal<boolean>(false);
  totalItems = signal<number>(0);

  priorityOptions: string[] = ['High', 'Medium', 'Low'];
  
  selectedProjectType = this.router.url.split('?')[0].split('/').pop();
  selectedStatus = signal<Array<ProjectStatus>>([]);

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
        key: 'customer.companyName',
        label: 'Project Name',
        type: 'text',
        sortable: true,
        filterable: true,
        filterType: 'text',
        filterPlaceholder: 'Search project...'
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
        key: 'assignedTo',
        label: 'Assigned Engineer',
        type: 'text',
        sortable: true,
        filterable: true,
        filterType: 'text',
        filterPlaceholder: 'Search engineer...',
        cellRenderer: (item: any) => {
          if (item?.assignedTo) {
            return `${item.assignedTo.firstName} ${item.assignedTo.lastName}`;
          }
          return '-';
        },
        inlineButton: {
          icon: 'heroUserPlus',
          tooltip: 'Transfer Engineer',
          buttonClass: 'cursor-pointer text-center flex justify-center items-center gap-1 px-1 py-1 bg-orange-600 hover:bg-orange-700 text-white text-xs rounded-full font-medium transition-colors',
          condition: (item: any) => !!item?.assignedTo,
          onClick: (item: any, event: Event) => {
            this.onTransferEngineer(item);
          }
        }
      },
      {
        key: 'assignedBy',
        label: 'Assigned By',
        type: 'text',
        sortable: true,
        filterable: true,
        filterType: 'text',
        filterPlaceholder: 'Search assigned by...',
        cellRenderer: (item: any) =>
          item?.assignedBy
            ? `${item.assignedBy.firstName} ${item.assignedBy.lastName}`
            : ''
      },
      
      {
        key: 'priority',
        label: 'Priority',
        type: 'status',
        headerClass: 'text-center',
        filterable: true,
        filterType: 'select',
        filterOptions: this.priorityOptions.map(priority => ({ label: priority, value: priority })),
        tooltip: true,
      },
      {
        key: 'actions',
        label: 'Action',
        type: 'action',
        headerClass: '!text-center',
        actions: [
          {
            icon: 'heroPencilSquare',
            tooltip: 'Edit Project',
            action: 'editProject',
            buttonClass: 'cursor-pointer text-center flex justify-center items-center gap-2 px-2 py-2 border border-gray-300 hover:border-gray-500 text-sm rounded-full font-medium'
          },
          {
            icon: 'heroTrash',
            tooltip: 'Delete Project',
            action: 'deleteProject',
            buttonClass: 'cursor-pointer w-8 h-8 rounded-full bg-red-600 flex justify-center items-center text-white',
            condition: (item) => item.status === ProjectStatus.Pending
          }
        ]
      }
    ];

    this.defaultColumns = [
      'customer.companyName', 'jobId.jobId', 'assignedTo', 'assignedBy', 'priority', 'actions'
    ];
  }

  loadData(filters?: Partial<FilterParams>): void {
    this.isLoading.set(true);
    const paginationState = this.paginationService.paginationState();

    const filterParams: FilterParams = {
      page: paginationState.page,
      row: paginationState.row,
      projectType: this.selectedProjectType,
      status: [ProjectStatus.Pending],
      ...filters
    };

    this.subscriptions.add(
      this.projectService.getProjects(filterParams).subscribe({
        next: (response) => {
          this.tableData.set(response.data);
          const total = response.total || response.data.length;
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
          this.notificationService.error('Failed to load projects');
          console.error('Error loading projects:', error);
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

    const filterParams: Partial<FilterParams> = filters.reduce((acc, filter) => {
      switch (filter.type) {
        case 'text':
          acc[filter.column] = filter.value;
          break;
        case 'select':
          acc[filter.column] = filter.value;
          break;
        case 'date':
          if (filter.column === 'allocatedDate') {
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
    this.updateUrlParams();
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

  onActionClick(event: { action: string; item: Project }): void {
    const { action, item } = event;
    
    switch (action) {
      case 'editProject':
        this.editProject(item);
        break;
      case 'deleteProject':
        this.deleteProject(item);
        break;
    }
  }

  editProject(project: Project): void {
    this.router.navigate(['/technical/project', 'edit', project._id]);
  }

  deleteProject(project: Project): void {
    const confirm = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        title: 'Are you absolutely sure',
        description: `This action cannot be undone. This will permanently delete the project "${project.projectName}".`,
        icon: 'heroExclamationCircle',
        IconColor: 'red'
      }
    });

    confirm.afterClosed().subscribe((result: boolean) => {
      if(result) {
        this.projectService.deleteProject(project._id!).subscribe({
          next: () => {
            this.loadData();
            this.notificationService.success('Project deleted successfully');
          },
          error: (error) => {
            this.notificationService.error('Failed to delete project');
            console.error('Error deleting project:', error);
          }
        });
      }
    });
  }

  onTransferEngineer(project: any): void {
    const dialogRef = this.dialog.open(TransferEngineerComponent, {
      data: {
        projectId: project._id,
        currentEngineer: project.assignedTo
      },
      width: '500px',
      disableClose: true
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result && result.engineerId) {
        this.projectService.transferEngineer(project._id, result.engineerId).subscribe({
          next: (response) => {
            if (response.success) {
              this.notificationService.success('Engineer transferred successfully');
              this.loadData();
            }
          },
          error: (error) => {
            this.notificationService.error('Failed to transfer engineer');
            console.error('Transfer failed:', error);
          }
        });
      }
    });
  }
}
