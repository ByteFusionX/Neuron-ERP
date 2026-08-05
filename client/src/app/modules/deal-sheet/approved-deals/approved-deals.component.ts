import { Component, ElementRef, QueryList, ViewChildren } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatTableDataSource } from '@angular/material/table';
import { Router } from '@angular/router';
import { LoadingBarService } from '@ngx-loading-bar/core';
import { BehaviorSubject, Subject, Subscription, takeUntil } from 'rxjs';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { QuotationService } from 'src/app/core/services/quotation/quotation.service';
import { getDealSheet, getQuotatation, getQuotation, Quotatation, QuoteItem } from 'src/app/shared/interfaces/quotation.interface';
import { ApproveDealComponent } from '../approve-deal/approve-deal.component';
import { NotificationService } from 'src/app/core/services/notification.service';
import { RejectDealComponent } from '../reject-deal/reject-deal.component';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { FormControl } from '@angular/forms';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { HttpEventType } from '@angular/common/http';
import { JobService } from 'src/app/core/services/job/job.service';
import { ToastrService } from 'ngx-toastr';
import saveAs from 'file-saver';
import { QuotationPreviewComponent } from 'src/app/shared/components/quotation-preview/quotation-preview.component';

@Component({
    selector: 'app-approved-deals',
    templateUrl: './approved-deals.component.html',
    styleUrls: ['./approved-deals.component.css'],
    standalone: false
})
export class ApprovedDealsComponent {
  @ViewChildren('quoteItem') quoteItems!: QueryList<ElementRef>;

  userId!: string | undefined;

  isLoading: boolean = true;
  isEmpty: boolean = false;

  loader = this.loadingBar.useRef();
  private readonly destroy$ = new Subject<void>();
  private notViewedDealIds: Set<string> = new Set();

  displayedColumns: string[] = ['dealId', 'quoteId', 'customerName', 'description', 'salesPerson', 'department', 'paymentTerms', 'lpo', 'action'];

  dataSource = new MatTableDataSource<Quotatation>()

  total: number = 0;
  page: number = 1;
  row: number = 10;

  private subscriptions = new Subscription();
  private subject = new BehaviorSubject<{ page: number, row: number }>({ page: this.page, row: this.row });

  searchControl = new FormControl('');
  selectedFile!: string | undefined;
  progress: number = 0;


  searchQuery: string = '';
  searchCriteria: string = 'dealId';
  isEnter: boolean = false;

  constructor(
    private _quoteService: QuotationService,
    private _router: Router,
    private _dialog: MatDialog,
    private _employeeService: EmployeeService,
    private _notificationService: NotificationService,
    private loadingBar: LoadingBarService,
    private _jobService: JobService,
    private toast: ToastrService,
  ) { }

  ngOnInit() {
    this.searchControl.valueChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        takeUntil(this.destroy$)
      )
      .subscribe(() => {
        this.page = 1;
        this.getDealSheet();
      });

