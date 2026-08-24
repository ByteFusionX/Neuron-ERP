import { Component, ElementRef, Inject, OnInit, ViewChild } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { CommonModule } from '@angular/common';
import { NgIconsModule } from '@ng-icons/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { HttpEventType } from '@angular/common/http';
import { saveAs } from 'file-saver';
import { EnquiryService } from '../../../core/services/enquiry/enquiry.service';
import { appFileValidator } from '../../directives/file-validator.directive';
import { ModalLayoutComponent } from '../modal-layout/modal-layout.component';

export interface FileItem {
  fileName: string;
  originalname: string;
  file?: File;
  isUploaded?: boolean;
}

export interface FileUploadModalData {
  title: string;
  existingFiles?: FileItem[];
  allowMultiple?: boolean;
  acceptedTypes?: string;
  maxFileSize?: number;
  showActions?: {
    upload?: boolean;
    download?: boolean;
    view?: boolean;
    delete?: boolean;
  };
}

@Component({
  selector: 'app-file-upload-modal',
  templateUrl: './file-upload-modal.component.html',
  styleUrls: ['./file-upload-modal.component.css'],
  standalone: true,
  imports: [CommonModule, NgIconsModule, MatTooltipModule, FormsModule, ModalLayoutComponent],
  providers: [appFileValidator]
})
export class FileUploadModalComponent implements OnInit {
  @ViewChild('fileInput') fileInput!: ElementRef;

  files: FileItem[] = [];
  selectedFiles: File[] = [];
  isDragging = false;
  fileError = false;
  errorMessage = '';

  defaultConfig: FileUploadModalData = {
    title: 'File Manager',
    allowMultiple: true,
    acceptedTypes: '.pdf,.png,.jpg,.jpeg,.doc,.docx,.xlsx,.msg,.dwg',
    maxFileSize: 10 * 1024 * 1024, // 10MB
    showActions: {
      upload: true,
      download: true,
      view: true,
      delete: true
    }
  };

  constructor(
    public dialogRef: MatDialogRef<FileUploadModalComponent>,
    @Inject(MAT_DIALOG_DATA) public data: FileUploadModalData,
    private toast: ToastrService,
    private enquiryService: EnquiryService
  ) {
    this.data = { ...this.defaultConfig, ...this.data };
  }

  ngOnInit(): void {
    if (this.data.existingFiles) {
      this.files = [...this.data.existingFiles.map(file => ({ ...file, isUploaded: file.isUploaded ?? true }))];
    }
  }

  onClose() {
    this.dialogRef.close();
  }

  onFileSelected(event: any) {
    const files = event.target.files;
    this.handleFiles(files);
  }

  handleFiles(fileList: FileList) {
    this.fileError = false;
    this.errorMessage = '';

    const validFiles: File[] = [];

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      
      // Check file size
      if (this.data.maxFileSize && file.size > this.data.maxFileSize) {
        this.toast.warning(`File "${file.name}" exceeds maximum size limit of ${this.formatFileSize(this.data.maxFileSize)}`);
        continue;
      }

      // Check if file already exists
      const exists = this.files.some(f => f.originalname === file.name);
      if (exists) {
        this.toast.warning(`File "${file.name}" already exists`);
        continue;
      }

      // Add to files list
      this.files.push({
        fileName: '',
        originalname: file.name,
        file: file,
        isUploaded: false
      });

      validFiles.push(file);
    }

