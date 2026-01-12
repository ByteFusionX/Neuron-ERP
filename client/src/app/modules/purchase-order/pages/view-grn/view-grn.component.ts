import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { MatDialog } from '@angular/material/dialog';
import { GrnService } from 'src/app/core/services/grn/grn.service';
import { ButtonComponent } from 'src/app/shared/components/button/button.component';
import { IconsModule } from 'src/app/lib/icons/icons.module';
import { PdfPreviewComponent } from 'src/app/shared/components/pdf-preview/pdf-preview.component';

@Component({
  selector: 'app-view-grn',
  standalone: true,
  imports: [
    CommonModule,
    ButtonComponent,
    IconsModule
  ],
  templateUrl: './view-grn.component.html',
  styleUrl: './view-grn.component.css'
})
export class ViewGrnComponent implements OnInit {
  private grnService = inject(GrnService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private toastr = inject(ToastrService);
  private dialog = inject(MatDialog);

  grnId!: string;
  grn: any = null;
  isLoading = signal<boolean>(true);
  purchaseId: string = '';
  selectedItems = new Set<number>();
  isGenerating = signal<boolean>(false);

  ngOnInit(): void {
    this.grnId = <string>this.route.snapshot.paramMap.get('id');
    if (!this.grnId) {
      this.toastr.error('Invalid GRN ID');
      this.router.navigate(['/purchase-order/pending-approval']);
      return;
    }
    this.loadGRN();
  }

  loadGRN(): void {
    this.isLoading.set(true);
    this.grnService.getGRNById(this.grnId).subscribe({
      next: (response: any) => {
        if (response.success && response.data) {
          this.grn = response.data;
          this.purchaseId = this.grn.purchaseOrderId?._id || this.grn.purchaseOrderId || '';
          this.isLoading.set(false);
        } else {
          this.toastr.error('GRN not found');
          this.isLoading.set(false);
          this.router.navigate(['/purchase-order/pending-approval']);
        }
      },
      error: (error) => {
        this.toastr.error('Failed to load GRN details');
        console.error('Error loading GRN:', error);
        this.isLoading.set(false);
        this.router.navigate(['/purchase-order/pending-approval']);
      }
    });
  }


  onBack(): void {
    if (this.purchaseId) {
      this.router.navigate(['/purchase/initiate-lpo', this.purchaseId]);
    } else {
      this.router.navigate(['/purchase-order/pending-approval']);
    }
  }

  formatPartNumber(partNo: any): string {
    if (!partNo) return '-';
    if (typeof partNo === 'string') return partNo;
    if (partNo.partNo) return partNo.partNo;
    return '-';
  }

  formatDate(date: any): string {
    if (!date) return 'N/A';
    const d = new Date(date);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  formatEmployeeName(employee: any): string {
    if (!employee) return '';
    if (typeof employee === 'string') return employee;
    if (employee.firstName && employee.lastName) {
      return `${employee.firstName} ${employee.lastName}`;
    }
    if (employee.firstName) return employee.firstName;
    if (employee.lastName) return employee.lastName;
    return '';
  }

  toggleItemSelection(index: number): void {
    if (this.selectedItems.has(index)) {
      this.selectedItems.delete(index);
    } else {
      this.selectedItems.add(index);
    }
  }

  isItemSelected(index: number): boolean {
    return this.selectedItems.has(index);
  }

  hasSelectedItems(): boolean {
    return this.selectedItems.size > 0;
  }

  onGenerateReceipt(): void {
    if (!this.hasSelectedItems()) {
      this.toastr.warning('Please select items to generate receipt');
      return;
    }

    this.isGenerating.set(true);
    const selectedItemsData = Array.from(this.selectedItems).map(index => this.grn.items[index]);
    
    this.grnService.generateGRNReceiptPDF(this.grn, selectedItemsData).then((pdf) => {
      pdf.getBlob((blob: Blob) => {
        const url = window.URL.createObjectURL(blob);
        this.isGenerating.set(false);
        this.dialog.open(PdfPreviewComponent, {
          data: { url: url, formatedQuote: this.grn, type: 'grn' }
        });
      });
    }).catch((error) => {
      console.error('Error generating PDF:', error);
      this.toastr.error('Failed to generate GRN receipt');
      this.isGenerating.set(false);
    });
  }

  getCompanyName(): string {
    if (!this.grn) return '';
    return this.grn.purchaseOrderId?.purchaseId?.customerId?.companyName ||
           this.grn.purchaseOrderId?.quoteId?.client?.companyName ||
           this.grn.purchaseOrderId?.purchaseId?.jobId?.quoteId?.client?.companyName ||
           '';
  }
}
