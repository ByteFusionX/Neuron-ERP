import { Component } from '@angular/core';
import { CreateCustomerDialog } from '../create-customer/create-customer.component';
import { getCustomer, getFilteredCustomer } from 'src/app/shared/interfaces/customer.interface';
import { MatTableDataSource, MatTable, MatColumnDef, MatHeaderCellDef, MatCellDef, MatCell, MatHeaderRowDef, MatHeaderRow, MatRowDef, MatRow } from '@angular/material/table';
import { CustomerService } from 'src/app/core/services/customer/customer.service';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { BehaviorSubject, Observable, share, Subscription } from 'rxjs';
import { getCreators, getEmployee } from 'src/app/shared/interfaces/employee.interface';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { MatDialog } from '@angular/material/dialog';
import { ShareTransferCustomerComponent } from '../share-transfer-customer/share-transfer-customer.component';
import { SharedWithListComponent } from '../shared-with-list/shared-with-list.component';
import { CustomerViewComponent, CustomerViewModalData } from '../customer-view/customer-view.component';
import { FormsModule } from '@angular/forms';
import { NgIcon } from '@ng-icons/core';
import { NgSelectComponent, NgOptionComponent } from '@ng-select/ng-select';
import { appNoLeadingSpace } from '../../../../shared/directives/trim-validator.directive';
import { NgFor, NgIf, AsyncPipe } from '@angular/common';
import { SkeltonLoadingComponent } from '../../../../shared/components/skelton-loading/skelton-loading.component';
import { MatTooltip } from '@angular/material/tooltip';
import { PaginationComponent } from '../../../../shared/components/pagination/pagination.component';

@Component({
    selector: 'app-customers-list',
    templateUrl: './customers-list.component.html',
    styleUrls: ['./customers-list.component.css'],
    imports: [FormsModule, NgIcon, NgSelectComponent, appNoLeadingSpace, NgFor, NgOptionComponent, NgIf, RouterLink, SkeltonLoadingComponent, MatTable, MatColumnDef, MatHeaderCellDef, MatCellDef, MatCell, MatTooltip, MatHeaderRowDef, MatHeaderRow, MatRowDef, MatRow, PaginationComponent, AsyncPipe]
})
export class CustomersListComponent {

  employees$!: Observable<getCreators[]>;
  userId: string | undefined;
  shareAccess: boolean | undefined = false;
  transferAccess: boolean | undefined = false;
  isLoading: boolean = true;
  isEmpty: boolean = false;
  isEnter: boolean = false;
  createCustomer: boolean | undefined = false;

  displayedColumns: string[] = ['position', 'clientRef', 'name', 'createdBy', 'department', 'share'];
  dataSource = new MatTableDataSource<getCustomer>()
  filteredData = new MatTableDataSource<getCustomer>()

  total: number = 0;
  page: number = 1;
  row: number = 10;
  selectedEmployee: string | null = null;
  searchQuery: string = '';

  private subscriptions = new Subscription();
  private subject = new BehaviorSubject<{ page: number, row: number }>({ page: this.page, row: this.row });

  constructor(
    private _customerService: CustomerService,
    private _router: Router,
    private _route: ActivatedRoute,
    private _employeeService: EmployeeService,
    private dialog: MatDialog
  ) { }

