import { Component, Inject, OnInit } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { dealData, priceDetails, Quotatation, QuoteItem } from 'src/app/shared/interfaces/quotation.interface';
import { UpdatedealsheetComponent } from '../updatedealsheet-component/updatedealsheet-component.component';
import { QuotationService } from 'src/app/core/services/quotation/quotation.service';
import { ViewCommentComponent } from '../../assigned-jobs/pages/view-comment/view-comment.component';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { NotificationService } from 'src/app/core/services/notification.service';
import { EnquiryService } from 'src/app/core/services/enquiry/enquiry.service';
import { HttpEventType } from '@angular/common/http';
import saveAs from 'file-saver';
import { ToastrService } from 'ngx-toastr';
import { RejectDealComponent } from '../reject-deal/reject-deal.component';
import { CommonModule, DatePipe, NgFor, NgIf, NgSwitch, NgSwitchDefault } from '@angular/common';

import { NgIconsModule } from '@ng-icons/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ParseBoldTextPipe } from '../../../shared/pipes/boldParse.pipe';
import { ParseBracketsTextPipe } from '../../../shared/pipes/highlightParse.pipe';
import { NumberFormatterPipe } from '../../../shared/pipes/numFormatter.pipe';


@Component({
  selector: 'app-approve-deal',
  templateUrl: './approve-deal.component.html',
  styleUrls: ['./approve-deal.component.css'],
  standalone: true,
  imports: [DatePipe, ParseBoldTextPipe, ParseBracketsTextPipe, NumberFormatterPipe, NgIconsModule, MatTooltipModule, CommonModule]
})
export class ApproveDealComponent implements OnInit {
  isApproving: boolean = false;

  constructor(
    public dialogRef: MatDialogRef<ApproveDealComponent>,
    private _dialog: MatDialog,
    private _quoteService: QuotationService,
    private _employeeService: EmployeeService,
    private _enquiryService: EnquiryService,
    private toast: ToastrService,
    private _notificationService: NotificationService,
    @Inject(MAT_DIALOG_DATA) public data: { approval: boolean, quoteData: Quotatation, quoteItems: (QuoteItem | undefined)[], priceDetails: priceDetails, quoteView: boolean }
  ) {
  }

  userId!: string

  ngOnInit(): void {
    this._employeeService.employeeData$.subscribe((data) => {
      if (data?._id) {
        this.userId = data?._id;
      }
    })
    if (this.data.quoteData.dealData.seenedBySalsePerson === false) {
      this._quoteService.markAsQuotationSeen(this.data.quoteData._id, this.userId).subscribe((res: any) => {
        if (res.success) {
          this._notificationService.decrementNotificationCount('quotation', 1)
        }
      })
    }
  }



  onClose() {
    this.dialogRef.close()
  }

  onUpdate() {
    const updateModal = this._dialog.open(UpdatedealsheetComponent, {
      data: this.data
    })

    updateModal.afterClosed().subscribe((dealData: dealData) => {
      if (dealData) {
        this._quoteService.saveDealSheet(dealData, this.data.quoteData._id).subscribe((res) => {
          this.dialogRef.close({ approve: false, updatedData: res })
        })
      }
    })
  }

  onDownloadClicks(file: any) {
    this._enquiryService.downloadFile(file.fileName)
      .subscribe({
        next: (event) => {
          if (event.type === HttpEventType.DownloadProgress) {
          } else if (event.type === HttpEventType.Response) {
            const fileContent: Blob = new Blob([event['body']])
            saveAs(fileContent, file.originalname)
          }
        },
        error: (error) => {
          if (error.status == 404) {
            this.toast.warning('Sorry, The requested file was not found on the server. Please ensure that the file exists and try again.')
          }
        }
      })
  }

  openReview() {
    this._dialog.open(ViewCommentComponent, {
      data: { comment: this.data.quoteData.dealData.comments[0] },
      width: '500px'
    });
  }



  onApprove() {
    const rejectModal = this._dialog.open(RejectDealComponent, {
      data: { reject: false },
      width: '500px'
    })
    rejectModal.afterClosed().subscribe(({ submit, comment }) => {
      if (submit) {
        this.isApproving = true;
        this.dialogRef.close({ approve: true, updating: false, comment })
      }
    })
  }

  checkAtLeastOneDealSelected(item: any) {
    return item?.itemDetails?.some((detail: any) => detail.dealSelected)
  }


  onViewPDF(file: any) {
    // Check if the file is a PDF
    if (file.fileName && file.fileName.toLowerCase().endsWith('.pdf')) {

      this._enquiryService.downloadFile(file.fileName)
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
    } else {
      // If the file is not a PDF, show a toaster notification
      this.toast.warning('This file type is not supported for viewing. Please download and view the file.');
    }
  }

}
