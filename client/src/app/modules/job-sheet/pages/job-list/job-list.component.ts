import { HttpEventType } from '@angular/common/http';
import { Component } from '@angular/core';
import { MatTableDataSource, MatTable, MatColumnDef, MatHeaderCellDef, MatCellDef, MatCell, MatHeaderRowDef, MatHeaderRow, MatRowDef, MatRow } from '@angular/material/table';
import { BehaviorSubject, Observable, Subscription, catchError, tap, throwError } from 'rxjs';
import { JobService } from 'src/app/core/services/job/job.service';
import { JobStatus, JobTable, allocateStatus, getJob } from 'src/app/shared/interfaces/job.interface';
import { saveAs } from 'file-saver'
import { ToastrService } from 'ngx-toastr';
import { MatDialog } from '@angular/material/dialog';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { FormBuilder, FormControl, FormsModule } from '@angular/forms';
import { GeneratePdfReport } from 'src/app/core/services/generateReport.service';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { ApproveDealComponent } from 'src/app/modules/deal-sheet/approve-deal/approve-deal.component';
import { getQuotatation, Quotatation } from 'src/app/shared/interfaces/quotation.interface';
import { QuotationService } from 'src/app/core/services/quotation/quotation.service';
import { QuotationPreviewComponent } from 'src/app/shared/components/quotation-preview/quotation-preview.component';
import { LoadingBarService } from '@ngx-loading-bar/core';
import { getCreators } from 'src/app/shared/interfaces/employee.interface';
import { NumberFormatterPipe } from 'src/app/shared/pipes/numFormatter.pipe';
import * as pdfMake from 'pdfmake/build/pdfmake';
import { ViewCommentComponent } from 'src/app/modules/assigned-jobs/pages/view-comment/view-comment.component';
import { ActivatedRoute, Router } from '@angular/router';
import { NgIf, NgFor, AsyncPipe } from '@angular/common';
import { NgIcon } from '@ng-icons/core';
import { MatMenuTrigger, MatMenu } from '@angular/material/menu';
import { GenerateReportComponent } from '../../../../shared/components/generate-report/generate-report.component';
import { NgSelectComponent, NgOptionComponent } from '@ng-select/ng-select';
import { SkeltonLoadingComponent } from '../../../../shared/components/skelton-loading/skelton-loading.component';
import { MatTooltip } from '@angular/material/tooltip';
import { MatProgressBar } from '@angular/material/progress-bar';
import { PaginationComponent } from '../../../../shared/components/pagination/pagination.component';
import { NumberFormatterPipe as NumberFormatterPipe_1 } from '../../../../shared/pipes/numFormatter.pipe';

@Component({
  selector: 'app-job-list',
  templateUrl: './job-list.component.html',
  styleUrls: ['./job-list.component.css'],
  providers: [NumberFormatterPipe],
  imports: [NgIf, NgIcon, MatMenuTrigger, MatMenu, GenerateReportComponent, FormsModule, NgSelectComponent, NgFor, NgOptionComponent, SkeltonLoadingComponent, MatTable, MatColumnDef, MatHeaderCellDef, MatCellDef, MatCell, MatTooltip, MatProgressBar, MatHeaderRowDef, MatHeaderRow, MatRowDef, MatRow, PaginationComponent, AsyncPipe, NumberFormatterPipe_1]
})
export class JobListComponent {

  selectedDateFormat: string = "monthly";
  selectedEmployee: string | null = null;
  selectedFile!: string | undefined;
  progress: number = 0
  reportDate: string = '';
  searchQuery: string = '';

  isEnter: boolean = false;
  lastStatus!: JobStatus;
  jobStatuses = Object.values(JobStatus);
  employees$!: Observable<getCreators[]>;

  totalLpoValue: number = 0;
  total: number = 0;
  page: number = 1;
  row: number = 10;

  private subject = new BehaviorSubject<{ page: number, row: number }>({ page: this.page, row: this.row });

