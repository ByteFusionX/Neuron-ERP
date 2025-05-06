import { Component, ElementRef, OnDestroy, OnInit, ViewChild, QueryList, ViewChildren, AfterViewInit } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatTableDataSource, MatTable, MatColumnDef, MatHeaderCellDef, MatCellDef, MatCell, MatHeaderRowDef, MatHeaderRow, MatRowDef, MatRow } from '@angular/material/table';
import { BehaviorSubject, filter, Subject, Subscription, takeUntil } from 'rxjs';
import { EnquiryService } from 'src/app/core/services/enquiry/enquiry.service';
import { Estimations, feedback, getEnquiry } from 'src/app/shared/interfaces/enquiry.interface';
import { saveAs } from 'file-saver';
import { ToastrService } from 'ngx-toastr';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { HttpEventType } from '@angular/common/http';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { ViewCommentComponent } from '../view-comment/view-comment.component';
import { SelectEmployeeComponent } from '../select-employee/select-employee.component';
import { ViewFeedbackComponent } from '../view-feedback/view-feedback.component';
import { NotificationService } from 'src/app/core/services/notification.service';
import { NavigationExtras, Router } from '@angular/router';
import { ViewEstimationComponent } from '../view-estimation/view-estimation.component';
import { RejectJobCommentComponent } from '../reject-job-comment/reject-job-comment.component';
import { EventsListComponent } from 'src/app/shared/components/events-list/events-list.component';
import { NgIf, NgClass, NgFor } from '@angular/common';
import { SkeltonLoadingComponent } from '../../../../shared/components/skelton-loading/skelton-loading.component';
import { MatTooltip } from '@angular/material/tooltip';
import { NgIcon } from '@ng-icons/core';
import { PaginationComponent } from '../../../../shared/components/pagination/pagination.component';

