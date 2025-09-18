import { Component, Inject, ViewChild } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { NgxExtendedPdfViewerComponent, NgxExtendedPdfViewerModule } from 'ngx-extended-pdf-viewer';
import { getQuotatation } from '../../interfaces/quotation.interface';
import { FormsModule } from '@angular/forms';
import { QuotationService } from 'src/app/core/services/quotation/quotation.service';
import { CommonModule } from '@angular/common';
import { PurchaseService } from 'src/app/core/services/purchase/purchase.service';

@Component({
    selector: 'app-quotation-preview',
    templateUrl: './quotation-preview.component.html',
    styleUrls: ['./quotation-preview.component.css'],
    imports: [CommonModule, NgxExtendedPdfViewerModule, FormsModule]
})
export class QuotationPreviewComponent {
  @ViewChild(NgxExtendedPdfViewerComponent, { static: false })
  private pdfViewer!: NgxExtendedPdfViewerComponent;
  url: string = '';
  includeStamp: boolean = true;
  isPreviewing: boolean = false;

  constructor(
    public dialogRef: MatDialogRef<QuotationPreviewComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { url: string, formatedQuote: any, type?: 'quotation' | 'purchase' },
    private _quoteService: QuotationService,
    private _purchaseService: PurchaseService
  ) {
    this.url = data.url;
    dialogRef.beforeClosed().subscribe((result) => {
      this.pdfViewer.ngOnDestroy();
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
    else {
    const pdfDoc = await this._quoteService.generatePDF(this.data.formatedQuote, this.includeStamp);
      pdfDoc.getBlob((blob: Blob) => {
      let url = window.URL.createObjectURL(blob);
      this.isPreviewing = false;
        this.url = url;
      });
    };
  }
}