  jobId: string | null = null

  dataSource = new MatTableDataSource<getJob>()
  filteredData = new MatTableDataSource<getJob>()

  isLoading: boolean = true;
  isEmpty: boolean = false;
  isDeleteOption: boolean = false;
  loader = this.loadingBar.useRef();

  private subscriptions = new Subscription();


  constructor(private _jobService: JobService,
    private toast: ToastrService,
    private _dialog: MatDialog,
    private _fb: FormBuilder,
    private _generatePdfSerive: GeneratePdfReport,
    private _employeeService: EmployeeService,
    private _quotationService: QuotationService,
    private loadingBar: LoadingBarService,
    private router: Router,
    private route: ActivatedRoute,
    private purchaseService: PurchaseService,
  ) { }


  ngOnInit() {
    this.employees$ = this._jobService.getJobSalesPerson();
    const currentYear = new Date().getFullYear().toString();
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const currentMonthIndex = new Date().getMonth();
    const currentMonthName = monthNames[currentMonthIndex];

    this.reportDate = `${currentMonthName} - ${currentYear}`;

    // Read URL parameters
    this.route.queryParams.subscribe(params => {
      this.page = params['page'] ? parseInt(params['page']) : 1;
      this.row = params['row'] ? parseInt(params['row']) : 10;
      this.searchQuery = params['search'] || '';
      this.selectedEmployee = params['employee'] || null;
      this.selectedStatus = params['status'] ? params['status'] : null;

      // Update subject with the values from URL
      this.subject.next({ page: this.page, row: this.row });

      // If any filter is applied from URL, update the isEnter flag
      if (this.searchQuery) {
        this.isEnter = true;
      }
    });

    this.subscriptions.add(
      this.subject.subscribe((data) => {
        this.page = data.page;
        this.row = data.row;
        // Update URL parameters for pagination
        this.updateUrlParams();
        this.getAllJobs(currentMonthIndex + 1, currentYear);
      })
    );

    this.subscriptions.add(
      this._employeeService.employeeData$.subscribe((employee) => {
        if (employee?.category.role == 'superAdmin') {
          this.isDeleteOption = true;
        }
      })
    );
  }

  selectedStatus!: number | null;

  formData = this._fb.group({
    fromDate: new FormControl(),
    toDate: new FormControl(),
  });

  status: { value: string }[] = [
    { value: 'Work In Progress' },
    { value: 'Delivered' },
    { value: 'Partially Delivered' },
    { value: 'Completed' },
    { value: 'Cancelled' },
    { value: 'On Hold' },
    { value: 'Invoiced' }
  ];

