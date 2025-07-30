import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
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
import { Router } from '@angular/router';
import { Project, ProjectType, ProjectStatus } from 'src/app/shared/interfaces/project.interface';
import { PaginationService } from 'src/app/core/services/pagination.service';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { MatDialog } from '@angular/material/dialog';

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
    ButtonComponent,
    FormsModule
  ],
  templateUrl: './projects.component.html',
  styleUrl: './projects.component.css',
  providers: [PaginationService]
})
export class ProjectsComponent implements OnInit {
  private projectService = inject(ProjectService);
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

  priorityOptions: string[] = ['High', 'Medium', 'Low'];
  
  selectedProjectType = this.router.url.split('/').pop();
  selectedStatus = signal<Array<ProjectStatus>>([]);

  ngOnInit(): void {
    this.setupTableColumns();
    this.loadData();
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
        cellRenderer: (item: any) =>
          item?.assignedTo
            ? `${item.assignedTo.firstName} ${item.assignedTo.lastName}`
            : ''
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

    this.projectService.getProjects(filterParams).subscribe({
      next: (response) => {
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

  addProject(): void {
    this.router.navigate(['/technical/project', 'add']);
  }
}
