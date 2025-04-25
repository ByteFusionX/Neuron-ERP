import { ChangeDetectorRef, Component, ViewChild } from '@angular/core';
import { FormBuilder, FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatTableDataSource, MatTable, MatColumnDef, MatHeaderCellDef, MatCellDef, MatCell, MatHeaderRowDef, MatHeaderRow, MatRowDef, MatRow } from '@angular/material/table';
import { NavigationExtras, Router, ActivatedRoute, RouterLink } from '@angular/router';
import { QuotationService } from 'src/app/core/services/quotation/quotation.service';
import { ContactDetail, getCustomer } from 'src/app/shared/interfaces/customer.interface';
import { getDepartment } from 'src/app/shared/interfaces/department.interface';
import { getEmployee } from 'src/app/shared/interfaces/employee.interface';
import { dealData, getQuotation, Quotatation, quotatationForm, QuoteStatus } from 'src/app/shared/interfaces/quotation.interface';
import { UploadLpoComponent } from '../upload-lpo/upload-lpo.component';
import { BehaviorSubject, Observable, Subscription } from 'rxjs';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { CustomerService } from 'src/app/core/services/customer/customer.service';
import { ProfileService } from 'src/app/core/services/profile/profile.service';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { MatMenuTrigger, MatMenu, MatMenuItem } from '@angular/material/menu';
import { LoadingBarService } from '@ngx-loading-bar/core';
import { DealFormComponent } from '../deal-form/deal-form.component';
import { ViewLpoComponent } from '../view-lpo/view-lpo.component';
import { ViewReportComponent } from '../view-report/view-report.component';
import { ApproveDealComponent } from 'src/app/modules/deal-sheet/approve-deal/approve-deal.component';
import * as ExcelJS from 'exceljs';
import * as FileSaver from 'file-saver';
import { DatePipe, NgIf, NgFor, NgSwitch, NgSwitchCase, NgSwitchDefault, AsyncPipe, TitleCasePipe } from '@angular/common';
import { NumberFormatterPipe } from 'src/app/shared/pipes/numFormatter.pipe';
import { ToastrService } from 'ngx-toastr';
import { EventsListComponent } from 'src/app/shared/components/events-list/events-list.component';
import { NgIcon } from '@ng-icons/core';
import { dateFutureDirective } from '../../../../shared/directives/date-future.directive';
import { NgSelectComponent, NgOptionComponent } from '@ng-select/ng-select';
import { SkeltonLoadingComponent } from '../../../../shared/components/skelton-loading/skelton-loading.component';
import { MatTooltip } from '@angular/material/tooltip';
import { PaginationComponent } from '../../../../shared/components/pagination/pagination.component';
import { NumberFormatterPipe as NumberFormatterPipe_1 } from '../../../../shared/pipes/numFormatter.pipe';

@Component({
    selector: 'app-quotation-list',
    templateUrl: './quotation-list.component.html',
    styleUrls: ['./quotation-list.component.css'],
    providers: [NumberFormatterPipe,DatePipe],
    imports: [MatMenuTrigger, NgIcon, MatMenu, MatMenuItem, FormsModule, ReactiveFormsModule, dateFutureDirective, NgIf, NgSelectComponent, NgFor, NgOptionComponent, RouterLink, SkeltonLoadingComponent, MatTable, MatColumnDef, MatHeaderCellDef, MatCellDef, MatCell, NgSwitch, NgSwitchCase, NgSwitchDefault, MatTooltip, MatHeaderRowDef, MatHeaderRow, MatRowDef, MatRow, PaginationComponent, AsyncPipe, TitleCasePipe, DatePipe, NumberFormatterPipe_1]
})
export class QuotationListComponent {
  customers$!: Observable<getCustomer[]>;
  salesPerson$!: Observable<getEmployee[]>;
  departments$!: Observable<getDepartment[]>;

