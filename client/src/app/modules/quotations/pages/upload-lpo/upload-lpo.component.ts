import { ChangeDetectionStrategy, Component, ElementRef, Inject, OnInit, ViewChild, ViewEncapsulation } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { fileEnterState } from '../../../enquirys/enquiry-animations';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { Observable } from 'rxjs';
import { getEmployee } from 'src/app/shared/interfaces/employee.interface';
import { QuotationService } from 'src/app/core/services/quotation/quotation.service';
import { Quotatation } from 'src/app/shared/interfaces/quotation.interface';
import { LoadingBarService } from '@ngx-loading-bar/core';
import { DealFormComponent } from '../deal-form/deal-form.component';
import { NgIcon } from '@ng-icons/core';
import { FormsModule } from '@angular/forms';
import { UploadFileComponent } from '../../../../shared/components/upload-file/upload-file.component';
import { NgIf } from '@angular/common';

@Component({
    selector: 'app-upload-lpo',
    templateUrl: './upload-lpo.component.html',
    styleUrls: ['./upload-lpo.component.css'],
    animations: [fileEnterState],
    encapsulation: ViewEncapsulation.None,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [NgIcon, FormsModule, UploadFileComponent, NgIf]
})
export class UploadLpoComponent {
  selectedFiles: File[] = []
  lpoFiles = [];

  error: boolean = false;
  isSaving: boolean = false;
  submit: boolean = false

  constructor(
    public dialogRef: MatDialogRef<UploadLpoComponent>,
    @Inject(MAT_DIALOG_DATA) public data: Quotatation,
    private _quoationService: QuotationService,
  ) { }

  onClose() {
    this.dialogRef.close()
  }


  onFileUpload(event: File[]) {
    this.selectedFiles = event
    if (this.selectedFiles.length) {
      this.error = false
    }
  }

  onSubmit() {

    this.submit = true;
    if (this.selectedFiles.length && this.data) {

      this.isSaving = true;
      let formData = new FormData();
      formData.append('quoteId', this.data._id as string)
      for (let i = 0; i < this.selectedFiles.length; i++) {
        formData.append('files', this.selectedFiles[i] as Blob)
      }
      this._quoationService.uploadLpo(formData).subscribe((quote: Quotatation) => {
        if (quote) {
          this.isSaving = false;
          this.dialogRef.close(quote)
        }

      })

    } else {
      this.error = true;
    }
  }

  onClear() {
    this.selectedFiles = []
  }
}
