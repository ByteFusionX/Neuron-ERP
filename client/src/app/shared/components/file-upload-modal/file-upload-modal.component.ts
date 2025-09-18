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
  imports: [CommonModule, NgIconsModule, MatTooltipModule, FormsModule],
  providers: [appFileValidator]
})
export class FileUploadModalComponent implements OnInit {
  @ViewChild('fileInput') fileInput!: ElementRef;

  files: FileItem[] = [];
  selectedFiles: File[] = [];
  isDragging = false;
  isUploading = false;
  uploadProgress = 0;
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
      this.files = [...this.data.existingFiles.map(file => ({ ...file, isUploaded: true }))];
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

    // Auto-upload if there are valid files and upload is enabled
    if (validFiles.length > 0 && this.data.showActions?.upload) {
      this.selectedFiles = validFiles;
      this.onUpload();
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

  onUpload() {
    if (this.selectedFiles.length === 0) {
      this.fileError = true;
      this.errorMessage = 'Please select at least one file to upload';
      return;
    }

    this.isUploading = true;
    this.uploadProgress = 0;

    // Create FormData
    const formData = new FormData();
    this.selectedFiles.forEach(file => {
      formData.append('files', file);
    });

    // For now, simulate upload progress and complete
    // This would be replaced with actual file upload service call
    const interval = setInterval(() => {
      this.uploadProgress += 10;
      if (this.uploadProgress >= 100) {
        clearInterval(interval);
        this.completeUpload();
      }
    }, 200);

    // TODO: Replace simulation with actual upload service
    // Example real implementation:
    // this.fileUploadService.uploadFiles(formData).subscribe({
    //   next: (event) => {
    //     if (event.type === HttpEventType.UploadProgress) {
    //       this.uploadProgress = Math.round(100 * event.loaded / event.total);
    //     } else if (event.type === HttpEventType.Response) {
    //       this.completeUpload(event.body.files);
    //     }
    //   },
    //   error: (error) => {
    //     this.isUploading = false;
    //     this.uploadProgress = 0;
    //     this.toast.error('Upload failed: ' + error.message);
    //   }
    // });
  }

  private completeUpload() {
    // Mark files as uploaded and generate file names
    this.files.forEach(file => {
      if (!file.isUploaded) {
        file.isUploaded = true;
        file.fileName = `upload_${Date.now()}_${file.originalname}`;
      }
    });

    this.selectedFiles = [];
    this.isUploading = false;
    this.uploadProgress = 0;
    this.toast.success('Files uploaded successfully');
    
    if (this.fileInput) {
      this.fileInput.nativeElement.value = '';
    }
  }

  onSave() {
    const uploadedFiles = this.files.filter(f => f.isUploaded);
    this.dialogRef.close({ files: uploadedFiles, action: 'save' });
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

  hasUploadingFiles(): boolean {
    return this.isUploading;
  }
}
