import { CommonModule } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { TechnicalService } from 'src/app/core/services/technical.service';
import { PurchaseService } from 'src/app/core/services/purchase/purchase.service';
import { NgIcon } from '@ng-icons/core';
import { NumberFormatterPipe } from 'src/app/shared/pipes/numFormatter.pipe';
import { ToastrService } from 'ngx-toastr';
import { v4 as uuidv4 } from 'uuid';
import { FileService } from 'src/app/core/services/file.service';
import { HttpEventType } from '@angular/common/http';

interface MaterialRequest {
  itemName: string;
  quantity: number;
  estimatedCost: number;
  requiredOn: Date;
  remarks: string;
  status?: 'pending' | 'approved' | 'rejected';
}

@Component({
  selector: 'app-material-request-modal',
  imports: [
    CommonModule,
    NgIcon,
    NumberFormatterPipe
  ],
  templateUrl: './material-request-modal.component.html',
  styleUrl: './material-request-modal.component.css'
})
export class MaterialRequestModalComponent implements OnInit {
  private dialogRef = inject(MatDialogRef<MaterialRequestModalComponent>);
  private data = inject(MAT_DIALOG_DATA);
  private technicalService = inject(TechnicalService);
  private purchaseService = inject(PurchaseService);
  private toaster = inject(ToastrService);

  purchaseId!: string;
  currentItems: any[] = [];
  materialRequests: MaterialRequest[] = [];
  selectedRequests = new Set<number>();
  alreadyAddedRequests = new Set<number>();
  loading = false;
  saving = false;
  onDataChange?: () => void;
  materialRequestFiles: Array<{ fileName: string; originalname: string; status?: 'pending' | 'approved' | 'rejected' }> = [];
  private fileService = inject(FileService);

  ngOnInit(): void {
    this.purchaseId = this.data.purchaseId || '';
    this.onDataChange = this.data.onDataChange;
    if (this.purchaseId) {
      this.loadPurchaseData();
    }
    this.loadMaterialRequests();
  }

  loadPurchaseData(): void {
    this.purchaseService.getPurchaseById(this.purchaseId).subscribe({
      next: (res) => {
        if (res.data?.items) {
          this.currentItems = res.data.items || [];
          this.checkAlreadyAddedItems();
        }
      },
      error: (error) => {
        console.error('Error loading purchase data:', error);
      }
    });
  }

  loadMaterialRequests(): void {
    this.loading = true;
    const jobId = this.data.jobId;
    
    this.technicalService.getMaterialRequestByJobId(jobId).subscribe({
      next: (res) => {
        this.loading = false;
        if (res.success && res.data) {
          // Filter to show only approved material requests
          const allRequests = res.data || [];
          this.materialRequests = allRequests.filter((request: MaterialRequest) => 
            request.status === 'approved'
          );
          console.log(this.materialRequests);
          this.checkAlreadyAddedItems();
        }
        if (res.success && res.files) {
          // Filter to show only approved files
          const allFiles = res.files || [];
          this.materialRequestFiles = allFiles.filter((file: { status?: 'pending' | 'approved' | 'rejected' }) => 
            file.status === 'approved'
          );
        }
      },
      error: (error) => {
        this.loading = false;
        console.error('Error fetching material requests:', error);
      }
    });
  }

  checkAlreadyAddedItems(): void {
    this.alreadyAddedRequests.clear();
    
    this.materialRequests.forEach((request, index) => {
      const isAlreadyAdded = this.currentItems.some((item: any) => {
        return item.itemName === request.itemName && 
               item.itemDetails?.some((detail: any) => 
                 detail.detail === request.itemName &&
                 detail.quantity === request.quantity &&
                 detail.unitCost === request.estimatedCost &&
                 detail.fromMrRequest === true
               );
      });
      
      if (isAlreadyAdded) {
        this.alreadyAddedRequests.add(index);
      }
    });
  }

  toggleSelection(index: number): void {
    if (this.alreadyAddedRequests.has(index)) {
      return;
    }
    
    if (this.selectedRequests.has(index)) {
      this.selectedRequests.delete(index);
    } else {
      this.selectedRequests.add(index);
    }
  }