    this.subscriptions.add(
      this.subject.subscribe((data) => {
        this.page = data.page
        this.row = data.row
        this.getDealSheet()
      })
    )
  }

  ngAfterViewInit() {
    this.quoteItems.changes.pipe(takeUntil(this.destroy$)).subscribe(() => {
      setTimeout(() => {
        this.quoteItems.forEach(item => this.observeJob(item));
      }, 100);
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.subscriptions.unsubscribe()
  }

  ngModelChange() {
    if (this.searchQuery == '' && this.isEnter) {
      this.onSearch();
      this.isEnter = !this.isEnter;
    }
  }

  onSearch() {
    this.isEnter = true
    this.isLoading = true;
    this.getDealSheet()
  }

  getDealSheet() {
    this.isLoading = true;
    let access;
    let userId;
    let role;
    this._employeeService.employeeData$.subscribe((employee) => {
      access = employee?.category.privileges.quotation.viewReport
      role = employee?.category.role
      userId = employee?._id
      this.userId = userId;
    })

    let filterData = {
      page: this.page,
      row: this.row,
      access: access,
      userId: userId,
      search: this.searchControl.value || '',
      searchQuery: this.searchQuery,
      searchCriteria: this.searchCriteria,
      role: role
    }
    this.subscriptions.add(
      this._quoteService.getApprovedDealSheet(filterData)
        .subscribe((data: getDealSheet) => {
          if (data && data.dealSheet  && data.dealSheet.length) {
            this.dataSource.data = [...data.dealSheet];
            this.dataSource._updateChangeSubscription()
            this.total = data.total
            this.isEmpty = false
            this.updateNotViewedQuoteIds();
            this.observeAllQuotes();
          } else {
            this.total = 0;
            this.dataSource.data = [];
            this.isEmpty = true;
          }
          this.isLoading = false
        })
    )

  }

  updateNotViewedQuoteIds() {
    this.notViewedDealIds.clear();
    this.dataSource.data.forEach(quote => {
      if (!quote.dealData?.seenByApprover && quote._id) {
        this.notViewedDealIds.add(quote._id);
      }
    });
  }

  observeAllQuotes() {
    setTimeout(() => {
      this.quoteItems.forEach(item => this.observeJob(item));
    }, 100);
  }

  observeJob(element: ElementRef) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const quoteId = entry.target.getAttribute('id');
          if (quoteId && this.notViewedDealIds.has(quoteId)) {
            this.markQuoteAsViewed(quoteId)
            this.notViewedDealIds.delete(quoteId);
          }
          observer.unobserve(entry.target);
        }
      });
    }, { root: null, rootMargin: '0px', threshold: 1.0 });

    if (element?.nativeElement) {
      observer.observe(element.nativeElement);
    }
  }

  markQuoteAsViewed(quoteIds: string) {
    this._quoteService.markDealAsViewed(quoteIds).pipe(takeUntil(this.destroy$)).subscribe();
    this._notificationService.decrementNotificationCount('dealSheet', 1)
  }

  onPreviewDeal(approval: boolean, quoteData: Quotatation, index: number) {
    let priceDetails = {
      totalSellingPrice: 0,
      totalCost: 0,
      profit: 0,
      perc: 0
    }

    const quoteItems = quoteData.dealData.updatedItems.map((item) => {
      let itemSelected = 0;

      item.itemDetails.map((itemDetail) => {
        if (itemDetail.dealSelected) {
          itemSelected++;
          priceDetails.totalSellingPrice += itemDetail.unitSellingPrice * itemDetail.quantity;
          priceDetails.totalCost += itemDetail.quantity * itemDetail.unitCost;
          return itemDetail
        }
        return;
      })

      if (itemSelected) return item;

      return;
    });

    quoteData.dealData.additionalCosts.forEach((cost, i: number) => {
      if (cost.type == 'Additional Cost') {
        priceDetails.totalCost += cost.value
      } else if (cost.type === 'Supplier Discount') {
        priceDetails.totalCost -= cost.value
      } else if (cost.type === 'Customer Discount') {
        priceDetails.totalSellingPrice -= cost.value
      } else {
        priceDetails.totalCost += cost.value
      }
    })

    priceDetails.profit = priceDetails.totalSellingPrice - priceDetails.totalCost;
    priceDetails.perc = (priceDetails.profit / priceDetails.totalSellingPrice) * 100

    
    this._dialog.open(ApproveDealComponent,
      {
        data: { approval, quoteData, quoteItems, priceDetails },
        width: '1200px'
      });
  }

  onPageNumberClick(event: { page: number, row: number }) {
    this.subject.next(event)
  }

  revokeDeal(quoteData: Quotatation, index: number) {
    const rejectModal = this._dialog.open(ConfirmationDialogComponent, {
      data: {
        title: 'Are you absolutely sure',
        description: `This action cannot be undone. This will permanently delete the created job and and deal status will changed to pending.`,
        icon: 'heroExclamationCircle',
        IconColor: 'orange'
      }
    })
    rejectModal.afterClosed().subscribe((approved: boolean) => {
      if (approved) {
        this._quoteService.revokeDeal(quoteData._id, 'asdf').subscribe((res) => {
          if (res) {
            this.dataSource.data.splice(index, 1)
            this.dataSource._updateChangeSubscription()
            if (this.dataSource.data.length <= 0) {
              this.isEmpty = true;
            }
          }
        })
      }
    })
  }

  onDownloadClicks(file: any) {
    this.selectedFile = file.fileName
    this.subscriptions.add(
      this._jobService.downloadFile(file.fileName)
        .subscribe({
          next: (event) => {
            if (event.type === HttpEventType.DownloadProgress) {
              this.progress = Math.round(100 * event.loaded / event.total);
            } else if (event.type === HttpEventType.Response) {
              const fileContent: Blob = new Blob([event['body']])
              saveAs(fileContent, file.originalname)
              this.clearProgress()
            }
          },
          error: (error) => {
            if (error.status == 404) {
              this.selectedFile = undefined
              this.toast.warning('Sorry, The requested file was not found on the server. Please ensure that the file exists and try again.')
            }
          }
        })
    )
  }

  clearProgress() {
    setTimeout(() => {
      this.selectedFile = undefined;
      this.progress = 0
    }, 1000)
  }

  onPreviewPdf(quotedData: getQuotatation) {
    this.loader.start()
    let quoteData: getQuotatation = quotedData;
    const pdfDoc = this._quoteService.generatePDF(quoteData, true)
    pdfDoc.then((pdf) => {
      pdf.getBlob((blob: Blob) => {
        let url = window.URL.createObjectURL(blob);

        let dialogRef = this._dialog.open(QuotationPreviewComponent,
          { data: { url: url, formatedQuote: quoteData } });
      });
    });
    this.loader.complete()
  }

}
