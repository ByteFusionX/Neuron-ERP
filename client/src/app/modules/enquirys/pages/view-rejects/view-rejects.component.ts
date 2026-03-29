import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatDialogRef } from '@angular/material/dialog';
import { EnquiryService } from 'src/app/core/services/enquiry/enquiry.service';
import { NotificationService } from 'src/app/core/services/notification.service';
import { NgIcon } from '@ng-icons/core';
import { NgFor, NgIf, DatePipe } from '@angular/common';

@Component({
    selector: 'app-view-rejects',
    templateUrl: './view-rejects.component.html',
    styleUrls: ['./view-rejects.component.css'],
    imports: [NgIcon, NgFor, NgIf, DatePipe]
})
export class ViewRejectsComponent {
  constructor(
    private dialogRef: MatDialogRef<ViewRejectsComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { rejectionReason: any; rejectedBy: any,employeeId:any,rejectedAt:any }[],
    private _enquiryService: EnquiryService,
    private _notificationService: NotificationService,
  ) { }

  ngOnInit() {
    // this.data.feedback.forEach((feedback) => {
    //   if (!feedback.seenByFeedbackRequester && feedback.feedback) {
    //   }
    // })
  }

  closeModal() {
    this.dialogRef.close()
  }
}