  isLoading: boolean = true;
  isEmpty: boolean = false;
  isFiltered: boolean = false;
  isEnter: boolean = false;
  isSuperAdmin: boolean = false;
  lastStatus!: QuoteStatus;
  createQuotation: boolean | undefined = false;
  loader = this.loadingBar.useRef();
  searchQuery: string = '';
  userId: string | undefined = ''

  isEventClicked: boolean = false

  quoteStatuses = Object.values(QuoteStatus);
  dealStatuses = ['pending','approved','rejected'];
  displayedColumns: string[] = ['date', 'quoteId', 'customerName', 'description', 'salesPerson', 'department', 'totalCost', 'status', 'dealStatus', 'events', 'action'];

  dataSource = new MatTableDataSource<Quotatation>()
  filteredData = new MatTableDataSource<Quotatation>()

  total: number = 0;
  page: number = 1;
  row: number = 10;
  fromDate: string | null = null
  toDate: string | null = null
  selectedCustomer: string | null = null;
  selectedSalesPerson: string | null = null;
  selectedDepartment: string | null = null;
  selectedQuoteStatus: string | null = null;
  selectedDealStatus: string | null = null;

  private subscriptions = new Subscription();
  private subject = new BehaviorSubject<{ page: number, row: number }>({ page: this.page, row: this.row });

  constructor(
    private _fb: FormBuilder,
    private _quoteService: QuotationService,
    private _router: Router,
    private _route: ActivatedRoute,
    private _dialog: MatDialog,
    private _employeeService: EmployeeService,
    private _customerService: CustomerService,
    private _departetmentService: ProfileService,
    private loadingBar: LoadingBarService,
    private datePipe: DatePipe,
    private numberFormat: NumberFormatterPipe,
    private toaster: ToastrService
  ) { }

  formData = this._fb.group({
    fromDate: [new FormControl()],
    toDate: [new FormControl()],
  })

