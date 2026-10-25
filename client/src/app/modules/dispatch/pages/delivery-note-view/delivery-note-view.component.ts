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
import { PdfPreviewComponent } from 'src/app/shared/components/pdf-preview/pdf-preview.component';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { DetailViewBadge, DetailViewBreadcrumb, DetailViewShellComponent, DetailViewStat, DetailViewTab } from 'src/app/shared/components/detail-view-shell/detail-view-shell.component';
import { DetailSectionComponent } from 'src/app/shared/components/detail-panel/detail-section.component';
import { DetailFieldComponent } from 'src/app/shared/components/detail-panel/detail-field.component';
import { DetailBadgeComponent } from 'src/app/shared/components/detail-panel/detail-badge.component';
import { DetailTableComponent } from 'src/app/shared/components/detail-panel/detail-table.component';
import { DetailTableColumn } from 'src/app/shared/components/detail-panel/detail-panel.model';
import { DetailDocument, DetailTimelineEntry } from 'src/app/shared/components/detail-panel/detail-panel.model';
import { DetailDocumentsComponent } from 'src/app/shared/components/detail-panel/detail-documents.component';
import { DetailTimelineComponent } from 'src/app/shared/components/detail-panel/detail-timeline.component';
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
    DetailDocumentsComponent,
    DetailTimelineComponent,
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
  readonly tabs: DetailViewTab[] = [
    { id: 'details', label: 'Details' },
    { id: 'items', label: 'Items' },
    { id: 'documents', label: 'Documents' },
    { id: 'history', label: 'History' },
  ];
  tab = 'details';
  documents: DetailDocument[] = [];
  history: DetailTimelineEntry[] = [];
  readonly itemCols: DetailTableColumn[] = [
    { key: 'partNo', label: 'Item', type: 'stack', subKey: 'description', wrap: true },
    { key: 'orderedQty', label: 'Ordered', type: 'number' },
    { key: 'deliveredQty', label: 'Previous', type: 'number' },
    { key: 'currentDeliveryQty', label: 'This DN', type: 'number' },
    { key: 'serialNos', label: 'Serial No(s)', type: 'textarea', width: '18rem' },
  ];
  isLoading = true;
  isDispatching = false;
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
      this.router.navigate(['/dispatch']);
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
        this.router.navigate(['/dispatch']);
      }
    });
  }

  onEdit() {
    if (!this.deliveryNote) return;
    this.router.navigate(['/dispatch/create'], {
      queryParams: { id: this.deliveryNote._id } 
    });
  }

  onDispatch(): void {
    if (!this.deliveryNote?._id || this.deliveryNote.status !== 'Ready for Dispatch') return;
    this.isDispatching = true;
    this.dnService.dispatchDn(this.deliveryNote._id).subscribe({
      next: () => {
        this.notificationService.success('Delivery dispatched and stock deducted');
        this.isDispatching = false;
        this.loadDeliveryNote();
      },
      error: (error) => {
        this.notificationService.error(error.error?.message || 'Failed to dispatch delivery');
        this.isDispatching = false;
      }
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
    this.router.navigate(['/dispatch']);
  }

  onTabChange(tab: string): void {
    this.tab = tab;
  }

  closedPurchaseOrders(dn: DeliveryNote): any[] {
    return this.latestLinkedRecords(
      dn.linkedRecords?.purchaseOrders?.filter((po: any) => po.poStatus === 'Closed') || [],
      'poDate'
    );
  }

  passedGrns(dn: DeliveryNote): any[] {
    return this.latestLinkedRecords(
      dn.linkedRecords?.grns?.filter((grn: any) =>
        [grn.inspectionResult, grn.outcomeStatus].some((status) => String(status || '').toLowerCase() === 'passed')
      ) || [],
      'grnDate'
    );
  }

  canCompletePod(): boolean {
    return this.deliveryNote?.status === 'Dispatched';
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
      { label: 'Dispatch', link: ['/dispatch'] },
      { label: dn.dnNo || 'Delivery Note' }
    ];
    this.badges = [{ label: dn.status, tone: dn.status === 'Cancelled' || dn.status === 'Rejected' ? 'bad' : dn.status === 'Draft' ? 'neutral' : 'good' }];
    const qty = this.deliveryItems.reduce((sum, item: any) => sum + (item.currentDeliveryQty || 0), 0);
    this.stats = [
      { label: 'Items', value: String(this.deliveryItems.length) },
      { label: 'Quantity', value: String(qty) },
      { label: 'Type', value: dn.deliveryType || 'Customer Delivery' },
    ];
    this.itemRows = this.deliveryItems.map((item: any) => ({
      ...item,
      serialNos: Array.isArray(item.serialNos) ? item.serialNos.join('\n') : (item.serialNos || ''),
    }));
    this.documents = (dn.pod?.attachments || []).map((file, index) => ({
      id: `${file.fileName || file.originalname}-${index}`,
      name: file.originalname || file.fileName,
      date: dn.pod?.receivedDate || dn.updatedDate || dn.createdDate,
      uploadedBy: 'Proof of Delivery',
    }));
    const creator = dn.createdBy ? `${dn.createdBy.firstName || ''} ${dn.createdBy.lastName || ''}`.trim() : '';
    this.history = [
      { text: 'Delivery note created', meta: [creator, this.formatDateTime(dn.createdDate)].filter(Boolean).join(' · '), tone: 'info' as const },
      ...(dn.status !== 'Draft' ? [{ text: `Status: ${dn.status}`, meta: this.formatDateTime(dn.updatedDate || dn.createdDate), tone: dn.status === 'Cancelled' ? 'bad' as const : 'good' as const }] : []),
      ...(dn.rejectedHistory || []).map((entry) => ({
        text: entry.reason ? `Delivery rejected: ${entry.reason}` : 'Delivery rejected',
        meta: this.formatDateTime(entry.date),
        tone: 'bad' as const,
      })),
      ...(dn.pod?.receivedBy ? [{ text: `Proof of delivery captured by ${dn.pod.receivedBy}`, meta: this.formatDateTime(dn.pod.receivedDate || dn.updatedDate), tone: 'good' as const }] : []),
    ].filter((entry) => !!entry.meta);
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

  private formatDateTime(value?: string): string {
    if (!value) return '';
    return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
  }

  private latestLinkedRecords(records: any[], dateKey: string): any[] {
    return [...records]
      .sort((left, right) => new Date(right?.[dateKey] || 0).getTime() - new Date(left?.[dateKey] || 0).getTime())
      .slice(0, 3);
  }
}
