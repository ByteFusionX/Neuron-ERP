import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { NgIconsModule } from '@ng-icons/core';
import { FileService } from '../../../core/services/file.service';
import { HttpEventType } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { ModalLayoutComponent } from '../modal-layout/modal-layout.component';

export interface AttachmentData {
  fileName: string;
  originalname: string;
}

export interface AttachmentDialogData {
  attachments: AttachmentData[];
  title?: string;
}

@Component({
  selector: 'app-attachements-dialog',
  imports: [CommonModule, NgIconsModule, ModalLayoutComponent],
  templateUrl: './attachements-dialog.component.html',
  styleUrl: './attachements-dialog.component.css',
})
export class AttachementsDialogComponent {
  constructor(
    public dialogRef: MatDialogRef<AttachementsDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: AttachmentDialogData,
    private fileService: FileService,
    private toast: ToastrService
  ) {
    // Set default title if not provided
    if (!this.data.title) {
      this.data.title = 'Attachments';
    }
  }

  onClose(): void {
    this.dialogRef.close();
  }

  onDownload(attachment: AttachmentData): void {
    this.fileService.downloadFile(
      attachment.fileName,
      attachment.originalname,
    );
  }

  onViewPDF(file: any) {
    // Check if the file is a PDF
    if (file.fileName && file.fileName.toLowerCase().endsWith('.pdf')) {

      this.fileService.downloadFile(file.fileName)
        .subscribe({
          next: (event) => {
            if (event.type === HttpEventType.Response) {
              const fileContent: Blob = new Blob([event['body']], { type: 'application/pdf' });

              const fileURL = URL.createObjectURL(fileContent);
              window.open(fileURL, '_blank');
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
      this.toast.warning('This file type is not supported for viewing. Please download and view the file.');
    }
  }


  getFileExtension(filename: string): string {
    return filename.split('.').pop()?.toLowerCase() || '';
  }

  getFileIcon(filename: string): string {
    const extension = this.getFileExtension(filename);
    switch (extension) {
      case 'pdf':
        return 'heroDocument';
      case 'doc':
      case 'docx':
        return 'heroDocumentText';
      case 'xls':
      case 'xlsx':
        return 'heroDocumentChartBar';
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'gif':
        return 'heroPhoto';
      case 'zip':
      case 'rar':
        return 'heroRectangleStack';
      default:
        return 'heroDocument';
    }
  }

  isPdfFile(filename: string): boolean {
    return this.getFileExtension(filename) === 'pdf';
  }

  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  trackByFileName(index: number, attachment: AttachmentData): string {
    return attachment.fileName;
  }
}