    // Store selected files for later upload
    if (validFiles.length > 0) {
      this.selectedFiles = [...this.selectedFiles, ...validFiles];
    }
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = true;
  }

  onDragLeave(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = false;
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = false;

    if (event.dataTransfer?.files) {
      this.handleFiles(event.dataTransfer.files);
    }
  }

  triggerFileInput() {
    this.fileInput.nativeElement.click();
  }

  onRemoveFile(index: number) {
    const file = this.files[index];
    if (file.isUploaded) {
      // Show confirmation for uploaded files
      if (confirm(`Are you sure you want to delete "${file.originalname}"?`)) {
        this.files.splice(index, 1);
      }
    } else {
      // Remove from pending uploads
      this.files.splice(index, 1);
      const fileIndex = this.selectedFiles.findIndex(f => f.name === file.originalname);
      if (fileIndex > -1) {
        this.selectedFiles.splice(fileIndex, 1);
      }
    }
    
    if (this.fileInput) {
      this.fileInput.nativeElement.value = '';
    }
  }

  onDownload(file: FileItem) {
    if (!file.fileName) {
      this.toast.error('File not available for download');
      return;
    }

    this.enquiryService.downloadFile(file.fileName).subscribe({
      next: (event) => {
        if (event.type === HttpEventType.DownloadProgress) {
          // Handle download progress if needed
        } else if (event.type === HttpEventType.Response) {
          const fileContent: Blob = new Blob([event.body]);
          saveAs(fileContent, file.originalname);
        }
      },
      error: (error) => {
        if (error.status === 404) {
          this.toast.warning('Sorry, the requested file was not found on the server.');
        } else {
          this.toast.error('An error occurred while downloading the file.');
        }
      }
    });
  }

  onView(file: FileItem) {
    // Local file that hasn't been uploaded to the server/cloud yet - preview it directly from the browser.
    if (!file.isUploaded && file.file) {
      if (!this.isPDF(file.originalname) && !this.isImage(file.originalname)) {
        this.toast.warning('This file type is not supported for viewing. Please download and view the file.');
        return;
      }
      const fileURL = URL.createObjectURL(file.file);
      window.open(fileURL, '_blank');
      setTimeout(() => {
        URL.revokeObjectURL(fileURL);
      }, 10000);
      return;
    }

    if (!file.fileName) {
      this.toast.error('File not available for viewing');
      return;
    }

    // Check if file is viewable (PDF)
    if (!file.originalname.toLowerCase().endsWith('.pdf')) {
      this.toast.warning('This file type is not supported for viewing. Please download and view the file.');
      return;
    }

    this.enquiryService.downloadFile(file.fileName).subscribe({
      next: (event) => {
        if (event.type === HttpEventType.Response) {
          const fileContent: Blob = new Blob([event.body], { type: 'application/pdf' });
          const fileURL = URL.createObjectURL(fileContent);
          window.open(fileURL, '_blank');
          
          setTimeout(() => {
            URL.revokeObjectURL(fileURL);
          }, 10000);
        }
      },
      error: (error) => {
        if (error.status === 404) {
          this.toast.warning('Sorry, the requested file was not found on the server.');
        } else {
          this.toast.error('An error occurred while trying to view the file.');
        }
      }
    });
  }


  onSave() {
    // Return files with File objects for new uploads, and metadata for existing files
    const filesToReturn = this.files.map(file => {
      // If file has a File object, it's a new file that needs to be uploaded
      if (file.file) {
        return {
          fileName: file.fileName || '',
          originalname: file.originalname,
          file: file.file,
          isUploaded: false
        };
      }
      
      // Existing uploaded file (from existingFiles) - return metadata only
      return {
        fileName: file.fileName,
        originalname: file.originalname,
        isUploaded: true
      };
    });
    this.dialogRef.close({ files: filesToReturn, action: 'save' });
  }

  onCancel() {
    this.dialogRef.close({ action: 'cancel' });
  }

  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  getFileIcon(filename: string): string {
    const extension = filename.toLowerCase().split('.').pop();
    switch (extension) {
      case 'pdf': return 'heroDocumentText';
      case 'doc':
      case 'docx': return 'heroDocument';
      case 'xlsx':
      case 'xls': return 'heroTableCells';
      case 'jpg':
      case 'jpeg':
      case 'png': return 'heroPhoto';
      default: return 'heroDocumentText';
    }
  }

  isPDF(filename: string): boolean {
    return filename.toLowerCase().endsWith('.pdf');
  }

  isImage(filename: string): boolean {
    return /\.(png|jpe?g|gif|webp)$/i.test(filename);
  }
}
