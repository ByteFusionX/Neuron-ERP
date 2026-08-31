import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatTableDataSource, MatTable, MatColumnDef, MatHeaderCellDef, MatCellDef, MatCell, MatHeaderRowDef, MatHeaderRow, MatRowDef, MatRow } from '@angular/material/table';
import { BehaviorSubject, Subscription } from 'rxjs';
import { EnquiryService } from 'src/app/core/services/enquiry/enquiry.service';
import { Estimations, feedback, getEnquiry } from 'src/app/shared/interfaces/enquiry.interface';
import { saveAs } from 'file-saver'
import { ToastrService } from 'ngx-toastr';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { HttpEventType } from '@angular/common/http';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { ViewCommentComponent } from '../view-comment/view-comment.component';
import { SelectEmployeeComponent } from '../select-employee/select-employee.component';
import { ViewFeedbackComponent } from '../view-feedback/view-feedback.component';
import { QuoteItem } from 'src/app/shared/interfaces/quotation.interface';
import { ViewEstimationComponent } from '../view-estimation/view-estimation.component';
import { NgIf, NgFor } from '@angular/common';
import { SkeltonLoadingComponent } from '../../../../shared/components/skelton-loading/skelton-loading.component';
import { MatTooltip } from '@angular/material/tooltip';
import { NgIcon } from '@ng-icons/core';
import { PaginationComponent } from '../../../../shared/components/pagination/pagination.component';
import { FileUploadModalComponent, FileUploadModalData } from 'src/app/shared/components/file-upload-modal/file-upload-modal.component';

@Component({
    selector: 'app-completed-jobs-list',
    templateUrl: './completed-jobs-list.component.html',
    styleUrls: ['./completed-jobs-list.component.css'],
    imports: [NgIf, SkeltonLoadingComponent, MatTable, MatColumnDef, MatHeaderCellDef, MatCellDef, MatCell, MatTooltip, NgIcon, NgFor, MatHeaderRowDef, MatHeaderRow, MatRowDef, MatRow, PaginationComponent]
})
export class CompletedJobsListComponent implements OnInit, OnDestroy {

  @ViewChild('fileInput') fileInput!: ElementRef;
  displayedColumns: string[] = ['enqId', 'customerName', 'description', 'assignedBy', 'department', 'comment', 'download', 'presaleFiles', 'feedbacks'];
  dataSource = new MatTableDataSource<getEnquiry>();
  isLoading: boolean = true;
  isEmpty: boolean = false
  subscriptions = new Subscription()

  page: number = 1;
  row: number = 10;
  total!: number;
  subject = new BehaviorSubject<{ page: number, row: number }>({ page: 1, row: 10 })

  progress: number = 0
  selectedFile!: string | undefined;
  constructor(
    private _enquiryService: EnquiryService,
    private _dialog: MatDialog,
    private toast: ToastrService,
    private _employeeService: EmployeeService) { }

  ngOnInit(): void {
    this.subject.subscribe((data) => {
      this.page = data.page
      this.row = data.row
      this.getJobsData()
    })
  }

  getJobsData() {
    let access;
    let userId;
    this._employeeService.employeeData$.subscribe((employee) => {
      access = employee?.category.privileges.assignedJob.viewReport
      userId = employee?._id
    })

    this.subscriptions.add(
      this._enquiryService.getPresale(this.page, this.row, 'completed', access, userId).subscribe({
        next: (data) => {
          this.dataSource.data = data.enquiry;
          this.total = data.total;
          this.isLoading = false;
        },
        error: (error) => {
          this.isEmpty = true
        }
      })
    )
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe()
  }

  onViewEstimation(estimation: Estimations, enqId: string) {
    this._dialog.open(ViewEstimationComponent, {
      data: { estimation, enqId, isEdit: false }
    })
  }

  viewFeedback(feedback: feedback[], enqId: string, index: number) {
    this._dialog.open(ViewFeedbackComponent, {
      data: { feedback, enqId },
      width: '400px'
    })
  }

  onViewComment(comment: string, revisionComment: string[]) {
    let dialog = this._dialog.open(ViewCommentComponent, {
      width: '500px',
      data: { comment, revisionComment }
    })
  }


  onDateChange(event: { page: number, row: number }) {
    this.subject.next(event)
  }

  openAttachmentView(element: any): void {
    if (!element?.preSale?.presaleFiles?.length) {
      return;
    }

    const modalData: FileUploadModalData = {
      title: `Files - ${element.enquiryId}`,
      existingFiles: element.preSale.presaleFiles,
      allowMultiple: true,
      showActions: { upload: false, download: true, view: true, delete: false }
    };

    this._dialog.open(FileUploadModalComponent, { data: modalData, width: '800px', maxHeight: '90vh' });
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

}

