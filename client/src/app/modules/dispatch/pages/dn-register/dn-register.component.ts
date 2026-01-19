
import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormBuilder, FormControl, FormsModule, ReactiveFormsModule, FormGroup } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { NavigationExtras, Router, ActivatedRoute, RouterModule } from '@angular/router';
import { BehaviorSubject, Subscription } from 'rxjs';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { NgIconComponent, provideIcons } from '@ng-icons/core';
import { heroAdjustmentsHorizontal, heroCalendarDays, heroChevronDown, heroDocumentText, heroEye, heroMagnifyingGlass, heroXMark } from '@ng-icons/heroicons/outline';
import { NgSelectModule } from '@ng-select/ng-select';

import { DeliveryNoteService } from 'src/app/core/services/delivery-note/delivery-note.service';
import { DeliveryNote, DnStatus } from 'src/app/shared/interfaces/delivery-note.interface';
import { SkeltonLoadingComponent } from 'src/app/shared/components/skelton-loading/skelton-loading.component';
import { PaginationComponent } from 'src/app/shared/components/pagination/pagination.component';
import { dateFutureDirective } from 'src/app/shared/directives/date-future.directive';
import { ToastrService } from 'ngx-toastr';
import { DnJobReportComponent } from './dn-job-report/dn-job-report.component';
import { DnCustomerReportComponent } from './dn-customer-report/dn-customer-report.component';

@Component({
  selector: 'app-dn-register',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    MatTableModule,
    MatMenuModule,
    MatTooltipModule,
    NgIconComponent,
    NgSelectModule,
    SkeltonLoadingComponent,
    PaginationComponent,
    dateFutureDirective
  ],
  templateUrl: './dn-register.component.html',
  styleUrl: './dn-register.component.css',
  providers: [DatePipe, provideIcons({ heroAdjustmentsHorizontal, heroChevronDown, heroMagnifyingGlass, heroCalendarDays, heroDocumentText, heroEye, heroXMark })]
})
export class DnRegisterComponent implements OnInit, OnDestroy {

  isLoading: boolean = true;
  isEmpty: boolean = false;
  isFiltered: boolean = false;
  isEnter: boolean = false;

  searchQuery: string = '';

  dnStatuses = Object.values(DnStatus);
  displayedColumns: string[] = ['date', 'dnNo', 'jobId', 'customer', 'status', 'action'];

  dataSource = new MatTableDataSource<DeliveryNote>();

  total: number = 0;
  page: number = 1;
  row: number = 10;

  fromDate: string | null = null;
  toDate: string | null = null;
  selectedCustomer: string | null = null;
  selectedJobId: string | null = null;
  selectedStatus: string | null = null;

  formData: FormGroup;

  private subscriptions = new Subscription();
  private subject = new BehaviorSubject<{ page: number, row: number }>({ page: this.page, row: this.row });

  constructor(
    private _fb: FormBuilder,
    private _dnService: DeliveryNoteService,
    private _router: Router,
    private _route: ActivatedRoute,
    private _dialog: MatDialog,
    private toaster: ToastrService
  ) {
    this.formData = this._fb.group({
      fromDate: [null],
      toDate: [null],
    });
  }

