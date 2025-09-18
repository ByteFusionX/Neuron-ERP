import { CommonModule } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { TechnicalService } from 'src/app/core/services/technical.service';
import { NgIcon } from '@ng-icons/core';
import { NumberFormatterPipe } from 'src/app/shared/pipes/numFormatter.pipe';
import { v4 as uuidv4 } from 'uuid';

interface MaterialRequest {
  itemName: string;
  quantity: number;
  estimatedCost: number;
  requiredOn: Date;
  remarks: string;
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

  materialRequests: MaterialRequest[] = [];
  selectedRequests = new Set<number>();
  alreadyAddedRequests = new Set<number>();
  loading = false;

  ngOnInit(): void {
    this.loadMaterialRequests();
    this.checkAlreadyAddedItems();
  }

  loadMaterialRequests(): void {
    this.loading = true;
    const jobId = this.data.jobId;
    
    this.technicalService.getMaterialRequestByJobId(jobId).subscribe({
      next: (res) => {
        this.loading = false;
        if (res.success && res.data) {
          this.materialRequests = res.data || [];
          this.checkAlreadyAddedItems();
        }
      },
      error: (error) => {
        this.loading = false;
        console.error('Error fetching material requests:', error);
      }
    });
  }

  checkAlreadyAddedItems(): void {
    const existingItems = this.data.existingItems || [];
    this.alreadyAddedRequests.clear();
    
    this.materialRequests.forEach((request, index) => {
      const isAlreadyAdded = existingItems.some((item: any) => {
        return item.itemName === request.itemName && 
               item.itemDetails?.some((detail: any) => 
                 detail.detail === request.itemName &&
                 detail.quantity === request.quantity &&
                 detail.unitCost === request.estimatedCost
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
    const selectedItems = Array.from(this.selectedRequests).map(index => {
      const request = this.materialRequests[index];
      return {
        itemName: request.itemName,
        itemDetails: [{
          _id: this.generateId(),
          detail: request.itemName,
          quantity: request.quantity,
          unitCost: request.estimatedCost,
          unitSellingPrice: request.estimatedCost,
          availability: '',
          supplierName: '',
          email: '',
          phoneNo: '',
          dealSelected: false,
          remarks: request.remarks
        }]
      };
    });

    this.dialogRef.close({ success: true, items: selectedItems });
  }

  onClose(): void {
    this.dialogRef.close({ success: false });
  }

  generateId(): string {
    return uuidv4();
  }
}