  // Update URL parameters with current filter and pagination state
  updateUrlParams() {
    const queryParams: any = {};

    if (this.page !== 1) queryParams.page = this.page;
    if (this.row !== 10) queryParams.row = this.row;
    queryParams.search = this.searchQuery ? this.searchQuery : null;
    queryParams.employee = this.selectedEmployee;
    queryParams.status = this.selectedStatus;

    // Navigate with the updated query parameters without reloading the page
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: queryParams,
      queryParamsHandling: 'merge', // preserve other query params
      replaceUrl: true // don't add to browser history for every filter change
    });
  }

  onfilterApplied() {
    this.page = 1
    this.updateUrlParams();
    this.getAllJobs();
  }

  ngModelChange() {
    if (this.searchQuery == '' && this.isEnter) {
      this.page = 1;
      this.onSearch();
      this.isEnter = !this.isEnter;
    }
  }

  onSearch() {
    this.isEnter = true;
    this.isLoading = true;
    this.page = 1
    this.updateUrlParams();
    this.getAllJobs();
  }

  displayedColumns: string[] = ['jobId', 'customerName', 'description', 'salesPersonName', 'department', 'quotations', 'dealSheet', 'comment', 'lpo', 'lpoValue', 'status', 'action'];

  getAllJobs(selectedMonth?: number, selectedYear?: string) {
    this.isLoading = true;

    let access;
    let userId;
    this._employeeService.employeeData$.subscribe((employee) => {
      access = employee?.category.privileges.jobSheet.viewReport;
      userId = employee?._id;
    });

    let filterData = {
      search: this.searchQuery,
      page: this.page,
      row: this.row,
      salesPerson: this.selectedEmployee,
      status: this.selectedStatus as number,
      selectedMonth: selectedMonth,
      selectedYear: selectedYear as unknown as number,
      access: access,
      userId: userId,
      allocateStatus: allocateStatus.Pending
    };

    this.subscriptions.add(
      this._jobService.getJobs(filterData).subscribe({
        next: (data: JobTable) => {
          this.dataSource.data = [...data.job];
          this.filteredData.data = data.job;
          this.total = data.total;
          this.totalLpoValue = data.totalLpo;
          this.isEmpty = false;
          this.isLoading = false;
        },
        error: ((error) => {
          if (error.status == 504) this.jobId = '000';
          this.dataSource.data = [];
          this.isLoading = false;
          this.isEmpty = true;
        })
      })
    );
  }

  handleNotClose(event: MouseEvent) {
    event.stopPropagation();
  }

  onDownloadClicks(file: any) {
    this.selectedFile = file.fileName;
    this.subscriptions.add(
      this._jobService.downloadFile(file.fileName)
        .subscribe({
          next: (event) => {
            if (event.type === HttpEventType.DownloadProgress) {
              this.progress = Math.round(100 * event.loaded / event.total);
            } else if (event.type === HttpEventType.Response) {
              const fileContent: Blob = new Blob([event['body']]);
              saveAs(fileContent, file.originalname);
              this.clearProgress();
            }
          },
          error: (error) => {
            if (error.status == 404) {
              this.selectedFile = undefined;
              this.toast.warning('Sorry, The requested file was not found on the server. Please ensure that the file exists and try again.');
            }
          }
        })
    );
  }

  clearProgress() {
    setTimeout(() => {
      this.selectedFile = undefined;
      this.progress = 0;
    }, 1000);
  }

  onGenerateReport() {
    this.getAllJobs();
  }

  onViewDealSheet(quoteData: Quotatation, salesPerson: any, customer: any) {
    quoteData.createdBy = salesPerson;
    quoteData.client = customer;
    let priceDetails = {
      totalSellingPrice: 0,
      totalCost: 0,
      profit: 0,
      perc: 0
    };

    const quoteItems = quoteData.dealData.updatedItems.map((item) => {
      let itemSelected = 0;

      item.itemDetails.map((itemDetail) => {
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

    quoteData.dealData.additionalCosts.forEach((cost, i: number) => {
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

    priceDetails.profit = priceDetails.totalSellingPrice - priceDetails.totalCost;
    priceDetails.perc = (priceDetails.profit / priceDetails.totalSellingPrice) * 100;

    this._dialog.open(ApproveDealComponent,
      {
        data: { approval: false, quoteData, quoteItems, priceDetails },
        width: '1200x'
      });
  }

  onViewPDF(file: any) {
    // Check if the file is a PDF
    if (file.fileName && file.fileName.toLowerCase().endsWith('.pdf')) {
      this.subscriptions.add(
        this._jobService.downloadFile(file.fileName)
          .subscribe({
            next: (event) => {
              if (event.type === HttpEventType.Response) {
                const fileContent: Blob = new Blob([event['body']], { type: 'application/pdf' });

                // Create an object URL for the PDF blob
                const fileURL = URL.createObjectURL(fileContent);

                // Open the PDF in a new tab
                window.open(fileURL, '_blank');

                // Optionally revoke the object URL after some time
                setTimeout(() => {
                  URL.revokeObjectURL(fileURL);
                }, 10000);
              }
            },
            error: (error) => {
              if (error.status === 404) {
                this.toast.warning('Sorry, The requested file was not found on the server. Please ensure that the file exists and try again.');
              } else {
                this.toast.error('An error occurred while trying to view the PDF. Please try again later.');
              }
            }
          })
      );
    } else {
      // If the file is not a PDF, show a toaster notification
      this.toast.warning('This file type is not supported for viewing. Please download and view the file.');
    }
  }

  onPreviewPdf(quotedData: getQuotatation, salesPerson: any, customer: any, attention: any) {
    this.loader.start();
    quotedData.createdBy = salesPerson;
    quotedData.client = customer;
    quotedData.attention = attention;
    let quoteData: getQuotatation = quotedData;
    const pdfDoc = this._quotationService.generatePDF(quoteData, true);
    pdfDoc.then((pdf) => {
      pdf.getBlob((blob: Blob) => {
        let url = window.URL.createObjectURL(blob);

        let dialogRef = this._dialog.open(QuotationPreviewComponent,
          { data: { url: url, formatedQuote: quoteData } });
      });
    });
    this.loader.complete();
  }

  onStatus(event: Event, status: JobStatus) {
    event.stopPropagation();
    this.lastStatus = status;
  }

  updateStatus(i: number, jobId: string, status: JobStatus) {
    this.dataSource.data[i].status = this.lastStatus;
    this.filteredData.data[i].status = this.lastStatus;

    const dialogRef = this._dialog.open(ConfirmationDialogComponent,
      {
        data: {
          title: `Are you absolutely sure?`,
          description: `This action cannot be undone. This will permanently change the status to ${status}.`,
          icon: 'heroExclamationCircle',
          IconColor: 'orange'
        }
      });

    dialogRef.afterClosed().subscribe((approved: boolean) => {
      if (approved) {
        this._jobService.updateJobStatus(jobId, status).subscribe((res: JobStatus) => {
          this.dataSource.data[i].status = res;
          this.filteredData.data[i].status = res;
        });
      }
    });
  }

  generatePdf(dateRange: { selectedMonth?: number, selectedYear: number, selectedMonthName?: string, download: boolean }) {
    if (dateRange.selectedMonth && dateRange.selectedYear) {
      this.reportDate = `${dateRange.selectedMonthName} - ${dateRange.selectedYear}`;
      this.getJobsForPdf(dateRange.selectedMonth, dateRange.selectedYear).subscribe(() => {
        if (dateRange.download) {
          this.generatePdfAfterDataFetch();
        }
      });
    } else {
      this.reportDate = `${dateRange.selectedYear}`;
      this.getJobsForPdf(undefined, dateRange.selectedYear).subscribe(() => {
        if (dateRange.download) {
          this.generatePdfAfterDataFetch();
        }
      });
    }
  }

  getJobsForPdf(selectedMonth?: number, selectedYear?: number): Observable<JobTable> {
    this.isLoading = true;
    let access;
    let userId;
    this._employeeService.employeeData$.subscribe((employee) => {
      access = employee?.category.privileges.jobSheet.viewReport;
      userId = employee?._id;
    });

    let filterData = {
      search: this.searchQuery,
      page: this.page,
      row: this.row,
      status: this.selectedStatus as number,
      salesPerson: this.selectedEmployee,
      selectedMonth: selectedMonth,
      selectedYear: selectedYear,
      access: access,
      userId: userId
    };

    return this._jobService.getJobs(filterData).pipe(
      tap((data: JobTable) => {
        this.dataSource.data = [...data.job];
        this.filteredData.data = data.job;
        this.totalLpoValue = data.totalLpo;
        this.total = data.total;
        this.isEmpty = false;
        this.isLoading = false;
      }),
      catchError((error) => {
        if (error.status == 504) {
          this.jobId = '000';
        }
        this.dataSource.data = [];
        this.isLoading = false;
        this.isEmpty = true;
        return throwError(error);
      })
    );
  }

  generatePdfAfterDataFetch() {
    if (!this.isEmpty) {
      const tableHeader: string[] = ['JobId', 'Customer', 'Description', 'Sales Person', 'Department', 'Quote', 'Deal', 'LPO Val.', 'Status'];
      const tableData = this.dataSource.data.map((data: any) => {
        return [
          data.jobId,
          data.clientDetails.companyName,
          data.quotation.subject,
          `${data.salesPersonDetails[0].firstName} ${data.salesPersonDetails[0].lastName}`,
          data.departmentDetails[0].departmentName,
          data.quotation.quoteId,
          data.quotation.dealData.dealId,
          `${data.lpoValue.toFixed(2)} QAR`,
          data.status
        ];
      });
      const width = ['auto', '*', '*', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto'];
      this._generatePdfSerive.generatePdf('Job Report', this.reportDate, tableData, tableHeader, width);
    } else {
      this.toast.warning('No Data to generate Report');
    }
  }

  onViewComment(comment: string) {
    this._dialog.open(ViewCommentComponent, {
      width: '500px',
      data: { comment }
    });
  }

  onRemoveReport() {
    this.reportDate = '';
    this.getAllJobs();
  }

  formatNumber(value: any, minimumFractionDigits: number = 2, maximumFractionDigits: number = 2): string {
    if (isNaN(value)) {
      return '';
    }

    return parseFloat(value).toLocaleString('en-US', {
      minimumFractionDigits,
      maximumFractionDigits
    });
  }

  clearFilter() {
    this.searchQuery = ''; // Clear the search query
    this.selectedEmployee = null; // Reset selected employee
    this.selectedStatus = null; // Reset selected status

    // Reset pagination
    this.page = 1;
    this.row = 10;
    this.subject.next({ page: this.page, row: this.row });

    // Update URL to clear parameters
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {},
      replaceUrl: true
    });

    // Apply filters (which will now be the default values)
    this.onfilterApplied();
  }

  onPageNumberClick(event: { page: number, row: number }) {
    this.subject.next(event);
  }

  openAllocateTypeSelecter(data: getJob) {
    const dialogRef = this._dialog.open(AllocateTypeModalComponent, {
      data: data,
      width: '500px',
      disableClose: true
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.handleAllocationTypeSelection(result.id, result.jobId, result.allocationType);
      } else {
        // User cancelled or closed dialog without selection
        console.log('Dialog was cancelled');
      }
    });
  }

  // Optional: Create a separate method to handle the selection
  private handleAllocationTypeSelection(id: string, jobId: string, allocationType: allocateType): void {
    const data = {
      id,
      jobId,
      allocationType
    };

    this._jobService.updateAllocateType(data as any).subscribe({
      next: (res) => {
        if (res.success) {
          this.toast.success('Job Allocated successfully');
          this.getAllJobs()

        }
      },
      error: (err) => {
        console.error('Update failed:', err);
        // Optionally show error toast/message
      },
    });
  }


  onDeleteJob(jobId: string) {
    const employee = this._employeeService.employeeToken();
    const dialogRef = this._dialog.open(ConfirmationDialogComponent, {
      data: {
        title: 'Delete Job',
        description: 'Are you sure you want to delete this job? This action cannot be undone.',
        icon: 'heroExclamationTriangle',
        IconColor: 'red'
      }
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this._jobService.deleteJob({ dataId: jobId, employeeId: employee.id }).subscribe({
          next: () => {
            this.toast.success('Job deleted successfully');
            this.getAllJobs();
          },
          error: (error) => {
            this.toast.error('Failed to delete job');
          }
        });
      }
    });
  }

  purchaseRequest(jobId: string) {
    const jobData = this.dataSource.data.find((data) => data._id == jobId)
    if (jobData) {
      this.purchaseService.setPurchaseJob(jobData)
      this.router.navigate(['/purchase/create'])
    }
  }

  onMrRequestClicks() {
    this._dialog.open(MrRequestComponent, {
      width: '550px'
    })
  }
}