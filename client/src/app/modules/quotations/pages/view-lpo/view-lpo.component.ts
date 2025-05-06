import { HttpEventType } from '@angular/common/http';
import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import saveAs from 'file-saver';
import { ToastrService } from 'ngx-toastr';
import { EnquiryService } from 'src/app/core/services/enquiry/enquiry.service';
import { QuotationService } from 'src/app/core/services/quotation/quotation.service';
import { ViewCommentComponent } from 'src/app/modules/assigned-jobs/pages/view-comment/view-comment.component';
import { Quotatation } from 'src/app/shared/interfaces/quotation.interface';
import { NgIcon } from '@ng-icons/core';
import { NgFor, NgIf } from '@angular/common';
import { MatTooltip } from '@angular/material/tooltip';

@Component({
    selector: 'app-view-lpo',
    templateUrl: './view-lpo.component.html',
    styleUrls: ['./view-lpo.component.css'],
    imports: [NgIcon, NgFor, MatTooltip, NgIf]
})
export class ViewLpoComponent {

  progress: number = 0;
  isUploading: boolean = false;
  removingFileIndex: number | null = null;

  constructor(
    private dialogRef: MatDialogRef<ViewCommentComponent>,
    @Inject(MAT_DIALOG_DATA) public data: Quotatation,
    private _enquiryService: EnquiryService,
    private toast: ToastrService,
    private _quotationService: QuotationService
  ) {
    this.dialogRef.backdropClick().subscribe(() => {
      this.onClose();
    });
  }

  onClose() {
    this.dialogRef.close(this.data)
  }

  onDownloadClicks(file: any) {
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
            this.toast.warning('Sorry, The requested file was not found on the server. Please ensure that the file exists and try again.')
          }
        }
      })
  }

  onFileRemoved(index: number) {
    this.removingFileIndex = index;
    this._quotationService.removeLpo(this.data.lpoFiles[index].fileName, this.data._id as string)
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.data.lpoFiles.splice(index, 1)
            if (this.data.lpoFiles.length == 0) {
              this.onClose()
            }
          }
        },
        complete: () => {
          this.removingFileIndex = null;
        }
      })
  }

  onUploadLpo(event: any) {
    let files = event.target.files
    if (files.length) {
      this.isUploading = true
      let formData = new FormData();
      formData.append('quoteId', this.data._id as string)
      for (let i = 0; i < files.length; i++) {
        formData.append('files', files[i] as Blob)
      }
      this._quotationService.uploadLpo(formData).subscribe((quote: Quotatation) => {
        if (quote) {
          this.isUploading = false
          this.data.lpoFiles = quote.lpoFiles
        }
      })
    }
  }

  clearProgress() {
    setTimeout(() => {
      this.progress = 0
    }, 1000)
  }
}