  ngOnInit() {
    this.checkPermission();
    this.employees$ = this._customerService.getCustomerCreators();
    
    // Read query parameters from URL
    this._route.queryParams.subscribe(params => {
      this.page = params['page'] ? parseInt(params['page']) : 1;
      this.row = params['row'] ? parseInt(params['row']) : 10;
      this.selectedEmployee = params['employee'] || null;
      this.searchQuery = params['search'] || '';
      
      // Update the subject with the new values
      this.subject.next({ page: this.page, row: this.row });
    });

    this.subscriptions.add(
      this.subject.subscribe((data) => {
        this.page = data.page;
        this.row = data.row;
        this.updateUrlParams();
        this.getAllCustomers();
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  preventClick(event: Event) {
    event.stopPropagation();
  }

  updateUrlParams() {
    // Update URL with current filter state without reloading the page
    const queryParams: any = {};
    
    if (this.page !== 1) queryParams.page = this.page;
    if (this.row !== 10) queryParams.row = this.row;
    queryParams.employee = this.selectedEmployee;
    queryParams.search = this.searchQuery ? this.searchQuery : null;


    this._router.navigate([], {
      relativeTo: this._route,
      queryParams: queryParams,
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
  }

  getAllCustomers() {
    this.isLoading = true;
    let access;
    let userId;
    this._employeeService.employeeData$.subscribe((employee) => {
      access = employee?.category.privileges.customer.viewReport;
      this.shareAccess = employee?.category.privileges.customer.share;
      this.transferAccess = employee?.category.privileges.customer.transfer;
      this.userId = employee?._id;
      userId = employee?._id;
    });

    let filterData = {
      page: this.page,
      row: this.row,
      createdBy: this.selectedEmployee,
      access: access,
      userId: userId,
      search: this.searchQuery,
    };

    this.subscriptions.add(
      this._customerService.getCustomers(filterData)
        .subscribe({
          next: (data: getFilteredCustomer) => {
            if (data) {
              this.dataSource.data = [...data.customers];
              this.filteredData.data = data.customers;
              this.total = data.total;
              this.isEmpty = false;
            } else {
              this.dataSource.data = [];
              this.isEmpty = true;
            }
            this.isLoading = false;
          },
          error: () => {
            this.isLoading = false;
          }
        })
    );
  }

  onfilterApplied() {
    this.page = 1; // Reset to first page when filter is applied
    this.updateUrlParams();
    this.getAllCustomers();
  }

  onShareOrTransfer(type: String, customerId: string, index: number) {
    const shareDialog = this.dialog.open(ShareTransferCustomerComponent, {
      data: {
        type: type,
        customerId: customerId
      },
      width: '500px'
    });

    shareDialog.afterClosed().subscribe((res) => {
      if (res) {
        this._customerService.shareOrTransferCustomer({
          customerId: customerId,
          employees: res.employees,
          type: res.type
        }).subscribe((res) => {
          this.dataSource.data[index].createdBy = res.createdBy;
          this.dataSource.data[index].sharedWith = res.sharedWith;
          this.dataSource._updateChangeSubscription();
        });
      }
    });
  }

  onSharedList(sharedWith: any, customerId: string, index: number) {
    const shareDialog = this.dialog.open(SharedWithListComponent, {
      data: {
        sharedWith,
        customerId
      },
      disableClose: true,
      width: '500px'
    });

    shareDialog.afterClosed().subscribe((res) => {
      this.dataSource.data[index].sharedWith = res;
      this.dataSource._updateChangeSubscription();
    });
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
    this.updateUrlParams();
    this.getAllCustomers();
  }

  onEmployeeFilterChange() {
    this.page = 1; // Reset to first page when employee filter changes
    this.updateUrlParams();
    this.getAllCustomers();
  }

  onRowClicks(index: number) {
    const data = this.dataSource.data[index];
    const modalData: CustomerViewModalData = {
      customerId: data.clientRef
    };

    const viewDialog = this.dialog.open(CustomerViewComponent, {
      data: modalData,
      width: '1100px',
      maxHeight: '90vh'
    });

    viewDialog.afterClosed().subscribe((result) => {
      if (result === 'deleted') {
        this.getAllCustomers();
      }
    });
  }

  checkPermission() {
    this._employeeService.employeeData$.subscribe((data) => {
      this.createCustomer = data?.category.privileges.customer.create;
    });
  }

  onPageNumberClick(event: { page: number, row: number }) {
    this.subject.next(event);
  }
}