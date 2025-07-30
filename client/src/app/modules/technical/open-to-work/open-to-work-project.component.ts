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
import { JobService } from 'src/app/core/services/job/job.service';
import { ToastrService } from 'ngx-toastr';
import { Router } from '@angular/router';
import * as job_interface from 'src/app/shared/interfaces/job.interface';
import { PaginationService } from 'src/app/core/services/pagination.service';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { MatDialog } from '@angular/material/dialog';
import { QuotationService } from 'src/app/core/services/quotation/quotation.service';
import { QuotationPreviewComponent } from 'src/app/shared/components/quotation-preview/quotation-preview.component';
import { ApproveDealComponent } from 'src/app/modules/deal-sheet/approve-deal/approve-deal.component';
import { DialogModule } from 'primeng/dialog';
import { DropdownModule } from "primeng/dropdown";
import { TechnicalService } from 'src/app/core/services/technical.service';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { allocateType } from '../../job-sheet/pages/allocate-type-modal/allocate-type-modal.component';
import { ProfileService } from 'src/app/core/services/profile/profile.service';

interface FilterParams {
  [key: string]: any;
  page: number;
  row: number;
  assignedEngineer?: string;
  fromDate?: string;
  toDate?: string;
  search?: string;
}

@Component({
  selector: 'app-open-to-work-project',
  standalone: true,
  imports: [
    TableComponent,
    CommonModule,
    MatMenuModule,
    IconsModule,
    FormsModule,
    DropdownModule,
    ButtonComponent
  ],
  templateUrl: './open-to-work-project.component.html',
  styleUrls: ['./open-to-work-project.component.css'],
  providers: [PaginationService]
})
export class OpenToWorkProjectComponent implements OnInit {
  private jobService = inject(JobService);
  private profileService = inject(ProfileService);
  private notificationService = inject(ToastrService);
  private router = inject(Router);
  private dialog = inject(MatDialog);
  private paginationService = inject(PaginationService);
  private quotationService = inject(QuotationService);
  private technicalService = inject(TechnicalService);
  private _employeeService = inject(EmployeeService);

