import { CommonModule } from '@angular/common';
import { Component, Inject, OnInit, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { ToastrService } from 'ngx-toastr';
import { ModalLayoutComponent } from 'src/app/shared/components/modal-layout/modal-layout.component';
import { DeliveryNoteService } from 'src/app/core/services/delivery-note/delivery-note.service';

export interface ViewDnDetailsModalData {
  dnId: string;
}

@Component({
  selector: 'app-view-dn-details-modal',
  standalone: true,
  imports: [CommonModule, ModalLayoutComponent],
  templateUrl: './view-dn-details-modal.component.html',
  styleUrls: ['./view-dn-details-modal.component.css']
})
export class ViewDnDetailsModalComponent implements OnInit {
  dn: any = null;
  isLoading = signal<boolean>(true);

  constructor(
    public dialogRef: MatDialogRef<ViewDnDetailsModalComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ViewDnDetailsModalData,
    private deliveryNoteService: DeliveryNoteService,
    private toastr: ToastrService
  ) {}

  ngOnInit(): void {
    this.loadDn();
  }

  loadDn(): void {
    this.isLoading.set(true);
    this.deliveryNoteService.getDnById(this.data.dnId).subscribe({
      next: (response: any) => {
        this.dn = response?.data || response;
        this.isLoading.set(false);
      },
      error: (error: any) => {
        console.error('Error fetching DN details:', error);
        this.toastr.error('Failed to load DN details');
        this.isLoading.set(false);
      }
    });
  }

  onClose(): void {
    this.dialogRef.close();
  }

  formatDate(date: any): string {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }
}
