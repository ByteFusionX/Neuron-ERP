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
  isLoading = true;
  isCancelling = false;

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
    // Navigate to edit page when implemented
    this.notificationService.info('Edit functionality will be implemented');
    // this.router.navigate(['/dispatch/edit-dn', this.deliveryNote._id]);
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

  getStatusClass(status: string): string {
    switch (status) {
      case 'Generated':
        return 'bg-blue-100 text-blue-800';
      case 'Delivered':
        return 'bg-green-100 text-green-800';
      case 'Partially Delivered':
        return 'bg-yellow-100 text-yellow-800';
      case 'Cancelled':
        return 'bg-red-100 text-red-800';
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
}
