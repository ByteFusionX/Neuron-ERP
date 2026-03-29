import { Component, Inject, ViewChild } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { NgxExtendedPdfViewerComponent, NgxExtendedPdfViewerModule } from 'ngx-extended-pdf-viewer';
import { getQuotatation } from '../../interfaces/quotation.interface';
import { FormsModule } from '@angular/forms';
import { QuotationService } from 'src/app/core/services/quotation/quotation.service';
import { CommonModule } from '@angular/common';
import { PurchaseService } from 'src/app/core/services/purchase/purchase.service';
import { DeliveryNoteService } from 'src/app/core/services/delivery-note/delivery-note.service';

@Component({
    selector: 'app-pdf-preview',
    templateUrl: './pdf-preview.component.html',
    styleUrls: ['./pdf-preview.component.css'],
    imports: [CommonModule, NgxExtendedPdfViewerModule, FormsModule]
})
export class PdfPreviewComponent {
  @ViewChild(NgxExtendedPdfViewerComponent, { static: false })
  private pdfViewer!: NgxExtendedPdfViewerComponent;
  url: string = '';
  includeStamp: boolean = true;
  isPreviewing: boolean = false;

  constructor(
    public dialogRef: MatDialogRef<PdfPreviewComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { url: string, formatedQuote: any, type?: 'quotation' | 'purchase' | 'grn' | 'delivery-note' },
    private _quoteService: QuotationService,
    private _purchaseService: PurchaseService,
    private _dnService: DeliveryNoteService
  ) {
    if (data.url) {
      this.url = data.url;
    } else if (data.type === 'delivery-note') {
      this.previewQuote();
    }
    dialogRef.beforeClosed().subscribe((result) => {
      if (this.pdfViewer) {
        this.pdfViewer.ngOnDestroy();
      }
    });
  }

  
  public onCloseClick(): void {
    this.dialogRef.close();
  }



  async previewQuote() {
    if(this.data.type === 'purchase') {
      const pdfDoc = await this._purchaseService.generatePDF(this.data.formatedQuote, this.includeStamp);
      pdfDoc.getBlob((blob: Blob) => {
        let url = window.URL.createObjectURL(blob);
        this.isPreviewing = false;
        this.url = url;
      });
    }
    else if(this.data.type === 'delivery-note') {
      const pdfDoc = await this._dnService.generatePDF(this.data.formatedQuote, this.includeStamp);
      pdfDoc.getBlob((blob: Blob) => {
        let url = window.URL.createObjectURL(blob);
        this.isPreviewing = false;
        this.url = url;
      });
    }
    else {
      const pdfDoc = await this._quoteService.generatePDF(this.data.formatedQuote, this.includeStamp);
      pdfDoc.getBlob((blob: Blob) => {
        let url = window.URL.createObjectURL(blob);
        this.isPreviewing = false;
        this.url = url;
      });
    }
  }
}
