import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { ToastrService } from 'ngx-toastr';
import { DeliveryNoteService } from 'src/app/core/services/delivery-note/delivery-note.service';
import { DeliveryNote } from 'src/app/shared/interfaces/delivery-note.interface';
import { IconsModule } from 'src/app/lib/icons/icons.module';
import { ButtonComponent } from 'src/app/shared/components/button/button.component';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { PdfPreviewComponent } from 'src/app/shared/components/pdf-preview/pdf-preview.component';
import { RejectDnItemsModalComponent, RejectDnItemsModalResult } from 'src/app/shared/components/reject-dn-items-modal/reject-dn-items-modal.component';

@Component({
  selector: 'app-delivery-note-view',
  standalone: true,
  imports: [CommonModule, IconsModule, ButtonComponent],
  templateUrl: './delivery-note-view.component.html',
  styleUrl: './delivery-note-view.component.css'
})
export class DeliveryNoteViewComponent implements OnInit {
  private dnService = inject(DeliveryNoteService);
  private notificationService = inject(ToastrService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private dialog = inject(MatDialog);

  deliveryNote: DeliveryNote | null = null;
  deliveryItems: any[] = [];
  isLoading = true;
  isCancelling = false;
  isRejecting = false;

  constructor() {
    this.loadDeliveryNote();
  }

  ngOnInit(): void {
  }

  loadDeliveryNote() {
    const dnId = this.route.snapshot.paramMap.get('id');
    if (!dnId) {
      this.notificationService.error('Invalid Delivery Note ID');
      this.router.navigate(['/dispatch/delivery-note-register']);
      return;
    }

    this.dnService.getDnById(dnId).subscribe({
      next: (response) => {
        this.deliveryNote = response;
        this.deliveryItems = (response.items || []).filter((item: any) => 
          item.currentDeliveryQty > 0
        );
        console.log('DN Loaded. Items with Serial Numbers:', this.deliveryItems.map((item: any) => ({
          partNo: item.partNo,
          serialNos: item.serialNos,
          serialNosType: Array.isArray(item.serialNos) ? 'Array' : typeof item.serialNos
        })));
        this.isLoading = false;
      },
      error: (error) => {
        this.notificationService.error('Failed to load delivery note details');
        console.error('Error loading delivery note:', error);
        this.isLoading = false;
        this.router.navigate(['/dispatch/delivery-note-register']);
      }
    });
  }

  onEdit() {
    if (!this.deliveryNote) return;
    this.router.navigate(['/dispatch/delivery-note-register/create'], { 
      queryParams: { id: this.deliveryNote._id } 
    });
  }

  onCancel() {
    if (!this.deliveryNote) return;



    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        title: 'Cancel Delivery Note',
        description: 'Are you sure you want to cancel this delivery note? This action cannot be undone.',
        icon: 'heroExclamationCircle',
        IconColor: 'orange'
      }
    });

    dialogRef.afterClosed().subscribe((result: boolean) => {
      if (result && this.deliveryNote?._id) {
        this.isCancelling = true;
        this.dnService.cancelDn(this.deliveryNote._id).subscribe({
          next: () => {
            this.notificationService.success('Delivery Note cancelled successfully');
            this.router.navigate(['/dispatch/delivery-note-register']);
          },
          error: (error) => {
            this.notificationService.error(error.error?.message || 'Failed to cancel delivery note');
            this.isCancelling = false;
          }
        });
      }
    });
  }

  canReject(): boolean {
    if (!this.deliveryNote) return false;
    return this.deliveryNote.status === 'Delivered' || this.deliveryNote.status === 'Partially Rejected';
  }

  onReject() {
    if (!this.deliveryNote?._id) return;

    const modalItems = this.deliveryItems.map((item: any) => ({
      itemId: item.itemId,
      description: item.description,
      partNo: item.partNo,
      deliveredQty: item.deliveredQty || 0,
      rejectedQty: item.rejectedQty || 0
    }));

    const dialogRef = this.dialog.open(RejectDnItemsModalComponent, {
      width: '900px',
      maxHeight: '90vh',
      data: { items: modalItems }
    });

    dialogRef.afterClosed().subscribe((result: RejectDnItemsModalResult | null) => {
      if (!result || !this.deliveryNote?._id) return;

      this.isRejecting = true;
      this.dnService.rejectDnItems(this.deliveryNote._id, result).subscribe({
        next: (response) => {
          this.notificationService.success('Delivery Note items rejected successfully');
          if (response?.warnings?.length) {
            response.warnings.forEach((warning: string) => this.notificationService.warning(warning, '', { timeOut: 6000 }));
          }
          this.isRejecting = false;
          this.loadDeliveryNote();
        },
        error: (error) => {
          this.notificationService.error(error.error?.message || 'Failed to reject delivery note items');
          this.isRejecting = false;
        }
      });
    });
  }

  getStatusClass(status: string): string {
    switch (status) {
      case 'Draft':
        return 'bg-gray-100 text-gray-800';
      case 'Delivered':
        return 'bg-green-100 text-green-800';
      case 'Partially Delivered':
        return 'bg-yellow-100 text-yellow-800';
      case 'Cancelled':
        return 'bg-red-100 text-red-800';
      case 'Rejected':
      case 'Partially Rejected':
        return 'bg-orange-100 text-orange-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  }

  getItemStatusClass(status: string): string {
    switch (status) {
      case 'Delivered':
        return 'bg-green-100 text-green-800';
      case 'Pending':
      case 'Partially Delivered':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  }

  onBack() {
    this.router.navigate(['/dispatch/delivery-note-register']);
  }

  async onPreview() {
    if (!this.deliveryNote) return;

    try {
      const pdfDoc = await this.dnService.generatePDF(this.deliveryNote, true);
      pdfDoc.getBlob((blob: Blob) => {
        const url = window.URL.createObjectURL(blob);
        this.dialog.open(PdfPreviewComponent, {
          height: '90vh',
          maxWidth: '1200px',
          data: {
            url: url,
            formatedQuote: this.deliveryNote,
            type: 'delivery-note'
          }
        });
      });
    } catch (error) {
      console.error('Error generating PDF:', error);
      this.notificationService.error('Failed to generate PDF preview');
    }
  }
}
