import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
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
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { DetailViewBadge, DetailViewBreadcrumb, DetailViewShellComponent, DetailViewStat } from 'src/app/shared/components/detail-view-shell/detail-view-shell.component';
import { DetailSectionComponent } from 'src/app/shared/components/detail-panel/detail-section.component';
import { DetailFieldComponent } from 'src/app/shared/components/detail-panel/detail-field.component';
import { DetailBadgeComponent } from 'src/app/shared/components/detail-panel/detail-badge.component';
import { DetailTableComponent } from 'src/app/shared/components/detail-panel/detail-table.component';
import { DetailTableColumn } from 'src/app/shared/components/detail-panel/detail-panel.model';
import { SmartFormModule } from 'src/app/shared/components/smart-form';

@Component({
  selector: 'app-delivery-note-view',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    IconsModule,
    ButtonComponent,
    ActionButtonComponent,
    DetailViewShellComponent,
    DetailSectionComponent,
    DetailFieldComponent,
    DetailBadgeComponent,
    DetailTableComponent,
    SmartFormModule
  ],
  templateUrl: './delivery-note-view.component.html',
  styleUrl: './delivery-note-view.component.css'
})
export class DeliveryNoteViewComponent implements OnInit {
  private dnService = inject(DeliveryNoteService);
  private notificationService = inject(ToastrService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private dialog = inject(MatDialog);
  private fb = inject(FormBuilder);

  deliveryNote: DeliveryNote | null = null;
  deliveryItems: any[] = [];
  breadcrumbs: DetailViewBreadcrumb[] = [];
  badges: DetailViewBadge[] = [];
  stats: DetailViewStat[] = [];
  itemRows: Record<string, any>[] = [];
  readonly itemCols: DetailTableColumn[] = [
    { key: 'partNo', label: 'Part No' },
    { key: 'description', label: 'Description', wrap: true },
    { key: 'orderedQty', label: 'Ordered', type: 'number' },
    { key: 'deliveredQty', label: 'Previous', type: 'number' },
    { key: 'currentDeliveryQty', label: 'This DN', type: 'number' },
    { key: 'serialNos', label: 'Serial No(s)', wrap: true },
    { key: 'rejectedQty', label: 'Rejected', type: 'number' },
    { key: 'rejectionReason', label: 'Reason', wrap: true },
  ];
  isLoading = true;
  isCancelling = false;
  isRejecting = false;
  isSavingPod = false;

  podForm = this.fb.group({
    receivedBy: ['', Validators.required],
    receivedContactNo: [''],
    receivedDate: [new Date().toISOString().split('T')[0], Validators.required],
    remarks: [''],
    signatureName: ['']
  });

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
        this.rebuildView();
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
    return ['Ready for Dispatch', 'Dispatched', 'Delivered', 'Partially Rejected'].includes(this.deliveryNote.status);
  }

  onReject() {
    if (!this.deliveryNote?._id) return;

    const modalItems = this.deliveryItems.map((item: any) => ({
      itemId: item.itemId,
      description: item.description,
      partNo: item.partNo,
      deliveredQty: item.currentDeliveryQty || item.deliveredQty || 0,
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
      case 'Ready for Dispatch':
      case 'Dispatched':
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

  canCompletePod(): boolean {
    return !!this.deliveryNote && !['Draft', 'Cancelled', 'Rejected', 'Delivered'].includes(this.deliveryNote.status);
  }

  onCompletePod(): void {
    if (!this.deliveryNote?._id) return;
    if (this.podForm.invalid) {
      this.podForm.markAllAsTouched();
      return;
    }
    this.isSavingPod = true;
    this.dnService.completePod(this.deliveryNote._id, this.podForm.value).subscribe({
      next: () => {
        this.notificationService.success('POD captured. Delivery marked delivered.');
        this.isSavingPod = false;
        this.loadDeliveryNote();
      },
      error: (error) => {
        this.notificationService.error(error.error?.message || 'Failed to capture POD');
        this.isSavingPod = false;
      }
    });
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

  private rebuildView(): void {
    const dn = this.deliveryNote;
    if (!dn) return;
    this.breadcrumbs = [
      { label: 'Home', link: ['/home'] },
      { label: 'Dispatch', link: ['/dispatch/delivery-note-register'] },
      { label: dn.dnNo || 'Delivery Note' }
    ];
    this.badges = [{ label: dn.status, tone: dn.status === 'Cancelled' || dn.status === 'Rejected' ? 'bad' : dn.status === 'Draft' ? 'neutral' : 'good' }];
    const qty = this.deliveryItems.reduce((sum, item: any) => sum + (item.currentDeliveryQty || 0), 0);
    this.stats = [
      { label: 'Items', value: String(this.deliveryItems.length) },
      { label: 'Quantity', value: String(qty) },
      { label: 'Type', value: dn.deliveryType || 'Customer Delivery' },
      { label: 'Promised', value: dn.promisedDate ? new Date(dn.promisedDate).toLocaleDateString('en-GB') : '-' }
    ];
    this.itemRows = this.deliveryItems.map((item: any) => ({
      ...item,
      serialNos: Array.isArray(item.serialNos) && item.serialNos.length ? item.serialNos.join(', ') : '-',
      rejectedQty: item.rejectedQty || 0,
      rejectionReason: item.rejectionReason || '-'
    }));
    if (dn.pod) {
      this.podForm.patchValue({
        receivedBy: dn.pod.receivedBy || '',
        receivedContactNo: dn.pod.receivedContactNo || '',
        receivedDate: dn.pod.receivedDate ? new Date(dn.pod.receivedDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        remarks: dn.pod.remarks || '',
        signatureName: dn.pod.signatureName || ''
      });
    }
  }
}