  ngOnInit() {
    this.checkPermission();
    this.salesPerson$ = this._employeeService.getAllEmployees();
    this.departments$ = this._departetmentService.getDepartments();

    // Read URL parameters and initialize filters
    this._route.queryParams.subscribe(params => {
      this.page = params['page'] ? parseInt(params['page']) : 1;
      this.row = params['row'] ? parseInt(params['row']) : 10;
      this.searchQuery = params['search'] || '';
      this.fromDate = params['fromDate'] || null;
      this.toDate = params['toDate'] || null;
      this.selectedCustomer = params['customer'] || null;
      this.selectedSalesPerson = params['salesPerson'] || null;
      this.selectedDepartment = params['department'] || null;
      this.selectedQuoteStatus = params['quoteStatus'] || null;
      this.selectedDealStatus = params['dealStatus'] || null;

      // Update form data if dates exist in URL
      if (this.fromDate) {
        this.formData.controls.fromDate.setValue(this.fromDate);
      }
      if (this.toDate) {
        this.formData.controls.toDate.setValue(this.toDate);
      }

      // Set isFiltered flag if any filter is applied
      this.isFiltered = !!(this.searchQuery || this.fromDate || this.toDate || 
                         this.selectedCustomer || this.selectedSalesPerson || 
                         this.selectedDepartment || this.selectedQuoteStatus || 
                         this.selectedDealStatus);

      // Initialize the BehaviorSubject with the current page and row
      this.subject.next({ page: this.page, row: this.row });
    });

    this.subscriptions.add(
      this.subject.subscribe((data) => {
        this.page = data.page;
        this.row = data.row;
        this.getQuotations();
        this.updateUrlParams();
      })
    );

    this.customers$ = this._customerService.getAllCustomers(this.userId);
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  ngModelChange() {
    if (this.searchQuery == '' && this.isEnter) {
      this.onSearch();
      this.isEnter = !this.isEnter;
    }
  }

  onSearch() {
    this.isEnter = true;
    this.isLoading = true;
    this.page = 1; // Reset to first page when searching
    this.getQuotations();
    this.updateUrlParams();
  }

  // Update URL parameters without reloading the page
  updateUrlParams() {
    const queryParams: any = {};
    
    // Add pagination params
    if (this.page !== 1) queryParams.page = this.page;
    if (this.row !== 10) queryParams.row = this.row;
    
    // Add filter params (only if they have values)
    queryParams.search = this.searchQuery ? this.searchQuery : null;
    if (this.fromDate) queryParams.fromDate = this.fromDate;
    if (this.toDate) queryParams.toDate = this.toDate;
    queryParams.customer = this.selectedCustomer;
    queryParams.salesPerson = this.selectedSalesPerson;
    queryParams.department = this.selectedDepartment;
    queryParams.quoteStatus = this.selectedQuoteStatus;
    queryParams.dealStatus = this.selectedDealStatus;
    
    // Update URL without reloading the page
    this._router.navigate([], {
      relativeTo: this._route,
      queryParams: queryParams,
      queryParamsHandling: 'merge', // Keep existing query params
      replaceUrl: true // Replace the current URL in browser history
    });
  }

  getQuotations() {
    this.isLoading = true;
    let access;
    let userId;
    this._employeeService.employeeData$.subscribe((employee) => {
      access = employee?.category.privileges.quotation.viewReport;
      userId = employee?._id;
      this.userId = userId;
    });

    let filterData = {
      search: this.searchQuery,
      page: this.page,
      row: this.row,
      salesPerson: this.selectedSalesPerson,
      customer: this.selectedCustomer,
      fromDate: this.fromDate,
      toDate: this.toDate,
      department: this.selectedDepartment,
      quoteStatus: this.selectedQuoteStatus,
      dealStatus: this.selectedDealStatus,
      access: access,
      userId: userId
    };

    this.subscriptions.add(
      this._quoteService.getQuotation(filterData)
        .subscribe((data: getQuotation) => {
          if (data) {
            this.dataSource.data = [...data.quotations];
            this.filteredData.data = data.quotations;
            this.total = data.total;
            this.isEmpty = false;
          } else {
            this.dataSource.data = [];
            this.isEmpty = true;
          }
          this.isLoading = false;
        })
    );
  }

  onRowClicks(index: number) {
    let data = this.dataSource.data[index];
    const navigationExtras: NavigationExtras = {
      state: data
    };

    this._router.navigate(['/quotations/view'], navigationExtras);
  }

  onQuoteEdit(data: quotatationForm, event: Event) {
    event.stopPropagation();
    let quoteData = data;

    const navigationExtras: NavigationExtras = {
      state: quoteData
    };

    this._router.navigate(['/quotations/edit'], navigationExtras);
  }

  handleNotClose(event: MouseEvent) {
    event.stopPropagation();
  }

  onClear() {
    this.isFiltered = false;
    this.searchQuery = '';  
    this.fromDate = null;
    this.toDate = null;
    this.selectedCustomer = null;
    this.selectedSalesPerson = null;
    this.selectedDepartment = null;
    this.selectedQuoteStatus = null;
    this.selectedDealStatus = null;
    this.formData.reset();
    this.page = 1; 
    this.getQuotations();
    
    this._router.navigate([], {
      relativeTo: this._route,
      queryParams: {}, 
      replaceUrl: true
    });
  }

  onSubmit() {
    this.fromDate = null;
    this.toDate = null;
    let from = this.formData.controls.fromDate.value;
    let to = this.formData.controls.toDate.value;
    const current = new Date();
    const today = current.toISOString().split('T')[0];
    if (from <= to && to <= today && from.length && to.length) {
      this.fromDate = from;
      this.toDate = to;
    }
    this.isFiltered = true;
    this.page = 1; // Reset to first page when applying new filters
    this.getQuotations();
    this.updateUrlParams();
  }

  onStatus(event: Event, status: QuoteStatus) {
    event.stopPropagation();
    this.lastStatus = status;
  }

  preventClick(event: Event) {
    event.stopPropagation();
  }

  updateStatus(i: number, quoteId: string, status: QuoteStatus) {
    this.dataSource.data[i].status = this.lastStatus;
    this.filteredData.data[i].status = this.lastStatus;

    const dialogRef = this._dialog.open(ConfirmationDialogComponent,
      {
        data: {
          title: `Are you absolutely sure?`,
          description: `Please note that the status will be updated to ${status} ${this.lastStatus === 'Won' ? '. This will remove the deal data and LPO files' : ''}. The change will be reflected in the reports accordingly.`,
          icon: 'heroExclamationCircle',
          IconColor: 'orange'
        }
      });

    dialogRef.afterClosed().subscribe((approved: boolean) => {
      if (approved) {
        this._quoteService.updateQuoteStatus(quoteId, status).subscribe((res: QuoteStatus) => {
          this.dataSource.data[i].status = res;
          this.filteredData.data[i].status = res;
        });
      }
    });
  }

  onPreviewDeal(approval: boolean, quoteData: Quotatation, event: Event, index: number) {
    event.stopPropagation();
    let priceDetails = {
      totalSellingPrice: 0,
      totalCost: 0,
      profit: 0,
      perc: 0,
    };

    const quoteItems = quoteData.dealData.updatedItems.map((item) => {
      let itemSelected = 0;

      item.itemDetails.map((itemDetail) => {
        if (itemDetail.dealSelected) {
          itemSelected++;
          priceDetails.totalSellingPrice += itemDetail.unitSellingPrice * itemDetail.quantity;
          priceDetails.totalCost += itemDetail.quantity * itemDetail.unitCost;
          return itemDetail;
        }
        return;
      });

      return item;
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

    const dialogRef = this._dialog.open(ApproveDealComponent,
      {
        data: { approval, quoteData, quoteItems, priceDetails, quoteView: true },
        width: '1200px'
      });

    dialogRef.afterClosed().subscribe((data: { updatedData?: Quotatation }) => {
      this.dataSource.data[index].dealData.seenedBySalsePerson = true;
      if (data?.updatedData) {
        this.dataSource.data[index].dealData = data.updatedData.dealData;
      }
      this.dataSource._updateChangeSubscription();
    });
  }

  onfilterApplied() {
    this.isFiltered = true;
    this.page = 1; // Reset to first page when applying filters
    this.getQuotations();
    this.updateUrlParams();
  }

  generateReport() {
    let access;
    let userId;
    this._employeeService.employeeData$.subscribe((employee) => {
      access = employee?.category.privileges.quotation.viewReport;
      userId = employee?._id;
    });

    let filterData = {
      salesPerson: this.selectedSalesPerson,
      customer: this.selectedCustomer,
      fromDate: this.fromDate,
      toDate: this.toDate,
      department: this.selectedDepartment,
      access: access,
      userId: userId
    };
    this._dialog.open(ViewReportComponent,
      {
        data: filterData,
        width: '768px'
      });
  }

  onClickLpo(data: Quotatation, event: Event) {
    event.stopPropagation();
    const lpoDialog = this._dialog.open(UploadLpoComponent, { data: data, width: '500px' });
    lpoDialog.afterClosed().subscribe((quote: Quotatation) => {
      if (quote) {
        this.loader.start();
        this.getQuotations();
        this.loader.complete();
      }
    });
  }

  onViewLpo(data: Quotatation, event: Event, index: number) {
    event.stopPropagation();
    this._dialog.open(ViewLpoComponent,
      {
        data: data
      }).afterClosed().subscribe((quote: Quotatation) => {
        if (quote) {
          this.dataSource.data[index].lpoFiles = quote.lpoFiles;
          this.dataSource._updateChangeSubscription();
        }
      });
  }

  onConvertToDealSheet(data: Quotatation, event: Event, index: number) {
    event.stopPropagation();
    const dialogRef = this._dialog.open(DealFormComponent,
      {
        data: data,
        width: '1600px'
      });

    dialogRef.afterClosed().subscribe((dealData: dealData) => {
      if (dealData) {
        this._quoteService.saveDealSheet(dealData, data._id).subscribe((res) => {
          this.dataSource.data[index].optionalItems = res.optionalItems;
          this.dataSource.data[index].dealData = res.dealData;
          this.dataSource._updateChangeSubscription();
        });
      }
    });
  }

  generateExcelReport() {
    this.loader.start();
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Quotations');

    // Adding headers
    worksheet.columns = [
      { header: 'Date', key: 'date', width: 15 },
      { header: 'Quote Id', key: 'quoteId', width: 20 },
      { header: 'Customer Name', key: 'customerName', width: 25 },
      { header: 'Description', key: 'description', width: 30 },
      { header: 'Sales Person', key: 'salesPerson', width: 25 },
      { header: 'Department', key: 'department', width: 20 },
      { header: 'Total Cost', key: 'totalCost', width: 15 },
      { header: 'Status', key: 'status', width: 15 },
      { header: 'Deal Status', key: 'dealStatus', width: 15 }
    ];

    let access;
    let userId;
    this._employeeService.employeeData$.subscribe((employee) => {
      access = employee?.category.privileges.quotation.viewReport;
      userId = employee?._id;
      this.userId = userId;
    });

    let filterData = {
      search: this.searchQuery,
      page: this.page,
      row: Number.MAX_SAFE_INTEGER,
      salesPerson: this.selectedSalesPerson,
      customer: this.selectedCustomer,
      fromDate: this.fromDate,
      toDate: this.toDate,
      department: this.selectedDepartment,
      quoteStatus: this.selectedQuoteStatus,
      dealStatus: this.selectedDealStatus,
      access: access,
      userId: userId
    };
    this.subscriptions.add(
      this._quoteService.getQuotation(filterData)
        .subscribe((data: getQuotation) => {
          if (data) {
            // Sort quotations by date
            data.quotations.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());

            data.quotations.forEach((element: any) => {
              worksheet.addRow({
                date: this.datePipe.transform(element.date, 'dd/MM/yyyy'),
                quoteId: element.quoteId,
                customerName: element.client.companyName,
                description: element.subject,
                salesPerson: element.createdBy.firstName + ' ' + element.createdBy.lastName,
                department: element.department.departmentName,
                totalCost: this.numberFormat.transform(this.calculateDiscoutPrice(element)) + ' ' + element.currency,
                status: element.status,
                dealStatus: element.dealData?.status || 'N/A'
              });
            });

            // Styling the header
            worksheet.getRow(1).font = { bold: true };

            // Generate & download Excel
            workbook.xlsx.writeBuffer().then((buffer: BlobPart) => {
              const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
              FileSaver.saveAs(blob, 'quotations_report.xlsx');
            });
          } else {
            this.toaster.warning('There is no quotation.');
          }
        })
    );
    this.loader.complete();
  }

  checkPermission() {
    this._employeeService.employeeData$.subscribe((data) => {
      this.createQuotation = data?.category.privileges.quotation.create;
      this.isSuperAdmin = data?.category.role === 'superAdmin';
    });
  }

  onPageNumberClick(event: { page: number, row: number }) {
    this.subject.next(event);
  }

  calculateTotalPrice(j: number, k: number, quoteData: Quotatation) {
    return quoteData.optionalItems[0].items[j].itemDetails[k].unitSellingPrice * quoteData.optionalItems[0].items[j].itemDetails[k].quantity;
  }

  calculateSellingPrice(quoteData: Quotatation): number {
    let totalCost = 0;
    quoteData.optionalItems[0].items.forEach((item, j) => {
      item.itemDetails.forEach((itemDetail, k) => {
        totalCost += this.calculateTotalPrice(j, k, quoteData);
      });
    });

    return totalCost;
  }

  calculateDiscoutPrice(quoteData: Quotatation): number {
    return this.calculateSellingPrice(quoteData) - quoteData.optionalItems[0].totalDiscount;
  }

  onEventClicks(enquiryId: string) {
    this.isEventClicked = true;
    const dialog = this._dialog.open(EventsListComponent, { data: { collectionId: enquiryId, from: 'Enquiry' }, width: '500px' });
    dialog.afterClosed().subscribe(() => {
      this.isEventClicked = false;
    });
  }
}