  ngOnInit() {
    this._route.queryParams.subscribe(params => {
      this.page = params['page'] ? parseInt(params['page']) : 1;
      this.row = params['row'] ? parseInt(params['row']) : 10;
      this.searchQuery = params['search'] || '';
      this.fromDate = params['fromDate'] || null;
      this.toDate = params['toDate'] || null;
      this.selectedCustomer = params['customer'] || null;
      this.selectedStatus = params['status'] || null;
      this.selectedJobId = params['jobId'] || null;

      if (this.fromDate) this.formData.controls['fromDate'].setValue(this.fromDate);
      if (this.toDate) this.formData.controls['toDate'].setValue(this.toDate);

      this.isFiltered = !!(this.searchQuery || this.fromDate || this.toDate || this.selectedCustomer || this.selectedStatus || this.selectedJobId);

      this.subject.next({ page: this.page, row: this.row });
    });

    this.subscriptions.add(
      this.subject.subscribe((data) => {
        this.page = data.page;
        this.row = data.row;
        this.getDeliveryNotes();
        this.updateUrlParams();
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  getDeliveryNotes() {
    this.isLoading = true;
    let filterData = {
      search: this.searchQuery,
      page: this.page,
      row: this.row,
      customer: this.selectedCustomer,
      fromDate: this.fromDate,
      toDate: this.toDate,
      status: this.selectedStatus,
      jobId: this.selectedJobId
    };

    this.subscriptions.add(
      this._dnService.getAllDeliveryNotes(filterData).subscribe(
        (data) => {
          if (data && data.dns) {
            this.dataSource.data = data.dns;
            this.total = data.total;
            this.isEmpty = data.total === 0;
          } else {
            this.dataSource.data = [];
            this.total = 0;
            this.isEmpty = true;
          }
          this.isLoading = false;
        },
        (error) => {
          this.isLoading = false;
          this.isEmpty = true;
          this.dataSource.data = [];
          console.error(error);
        }
      )
    );
  }

  updateUrlParams() {
    const queryParams: any = {
      page: this.page !== 1 ? this.page : null,
      row: this.row !== 10 ? this.row : null,
      search: this.searchQuery ? this.searchQuery : null,
      fromDate: this.fromDate,
      toDate: this.toDate,
      customer: this.selectedCustomer,
      status: this.selectedStatus,
      jobId: this.selectedJobId
    };

    this._router.navigate([], {
      relativeTo: this._route,
      queryParams: queryParams,
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
  }

  onSearch() {
    this.isEnter = true;
    this.page = 1;
    this.getDeliveryNotes();
    this.updateUrlParams();
  }

  ngModelChange() {
    if (this.searchQuery == '' && this.isEnter) {
      this.onSearch();
      this.isEnter = false;
    }
  }

  onSubmit() {
    const from = this.formData.get('fromDate')?.value;
    const to = this.formData.get('toDate')?.value;

    // Basic validation could go here
    this.fromDate = from;
    this.toDate = to;

    this.isFiltered = true;
    this.page = 1;
    this.getDeliveryNotes();
    this.updateUrlParams();
  }

  onClear() {
    this.isFiltered = false;
    this.searchQuery = '';
    this.fromDate = null;
    this.toDate = null;
    this.selectedCustomer = null;
    this.selectedStatus = null;
    this.selectedJobId = null;
    this.formData.reset();
    this.page = 1;
    this.getDeliveryNotes();

    this._router.navigate([], {
      relativeTo: this._route,
      queryParams: {},
      replaceUrl: true
    });
  }

  onfilterApplied() {
    this.isFiltered = true;
    this.page = 1;
    this.getDeliveryNotes();
    this.updateUrlParams();
  }

  onPageNumberClick(event: { page: number, row: number }) {
    this.subject.next(event);
  }

  onRowClick(row: DeliveryNote) {
    // Navigate to detail view if exists, or show preview
    // For now, maybe navigate to a view page or open a dialog?
    // The requirement mentions: "Navigation from the register to DN detail or summary views must use the same routing... used in other list screens"
    // Usually /dispatch/dn-view/:id or similar.
    // I'll leave it as a log or basic navigation for now until I know the detail route.
    // Assuming /dispatch/view-dn/:id based on other modules.
    // this._router.navigate(['/dispatch/view-dn', row._id]);
    console.log('Row clicked', row);
  }

  preventClick(event: Event) {
    event.stopPropagation();
  }

  handleNotClose(event: MouseEvent) {
    event.stopPropagation();
  }

  // Placeholder for Report generation
  generateJobReport() {
    if (!this.selectedJobId) {
      this.toaster.warning("Please filter by a Job ID to generate the Job Report.");
      return;
    }
    this._dialog.open(DnJobReportComponent, {
      data: { jobId: this.selectedJobId },
      width: '900px'
    });
  }

  generateCustomerReport() {
    if (!this.selectedCustomer) {
      this.toaster.warning("Please filter by a Customer to generate the Customer Report.");
      return;
    }
    this._dialog.open(DnCustomerReportComponent, {
      data: { customer: this.selectedCustomer },
      width: '900px'
    });
  }
}

