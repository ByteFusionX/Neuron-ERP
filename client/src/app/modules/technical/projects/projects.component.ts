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
  projectType?: ProjectType;
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

  isLoading = signal<boolean>(true);
  isEmpty = signal<boolean>(false);
  totalItems = signal<number>(0);

  projectTypes = [
    { id: ProjectType.SupplyOnly, name: 'Supply Only' },
    { id: ProjectType.ProjectWithSupply, name: 'Project With Supply' },
    { id: ProjectType.ProjectsWithOutSupply, name: 'Projects With Out Supply' },
    { id: ProjectType.AMC, name: 'AMC' }
  ];

  statusOptions: string[] = ['Pending', 'In Progress', 'Completed', 'On Hold', 'Cancelled'];
  
  selectedProjectType = signal<ProjectType | undefined>(undefined);
  selectedStatus = signal<Array<ProjectStatus>>([]);
  selectedEngineer = signal<string>('');

  ngOnInit(): void {
    this.setupTableColumns();
    this.loadData();
  }

  setupTableColumns(): void {
    this.tableColumns = [
      {
        key: 'projectName',
        label: 'Project Name',
        type: 'text',
        sortable: true,
        filterable: true,
        filterType: 'text',
        filterPlaceholder: 'Search project...'
      },
      {
        key: 'assignedEngineer',
        label: 'Assigned Engineer',
        type: 'text',
        sortable: true,
        filterable: true,
        filterType: 'text',
        filterPlaceholder: 'Search engineer...',
        pipeParams: (item: Project) => `${item.assignedEngineer?.firstName} ${item.assignedEngineer?.lastName}`
      },
      {
        key: 'projectType',
        label: 'Project Type',
        type: 'text',
        filterable: true,
        filterType: 'select',
        filterOptions: this.projectTypes.map(type => ({ label: type.name, value: type.id }))
      },
      {
        key: 'jobId',
        label: 'Job ID',
        type: 'text',
        sortable: true,
        filterable: true,
        filterType: 'text',
        filterPlaceholder: 'Search job ID...'
      },
      {
        key: 'status',
        label: 'Status',
        type: 'status',
        headerClass: 'text-center',
        filterable: true,
        filterType: 'select',
        filterOptions: this.statusOptions.map(status => ({ label: status, value: status })),
        tooltip: true,
      },
      {
        key: 'allocatedDate',
        label: 'Allocated Date',
        type: 'date',
        pipeParams: 'dd/MM/yyyy',
        sortable: true,
        filterable: true,
        filterType: 'date'
      },
      {
        key: 'actions',
        label: 'Action',
        type: 'action',
        headerClass: '!text-center',
        actions: [
          {
            icon: 'heroEye',
            tooltip: 'View Details',
            action: 'viewProject',
            buttonClass: 'cursor-pointer text-center flex justify-center items-center gap-2 px-2 py-2 border border-gray-300 hover:border-gray-500 text-sm rounded-full font-medium'
          },
          {
            icon: 'heroPencilSquare',
            tooltip: 'Edit Project',
            action: 'editProject',
            buttonClass: 'cursor-pointer text-center flex justify-center items-center gap-2 px-2 py-2 border border-gray-300 hover:border-gray-500 text-sm rounded-full font-medium',
            condition: (item) => item.status !== ProjectStatus.Completed
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
      'projectName', 'assignedEngineer', 'projectType', 'jobId', 'status', 'allocatedDate', 'actions'
    ];
  }

  loadData(filters?: Partial<FilterParams>): void {
    this.isLoading.set(true);
    const paginationState = this.paginationService.paginationState();
    
    // Combine existing filters with new filters
    const filterParams: FilterParams = {
      page: paginationState.page,
      row: paginationState.row,
      projectType: this.selectedProjectType(),
      status: this.selectedStatus(),
      assignedEngineer: this.selectedEngineer(),
      ...filters
    };

    this.projectService.getProjects(filterParams).subscribe({
      next: (response) => {
        this.tableData.set(response.data.projects);
        this.totalItems.set(response.data.pagination.total);
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

    // Convert filters to backend format
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
      case 'viewProject':
        this.viewProjectDetails(item);
        break;
      case 'editProject':
        this.editProject(item);
        break;
      case 'deleteProject':
        this.deleteProject(item);
        break;
    }
  }

  viewProjectDetails(project: Project): void {
    this.router.navigate(['/projects', project._id]);
  }

  editProject(project: Project): void {
    this.router.navigate(['/projects', 'edit', project._id]);
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
    this.router.navigate(['/technical/projects', 'add']);
  }

  onRowClick(row: Project): void {
    this.viewProjectDetails(row);
  }
}