@Component({
    selector: 'app-reassigned-jobs',
    templateUrl: './reassigned-jobs.component.html',
    styleUrls: ['./reassigned-jobs.component.css'],
    imports: [NgIf, SkeltonLoadingComponent, MatTable, MatColumnDef, MatHeaderCellDef, MatCellDef, MatCell, NgClass, MatTooltip, NgIcon, NgFor, MatHeaderRowDef, MatHeaderRow, MatRowDef, MatRow, PaginationComponent]
})
export class ReassignedJobsComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChildren('jobItem') jobItems!: QueryList<ElementRef>;
  @ViewChild('fileInput') fileInput!: ElementRef;
  displayedColumns: string[] = ['enqId', 'customerName', 'description', 'assignedBy', 'department', 'comment', 'events', 'download', 'estimation', 'send'];
  dataSource = new MatTableDataSource<getEnquiry>();
  viewAssignedFor: boolean = false;
  isLoading: boolean = true;
  isEmpty: boolean = false;
  subscriptions = new Subscription();
  jobIdArr: string[] = []


  private readonly destroy$ = new Subject<void>();
  private notViewedJobIds: Set<string> = new Set();

  page: number = 1;
  row: number = 10;
  total!: number;
  subject = new BehaviorSubject<{ page: number, row: number }>({ page: 1, row: 10 });

  progress: number = 0;
  selectedFile!: string | undefined;
  userId!: string | undefined;
  quoteId!: string;

  constructor(
    private _enquiryService: EnquiryService,
    private _dialog: MatDialog,
    private toast: ToastrService,
    private _employeeService: EmployeeService,
    private _notificationService: NotificationService,
    private _router: Router,
  ) { }

  ngOnInit(): void {
    this._employeeService.employeeData$.subscribe((data) => {
      this.viewAssignedFor = data?.category.privileges.assignedJob.viewReport == 'all'
    })
    if (this.viewAssignedFor) {
      this.displayedColumns = ['enqId', 'customerName', 'description', 'assignedBy', 'assignedFor', 'department', 'comment', 'events', 'download', 'estimation', 'send'];
    }
    this.subject.subscribe((data) => {
      this.page = data.page;
      this.row = data.row;
      this.getJobsData();
    });
  }

  ngAfterViewInit() {
    this.jobItems.changes.pipe(takeUntil(this.destroy$)).subscribe(() => {
      setTimeout(() => {
        this.jobItems.forEach(item => this.observeJob(item));
      }, 100);
    });
  }

  getJobsData() {
    let access;
    this._employeeService.employeeData$.subscribe((employee) => {
      access = employee?.category.privileges.assignedJob.viewReport;
      this.userId = employee?._id;
    });
    if (this.userId) {
      this.subscriptions.add(
        this._enquiryService.getPresale(this.page, this.row, 'none', access, this.userId).subscribe({
          next: (data) => {
            const filteredEnquiries = data.enquiry.filter(
              (enq: any) => enq.status == 'Assigned To Presale Engineer'
            );
            this.dataSource.data = filteredEnquiries;
            this.total = filteredEnquiries.length;
            this.isLoading = false;
            if(!filteredEnquiries.length){
              this.isEmpty = true
            }
            this.updateNotViewedJobIds();
            this.observeAllJobs();
          },
          error: (error) => {
            this.isEmpty = true;
          }
        })
      );
    }
  }

  updateNotViewedJobIds() {
    this.notViewedJobIds.clear();
    this.dataSource.data.forEach(job => {
      if (!job.reAssignedSeen) {
        this.notViewedJobIds.add(job._id);
      }
    });
  }

  observeAllJobs() {
    setTimeout(() => {
      this.jobItems.forEach(item => this.observeJob(item));
    }, 100); // slight delay to ensure the DOM is fully rendered
  }

  observeJob(element: ElementRef) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const jobId = entry.target.getAttribute('id');
          if (jobId && this.notViewedJobIds.has(jobId)) {
            this.markJobAsViewed(jobId)
            this.notViewedJobIds.delete(jobId);
          }
          observer.unobserve(entry.target);
        }
      });
    }, { root: null, rootMargin: '0px', threshold: 1.0 });

    if (element?.nativeElement) {
      observer.observe(element.nativeElement);
    }
  }

  markJobAsViewed(jobId: string) {
    this._enquiryService.markReassignJobAsViewed(jobId).pipe(takeUntil(this.destroy$)).subscribe();
    this._notificationService.decrementNotificationCount('reAssignedJob', 1)
  }


  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.subscriptions.unsubscribe();
  }

  onSendClicked(index: number) {
    if (this.dataSource.data[index].preSale.estimations) {
      const dialogRef = this._dialog.open(ConfirmationDialogComponent,
        {
          data: {
            title: `Are you absolutely sure?`,
            description: `This action is irreversible and send the assigned task back to the salesperson. You can also verify by other employees. Please ensure all files are selected before proceeding. `,
            icon: 'heroExclamationCircle',
            IconColor: 'orange'
          }
        });

      dialogRef.afterClosed().subscribe((approved: boolean) => {
        if (approved) {
          let selectedEnquiry: { id: string, status: string } = {
            id: this.dataSource.data[index]._id,
            status: 'Sended by Presale Engineer'
          }
          Object.seal(selectedEnquiry)
          this.subscriptions.add(
            this._enquiryService.updateEnquiryStatus(selectedEnquiry).subscribe((data) => {
              if (data) {
                this.dataSource.data.splice(index, 1)
                if (this.dataSource.data.length) {
                  this.dataSource.data = [...this.dataSource.data]
                } else {
                  this.dataSource.data = []
                  this.isEmpty = true
                }

                if (data.quoteId) {
                  this.toast.success(`Job has successfully completed and send back to Quotation  \n(${data.quoteId})`)
                } else {
                  this.toast.success(`Job has successfully completed and send back to Enquiry \n(${data.update.enquiryId})`)
                }
              }
            })
          )
        }
      })
    } else {
      this.toast.warning('Please complete the estimation Uploads')
    }
  }

  onFeedback(enquiryId: string, index: number) {
    if (this.dataSource.data[index].preSale.estimations) {
      const dialogRef = this._dialog.open(SelectEmployeeComponent, { width: '400px' });

      dialogRef.afterClosed().subscribe((data: { employeeId: string, comment: string }) => {
        if (data.employeeId) {
          const feedbackBody = {
            employeeId: data.employeeId,
            comment: data.comment,
            enquiryId
          }
          this._enquiryService.sendFeedbackRequest(feedbackBody).subscribe((data: any) => {
            if (data) {
              data.client = [data.client]
              data.department = [data.department]
              data.salesPerson = [data.salesPerson]
              this.dataSource.data[index] = data
              this.dataSource.data = [...this.dataSource.data];
              this.dataSource._updateChangeSubscription();
            }
          })
        }
      })
    } else {
      this.toast.warning('Please complete the estimation Uploads')
    }
  }



  viewFeedback(feedback: feedback[], enqId: string, index: number) {

    this._dialog.open(ViewFeedbackComponent, {
      data: { feedback, enqId },
      width: '400px'
    }).afterClosed().subscribe(() => {
      const feedbackRes = this.dataSource.data[index].preSale.feedback;

      if (feedbackRes && feedback.length) {
        feedbackRes.forEach((feedback) => {
          feedback.seenByFeedbackRequester = true;
        })
        this.dataSource._updateChangeSubscription()
      }
    })
  }

  hasUnseenFeedback(feedback: feedback[]): boolean {
    return feedback.some((fb: any) => !fb.seenByFeedbackRequester && fb.feedback);
  }

  onViewComment(comment: string, revisionComment: string[]) {
    let dialog = this._dialog.open(ViewCommentComponent, {
      width: '500px',
      data: { comment, revisionComment }
    })
  }

  onUploadClicks(enquiryId: string) {
    const navigationExtras: NavigationExtras = {
      state: { enquiryId }
    };
    this._router.navigate(['/assigned-jobs/upload-estimations'], navigationExtras);
  }

  onViewEstimation(estimation: Estimations, enqId: string) {
    const estimationDialog = this._dialog.open(ViewEstimationComponent, {
      data: { estimation, enqId, isEdit: true }
    })

    estimationDialog.afterClosed().subscribe((remove: boolean) => {
      if (remove) {
        this._enquiryService.clearEstimations(enqId).subscribe({
          next: (res: any) => {
            if (res.success) {
              this.dataSource.data = this.dataSource.data.map((enquiry) => {
                if (enquiry._id == enqId) {
                  delete (enquiry.preSale as any).estimations
                }
                return enquiry
              })
              this.dataSource._updateChangeSubscription()
            }
          }
        })
      }
    })
  }

  onDateChange(event: { page: number, row: number }) {
    this.subject.next(event)
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

  clearProgress() {
    setTimeout(() => {
      this.selectedFile = undefined;
      this.progress = 0
    }, 1000)
  }

  handleNotClose(event: MouseEvent) {
    event.stopPropagation();
  }

  onRejectJob(enquiry: any, index: number) {
    if (!enquiry.preSale.estimations) {
      const rejectModal = this._dialog.open(RejectJobCommentComponent, {
        width: '500px'
      })
      rejectModal.afterClosed().subscribe((comment) => {
        if (comment) {
          this._enquiryService.rejectJob(enquiry._id, comment, 'Engineer').subscribe({
            next: (res) => {
              if (res.success) {
                this.dataSource.data.splice(index, 1)
                this.dataSource._updateChangeSubscription()
                if (this.dataSource.data.length <= 0) {
                  this.isEmpty = true;
                }
              }
            },
            error: () => {
              this.toast.warning('Something went wrong while rejecting. Please try again later')
            }
          })
        }
      })
    } else {
      this.toast.warning('Job rejection failed. Please ensure all estimations are cleared before rejecting the job.')
    }
  }

  chooseType(file: any): string {
    const contentTypes: any = {
      'pdf': 'application/pdf',
      'png': 'image/png',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'doc': 'application/msword',
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    }
    const extension: string = <string>file.split('.').pop().toLowerCase();
    return contentTypes[extension]
  }

  onEventClicks(enquiryId: string) {
    const dialog = this._dialog.open(EventsListComponent, { data: { collectionId: enquiryId, from: 'Enquiry' }, width: '500px' })
    dialog.afterClosed().subscribe()
  }
}