  tableData = signal<job_interface.getJob[]>([]);
  tableColumns: TableColumn[] = [
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
      key: 'clientDetails.companyName',
      label: 'Customer',
      type: 'text',
      sortable: true,
      filterable: true,
      filterType: 'text',
      filterPlaceholder: 'Search customer name...'
    },
    {
      key: 'quotation.subject',
      label: 'Description',
      type: 'text',
      filterable: true,
      filterType: 'text',
      filterPlaceholder: 'Search description...'
    },
    {
      key: 'salesPersonDetails',
      label: 'Sales Person',
      type: 'text',
      sortable: true,
      filterable: true,
      filterType: 'select',
      filterPlaceholder: 'Search sales person...',
      cellRenderer: (item: any) =>
        item?.salesPersonDetails && item.salesPersonDetails.length > 0
          ? `${item.salesPersonDetails[0].firstName} ${item.salesPersonDetails[0].lastName}`
          : ''
    },
    {
      key: 'departmentDetails',
      label: 'Department',
      type: 'text',
      sortable: true,
      filterable: true,
      filterType: 'select',
      filterPlaceholder: 'Search department...',
      // filterOptions: this.departmentOptions,
      cellRenderer: (item: any) =>
        item?.departmentDetails && item.departmentDetails.length > 0
          ? item.departmentDetails[0].departmentName
          : ''
    },
    {
      key: 'quotation.quoteId',
      label: 'Quotation',
      type: 'text',
      clickable: true,
      filterable: true,
      filterType: 'text',
      filterPlaceholder: 'Search quotation...',
      clickFunction: (item: any) => this.onPreviewPdf(item.quotation, item.salesPersonDetails?.[0], item.clientDetails, item.attention)
    },
    {
      key: 'quotation.dealData.dealId',
      label: 'Deal Sheet',
      type: 'text',
      clickable: true,
      filterable: true,
      filterType: 'text',
      filterPlaceholder: 'Search deal sheet...',
      clickFunction: (item: any) => this.onViewDealSheet(item.quotation, item.salesPersonDetails?.[0], item.clientDetails)
    },
    {
      key: 'allocateType',
      label: 'Scope',
      type: 'text',
      sortable: true,
      filterable: true,
      filterType: 'text',
      filterPlaceholder: 'Search scope...'
    },
    {
      key: 'assignEngineer',
      label: 'Assign to Engineer',
      type: 'action',
      actions: [
        {
          icon: 'heroUserPlus',
          tooltip: 'Assign to Engineer',
          action: 'assignEngineer',
          buttonClass: 'cursor-pointer text-center flex justify-center items-center gap-2 px-2 py-2 border border-gray-300 hover:border-gray-500 text-sm rounded-full font-medium'
        }
      ]
    }
  ];
  
  defaultColumns: string[] = [
    'jobId',
    'clientDetails.companyName',
    'quotation.subject',
    'salesPersonDetails',
    'departmentDetails',
    'quotation.quoteId',
    'quotation.dealData.dealId',
    'allocateType',
    'assignEngineer'
  ];

  isLoading = signal<boolean>(true);
  isEmpty = signal<boolean>(false);
  totalItems = signal<number>(0);
  showAssignEngineerModal = signal<boolean>(false);
  userId: any = '';
  selectedEngineer: any = '';
  selectedJobId: any = '';
  projectType:string = '';
  assignComment: string = '';
  assignEngineerJob: any = null;
  isAssignSubmitted = false;
  engineerOptions: { label: string, value: string }[] = [];
  priorityOptions: { label: string, value: string }[] = [
    { label: 'High', value: 'High' },
    { label: 'Medium', value: 'Medium' },
    { label: 'Low', value: 'Low' }
  ];
  selectedPriority: string = '';

  ngOnInit(): void {
    this.loadJobs();
    this.loadEngineers();
    this.loadOptions();
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

    console.log(filterParams)
    this.loadJobs(filterParams);
  }

  loadJobs(filters?: Partial<FilterParams>): void {
    this.isLoading.set(true);
    const paginationState = this.paginationService.paginationState();
    this._employeeService.employeeData$.subscribe((employee) => {
      // access = employee?.category.privileges.assignedJob.viewReport;
      this.userId = employee?._id;
    });

    const filterParams: FilterParams = {
      page: paginationState.page,
      row: paginationState.row,
      ...filters
    };


    this.jobService.getUnassignedToTechnical(filterParams).subscribe({
      next: (response) => {
        console.log(response);
        if(response && response.data && response.data.length){
          this.tableData.set(response.data);
          this.totalItems.set(response.total);
          this.isEmpty.set(false);
          this.isLoading.set(false);
        }else{
          this.tableData.set([]);
          this.totalItems.set(0);
          this.isLoading.set(false);
          this.isEmpty.set(true);
        }
      },
      error: (error) => {
        if (error.status === 204) {
          this.tableData.set([]);
          this.totalItems.set(0);
          this.isLoading.set(false);
          this.isEmpty.set(true);
        } else {
          this.notificationService.error('Failed to load jobs');
          this.isLoading.set(false);
          this.isEmpty.set(true);
        }
      }
    });
  }

  loadOptions(): void {
    this.jobService.getJobSalesPerson().subscribe({
      next: (response) => {
        if(response && response.length){
            this.tableColumns.find(column => column.key === 'salesPersonDetails')!.filterOptions = response.map((salesPerson: any) => ({
              label: salesPerson.fullName,
              value: salesPerson._id
            }));
        }
      }
    });

    this.profileService.getDepartments().subscribe({
      next: (response) => {
        this.tableColumns.find(column => column.key === 'departmentDetails')!.filterOptions = response.map((department: any) => ({
          label: department.departmentName,
          value: department._id
        }));
      }
    });
  }

  loadEngineers(): void {
    this.technicalService.getEngineers().subscribe({
      next: (response) => {
        this.engineerOptions = response.data.map((engineer: any) => ({
          label: `${engineer.firstName} ${engineer.lastName}`,
          value: engineer._id
        }));
      },
      error: (error) => {
        this.notificationService.error('Failed to load engineers');
      }
    });
  }

  addProject(): void {
    this.router.navigate(['/technical/project', 'add']);
  }

  onActionClick(event: { action: string; item: job_interface.getJob }): void {
    if (event.action === 'assignEngineer') {
      this.assignEngineerJob = event.item;
      this.selectedJobId = event.item._id;

      if(event.item.allocateType == allocateType.ProjectWithSupply){
        this.projectType = 'project' 
      }else if(event.item.allocateType == allocateType.AMC){
        this.projectType = 'amc'
      }
      this.showAssignEngineerModal.set(true);
      this.selectedEngineer = '';
      this.assignComment = '';
      this.isAssignSubmitted = false;
    }
  }

  closeAssignEngineerModal() {
    this.showAssignEngineerModal.set(false);
  }

  submitAssignEngineer() {
    if (this.selectedEngineer == '') {
      this.notificationService.error('Please select an engineer');
      return;
    } else {
      this.technicalService.assignEngineer({
        jobId: this.selectedJobId,
        engineerId: this.selectedEngineer,
        comment: this.assignComment,
        assignedBy: this.userId,
        projectType: this.projectType,
        customerId: this.assignEngineerJob.clientDetails._id,
        priority: this.selectedPriority
      }).subscribe({
        next: (response) => {
          this.notificationService.success('Assigned to Engineer: ' + this.selectedEngineer + ' for job: ' + this.assignEngineerJob.jobId);
          this.loadJobs();
        },
        error: (error) => {
          this.notificationService.error('Failed to assign engineer');
        }
      });
    }

    this.isAssignSubmitted = true;
    this.showAssignEngineerModal.set(false);
  }

  onPreviewPdf(quotedData: any, salesPerson: any, customer: any, attention: any) {
    console.log(quotedData, salesPerson, customer, attention);
    quotedData.createdBy = salesPerson;
    quotedData.client = customer;
    quotedData.attention = attention;
    const pdfDoc = this.quotationService.generatePDF(quotedData, true);
    pdfDoc.then((pdf: any) => {
      pdf.getBlob((blob: Blob) => {
        let url = window.URL.createObjectURL(blob);
        this.dialog.open(QuotationPreviewComponent, { data: { url: url, formatedQuote: quotedData } });
      });
    });
  }

  onViewDealSheet(quoteData: any, salesPerson: any, customer: any) {
    quoteData.createdBy = salesPerson;
    quoteData.client = customer;
    let priceDetails = {
      totalSellingPrice: 0,
      totalCost: 0,
      profit: 0,
      perc: 0
    };
    const quoteItems = quoteData.dealData.updatedItems.map((item: any) => {
      let itemSelected = 0;
      item.itemDetails.map((itemDetail: any) => {
        if (itemDetail.dealSelected) {
          itemSelected++;
          priceDetails.totalSellingPrice += itemDetail.unitCost / (1 - (itemDetail.profit / 100)) * itemDetail.quantity;
          priceDetails.totalCost += itemDetail.quantity * itemDetail.unitCost;
          return itemDetail;
        }
        return;
      });
      if (itemSelected) return item;
      return;
    });
    if (quoteData.dealData.additionalCosts) {
      quoteData.dealData.additionalCosts.forEach((cost: any) => {
        if (cost.type == 'Additional Cost') {
          priceDetails.totalCost += cost.value;
        } else if (cost.type === 'Supplier Discount') {
          priceDetails.totalCost -= cost.value;
        } else if (cost.type === 'Customer Discount') {
          priceDetails.totalSellingPrice -= cost.value;
        } else {
          priceDetails.totalCost += cost.value;
        }
      });
    }
    priceDetails.profit = priceDetails.totalSellingPrice - priceDetails.totalCost;
    priceDetails.perc = (priceDetails.profit / priceDetails.totalSellingPrice) * 100;
    this.dialog.open(ApproveDealComponent, {
      data: { approval: false, quoteData, quoteItems, priceDetails },
      width: '1200x'
    });
  }
}
