import { Component } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { FileUploadModalComponent, FileUploadModalData } from './file-upload-modal.component';

/**
 * Example usage of FileUploadModalComponent
 * 
 * This component demonstrates different ways to use the file upload modal:
 * 1. Basic file upload with all features enabled
 * 2. View-only mode for existing files
 * 3. Upload mode with specific file restrictions
 */
@Component({
  selector: 'app-file-upload-example',
  template: `
    <div class="p-6 space-y-4">
      <h2 class="text-lg font-bold">File Upload Modal Examples</h2>
      
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <!-- Example 1: Full Featured Upload -->
        <button 
          (click)="openFullFeaturedModal()"
          class="bg-violet-600 text-white px-4 py-2 rounded hover:bg-violet-700">
          Full Featured Upload
        </button>
        
        <!-- Example 2: View Only Mode -->
        <button 
          (click)="openViewOnlyModal()"
          class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
          View Only Mode
        </button>
        
        <!-- Example 3: PDF Only Upload -->
        <button 
          (click)="openPDFOnlyModal()"
          class="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700">
          PDF Only Upload
        </button>
      </div>
    </div>
  `
})
export class FileUploadExampleComponent {
  
  constructor(private dialog: MatDialog) {}

  /**
   * Example 1: Full featured file upload modal
   * - All file types accepted
   * - All actions enabled (upload, download, view, delete)
   * - Multiple files allowed
   * - Auto-upload on selection
   */
  openFullFeaturedModal() {
    const modalData: FileUploadModalData = {
      title: 'Upload Documents',
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

    const dialogRef = this.dialog.open(FileUploadModalComponent, {
      data: modalData,
      width: '800px',
      maxHeight: '90vh'
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result && result.action === 'save') {
        console.log('Uploaded files:', result.files);
        // Handle the uploaded files here
        this.handleUploadedFiles(result.files);
      }
    });
  }

  /**
   * Example 2: View-only modal for existing files
   * - Shows existing files
   * - Only download and view actions enabled
   * - No upload functionality
   */
  openViewOnlyModal() {
    // Mock existing files data
    const existingFiles = [
      {
        fileName: 'document1.pdf',
        originalname: 'Project Proposal.pdf'
      },
      {
        fileName: 'image1.jpg',
        originalname: 'screenshot.jpg'
      },
      {
        fileName: 'excel1.xlsx',
        originalname: 'budget_report.xlsx'
      }
    ];

    const modalData: FileUploadModalData = {
      title: 'View Documents',
      existingFiles: existingFiles,
      allowMultiple: false,
      showActions: {
        upload: false,
        download: true,
        view: true,
        delete: false
      }
    };

    const dialogRef = this.dialog.open(FileUploadModalComponent, {
      data: modalData,
      width: '800px',
      maxHeight: '90vh'
    });

    dialogRef.afterClosed().subscribe(result => {
      console.log('View modal closed');
    });
  }

  /**
   * Example 3: PDF-only upload modal
   * - Only PDF files accepted
   * - Single file upload
   * - Smaller file size limit
   */
  openPDFOnlyModal() {
    const modalData: FileUploadModalData = {
      title: 'Upload PDF Document',
      allowMultiple: false,
      acceptedTypes: '.pdf',
      maxFileSize: 5 * 1024 * 1024, // 5MB
      showActions: {
        upload: true,
        download: true,
        view: true,
        delete: true
      }
    };

    const dialogRef = this.dialog.open(FileUploadModalComponent, {
      data: modalData,
      width: '600px',
      maxHeight: '80vh'
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result && result.action === 'save') {
        console.log('PDF uploaded:', result.files);
        // Handle the PDF file
        this.handlePDFUpload(result.files[0]);
      }
    });
  }

  /**
   * Handle uploaded files - implement your business logic here
   */
  private handleUploadedFiles(files: any[]) {
    console.log('Processing uploaded files:', files);
    
    // Example: Send files to server
    files.forEach(file => {
      console.log(`Processing file: ${file.originalname}`);
      // Add your file processing logic here
      // this.fileService.processFile(file);
    });
  }

  /**
   * Handle PDF upload - implement your business logic here
   */
  private handlePDFUpload(file: any) {
    console.log('Processing PDF file:', file);
    
    // Example: Process PDF specifically
    // this.pdfService.processPDF(file);
  }
}

/**
 * Usage in other components:
 * 
 * 1. Import the component:
 *    import { FileUploadModalComponent, FileUploadModalData } from 'path/to/file-upload-modal.component';
 * 
 * 2. Inject MatDialog in constructor:
 *    constructor(private dialog: MatDialog) {}
 * 
 * 3. Create modal data configuration:
 *    const modalData: FileUploadModalData = {
 *      title: 'Your Modal Title',
 *      allowMultiple: true,
 *      acceptedTypes: '.pdf,.jpg,.png',
 *      showActions: {
 *        upload: true,
 *        download: true,
 *        view: true,
 *        delete: true
 *      }
 *    };
 * 
 * 4. Open the modal:
 *    const dialogRef = this.dialog.open(FileUploadModalComponent, {
 *      data: modalData,
 *      width: '800px'
 *    });
 * 
 * 5. Handle the result:
 *    dialogRef.afterClosed().subscribe(result => {
 *      if (result && result.action === 'save') {
 *        // Process the uploaded files
 *        console.log('Files:', result.files);
 *      }
 *    });
 * 
 * Features:
 * - Auto-upload on file selection (no separate upload button needed)
 * - Drag and drop support
 * - File type validation
 * - File size validation
 * - View PDF files in new tab
 * - Download files
 * - Delete files with confirmation
 * - Progress indication during upload
 * - Responsive design
 * - Follows application theme
 */