  toggleAllSelection(): void {
    const availableItems = this.materialRequests
      .map((_, index) => index)
      .filter(index => !this.alreadyAddedRequests.has(index));
    
    if (this.selectedRequests.size === availableItems.length) {
      this.selectedRequests.clear();
    } else {
      availableItems.forEach(index => this.selectedRequests.add(index));
    }
  }

  isAlreadyAdded(index: number): boolean {
    return this.alreadyAddedRequests.has(index);
  }

  isSelectable(index: number): boolean {
    return !this.alreadyAddedRequests.has(index);
  }

  getAvailableItemsCount(): number {
    return this.materialRequests.length - this.alreadyAddedRequests.size;
  }

  getTotalSelectedCost(): number {
    let total = 0;
    this.selectedRequests.forEach(index => {
      const request = this.materialRequests[index];
      total += request.quantity * request.estimatedCost;
    });
    return total;
  }

  addSelectedToItems(): void {
    if (!this.purchaseId) {
      this.toaster.error('Purchase ID is required');
      return;
    }

    const selectedItems = Array.from(this.selectedRequests).map(index => {
      const request = this.materialRequests[index];
      return {
        itemName: request.itemName,
        itemDetails: [{
          _id: this.generateId(),
          detail: request.itemName,
          quantity: request.quantity,
          unitCost: request.estimatedCost,
          availability: '',
          supplierName: '',
          email: '',
          phoneNo: '',
          dealSelected: false,
          remarks: request.remarks,
          fromMrRequest: true
        }]
      };
    });

    const mergedItems = [...this.currentItems, ...selectedItems];
    this.saving = true;

    this.purchaseService.updatePurchaseItems(this.purchaseId, mergedItems).subscribe({
      next: (res) => {
        if (res.success) {
          this.saving = false;
          this.toaster.success(`${selectedItems.length} item(s) added successfully`);
          this.dialogRef.close({ success: true });
        }
      },
      error: (error) => {
        this.saving = false;
        console.error('Error adding items:', error);
        this.toaster.error('Failed to add items');
      }
    });
  }

  revokeMrItem(index: number): void {
    if (!this.purchaseId) {
      this.toaster.error('Purchase ID is required');
      return;
    }

    const request = this.materialRequests[index];
    if (!request) {
      return;
    }

    const updatedItems = this.currentItems.map((item: any) => {
      if (item.itemName === request.itemName) {
        const updatedDetails = (item.itemDetails || []).filter((detail: any) => 
          !(detail.detail === request.itemName &&
            detail.quantity === request.quantity &&
            detail.unitCost === request.estimatedCost &&
            detail.fromMrRequest === true)
        );
        
        if (updatedDetails.length === 0) {
          return null;
        }
        
        return {
          ...item,
          itemDetails: updatedDetails
        };
      }
      return item;
    }).filter((item: any) => item !== null);

    this.purchaseService.updatePurchaseItems(this.purchaseId, updatedItems).subscribe({
      next: (res) => {
        if (res.success) {
          this.toaster.success('MR request item revoked successfully');
          this.loadPurchaseData();
          if (this.onDataChange) {
            this.onDataChange();
          }
        }
      },
      error: (error) => {
        console.error('Error revoking MR item:', error);
        this.toaster.error('Failed to revoke MR request item');
      }
    });
  }

  onClose(): void {
    this.dialogRef.close({ success: false });
  }

  generateId(): string {
    return uuidv4();
  }

  downloadFile(file: { fileName: string; originalname: string }): void {
    this.fileService.downloadFileWithProgress(
      file.fileName,
      file.originalname,
      (progress: number) => {
        console.log(`Download progress: ${progress}%`);
      },
      (error: any) => {
        console.error('Download failed:', error);
        this.toaster.error('Failed to download file');
      }
    );
  }

  viewFile(file: { fileName: string; originalname: string }): void {
    if (!file.fileName) {
      this.toaster.warning('File not available for viewing');
      return;
    }

    if (!file.originalname.toLowerCase().endsWith('.pdf')) {
      this.toaster.warning('Only PDF files can be viewed. Please download the file to view.');
      return;
    }

    this.fileService.downloadFile(file.fileName).subscribe({
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
          this.toaster.warning('File not found on the server');
        } else {
          this.toaster.error('Failed to view file');
        }
      }
    });
  }
}
