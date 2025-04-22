import { Component, ElementRef, QueryList, ViewChildren } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatTableDataSource } from '@angular/material/table';
import { ToastrService } from 'ngx-toastr';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { EnquiryService } from 'src/app/core/services/enquiry/enquiry.service';
import { Estimations, feedback, getEnquiry } from 'src/app/shared/interfaces/enquiry.interface';
import { ViewCommentComponent } from '../assigned-jobs/pages/view-comment/view-comment.component';
import { BehaviorSubject, Subject, Subscription, takeUntil } from 'rxjs';
import { HttpEventType } from '@angular/common/http';
import { saveAs } from 'file-saver'
import { GiveFeedbackComponent } from './pages/give-feedback/give-feedback.component';
import { ViewFeedbackComponent } from '../assigned-jobs/pages/view-feedback/view-feedback.component';
import { NotificationService } from 'src/app/core/services/notification.service';
import { ViewEstimationComponent } from '../assigned-jobs/pages/view-estimation/view-estimation.component';
import { QuoteItem } from 'src/app/shared/interfaces/quotation.interface';


@Component({
    selector: 'app-feedback-requests',
    templateUrl: './feedback-requests.component.html',
    styleUrls: ['./feedback-requests.component.css'],
    standalone: false
})
export class FeedbackRequestsComponent {
  @ViewChildren('feebackItem') feebackItems!: QueryList<ElementRef>;
  isLoading: boolean = true;
  isEmpty: boolean = false;
  subscriptions = new Subscription()
  feedbackIdArr: string[] = []
  private readonly destroy$ = new Subject<void>();
  private notViewedfeedbackIds: Set<string> = new Set();

  dataSource = new MatTableDataSource<getEnquiry>();
  displayedColumns: string[] = ['enqId', 'customerName', 'description', 'assignedBy', 'department', 'comment', 'download', 'requestedBy', 'presaleFile', 'reply'];

  page: number = 1;
  row: number = 10;
  total!: number;
  subject = new BehaviorSubject<{ page: number, row: number }>({ page: 1, row: 10 })

  progress: number = 0;
  selectedFile!: string | undefined;

  constructor(
    private _enquiryService: EnquiryService,
    private _dialog: MatDialog,
    private toast: ToastrService,
    private _employeeService: EmployeeService,
    private _notificationService: NotificationService
  ) { }

  ngOnInit(): void {
    this.subject.subscribe((data) => {
      this.page = data.page
      this.row = data.row
      this.getFeedbackRequests()
    })
  }

  ngAfterViewInit() {
    this.feebackItems.changes.pipe(takeUntil(this.destroy$)).subscribe(() => {
      setTimeout(() => {
        this.feebackItems.forEach(item => this.observeFeedback(item));
      }, 100);
    });
  }

  getFeedbackRequests() {
    this.isLoading = true;
    this._employeeService.employeeData$.subscribe((employee) => {
      const employeeId = employee?._id;
      if (employeeId) {
        this.subscriptions.add(
          this._enquiryService.getFeedbackRequests(this.page, this.row, employeeId).subscribe({
            next: (data) => {
              this.dataSource.data = data.feedbacks;
              this.total = data.total;
              this.isLoading = false;
              this.isEmpty = false;
              this.updateNotViewedFeebackIds();
              this.observeAllFeedbacks();
            },
            error: (error) => {
              this.isEmpty = true;
              this.isLoading = false;
            }
          })
        );
      } else {
        this.isLoading = false;
        this.isEmpty = true;
      }
    });
  }

  updateNotViewedFeebackIds() {
    this.notViewedfeedbackIds.clear();
    this.dataSource.data.forEach(enquiry => {
      enquiry.preSale.feedback?.forEach((feedback) => {
        if (!feedback?.seenByFeedbackProvider) {
          this.notViewedfeedbackIds.add(enquiry._id);
        }
      })
    });
  }

  observeAllFeedbacks() {
    setTimeout(() => {
      this.feebackItems.forEach(item => this.observeFeedback(item));
    }, 100);
  }

  observeFeedback(element: ElementRef) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const enqId = entry.target.getAttribute('id');
          if (enqId && this.notViewedfeedbackIds.has(enqId)) {
            this.markFeedbackAsViewed(enqId)
            this.notViewedfeedbackIds.delete(enqId);
          }
          observer.unobserve(entry.target);
        }
      });
    }, { root: null, rootMargin: '0px', threshold: 1.0 });

    if (element?.nativeElement) {
      observer.observe(element.nativeElement);
    }
  }

  onViewEstimation(estimation: Estimations, enqId: string) {
    this._dialog.open(ViewEstimationComponent, {
      data: { estimation, enqId, isEdit: false }
    })
  }

  markFeedbackAsViewed(enqId: string) {
    this._enquiryService.markFeedbackAsViewed(enqId).pipe(takeUntil(this.destroy$)).subscribe();
    this._notificationService.decrementNotificationCount('feedbackRequest', 1)
  }


  onViewComment(comment: string, revisionComment: string[], feedbackComment: string) {
    this._dialog.open(ViewCommentComponent, {
      width: '500px',
      data: { comment, revisionComment, feedbackComment }
    })
  }

  viewFeedback(feedback: feedback) {
    this._dialog.open(ViewFeedbackComponent, {
      width: '500px',
      data: feedback
    });
  }

  onDownloadClicks(file: any) {
    this.selectedFile = file.fileName
    this.subscriptions.add(
      this._enquiryService.downloadFile(file.fileName)
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

  onGiveFeedback(enquiryId: string, index: number, feedbackId: string) {
    let dialog = this._dialog.open(GiveFeedbackComponent, {
      width: '500px',
    })

    dialog.afterClosed().subscribe((feedback: string) => {
      if (feedback) {
        const feedbackBody = { enquiryId, feedback, feedbackId }
        this._enquiryService.giveFeedback(feedbackBody).subscribe((res: any) => {
          if (res.success) {
            this.dataSource.data.splice(index, 1);
            this.dataSource._updateChangeSubscription();
            if (this.dataSource.data.length == 0) {
              this.isEmpty = true;
            }
          }
        })
      }
    })
  }

  onDateChange(event: { page: number, row: number }) {
    this.subject.next(event)
  }

  clearProgress() {
    setTimeout(() => {
      this.selectedFile = undefined;
      this.progress = 0
    }, 1000)
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.subscriptions.unsubscribe();
  }
}
