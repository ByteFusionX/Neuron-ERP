import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { getJob } from 'src/app/shared/interfaces/job.interface';
import { PurchaseData, PurchaseOrder, PurchaseStatus } from 'src/app/shared/interfaces/purchase.interface';
import { environment } from 'src/environments/environment';

import * as pdfMake from 'pdfmake/build/pdfmake';

@Injectable({
  providedIn: 'root'
})
export class PurchaseService {

  api: string = environment.api
  constructor(private http: HttpClient) { }

  private purchaseJob = new BehaviorSubject<getJob | null>(null);
  selectedJob$ = this.purchaseJob.asObservable();

  private supplierDiscount = new BehaviorSubject<any>(null);
  supplierDiscount$ = this.supplierDiscount.asObservable()

  private purchaseFormData = new BehaviorSubject<any>(null)
  purchaseFormData$ = this.purchaseFormData.asObservable()

  private comparisonData = new BehaviorSubject<any>(null)
  comparisonFormData$ = this.comparisonData.asObservable()

  private editMode = new BehaviorSubject<boolean>(false)
  editMode$ = this.editMode.asObservable()

  purchaseId = new BehaviorSubject<string | null>(null)
  purchaseId$ = this.purchaseId.asObservable()

  private suppliersData = new BehaviorSubject<any[]>([])
  suppliersData$ = this.suppliersData.asObservable()

  setSuppliersData(suppliers: any[]) {
    this.suppliersData.next(suppliers)
  }

  setEditingorNot(isEdit: boolean, purchaseId: string) {
    this.purchaseId.next(purchaseId)
    this.editMode.next(isEdit)
  }

  setPurchaseJob(jobData: getJob) {
    this.purchaseJob.next(jobData)
  }

  setSupplierDiscount(discounts: any) {
    this.supplierDiscount.next(discounts)
  }

  setPurchaseFormData(formData: any) {
    this.purchaseFormData.next(formData)
  }

  setComparisonData(data: any) {
    this.comparisonData.next(data)
  }

  getPurchaseNo(): any {
    return this.http.get<any>(`${this.api}/purchase/purchase-request/generate-purchase-no`)
  }

  getPurchases(params: {
    page?: number;
    row?: number;
    status?: string[];
    fromDate?: string;
    toDate?: string;
    search?: string;
  }): Observable<any> {
    return this.http.post<any>(`${this.api}/purchase/purchase-requests`, params);
  }

  createPurchase(purchaseData: PurchaseData): Observable<any> {
    return this.http.post<any>(`${this.api}/purchase/purchase-request`, purchaseData)
  }

  getPurchaseById(purchaseId: string): Observable<any> {
    return this.http.get(`${this.api}/purchase/purchase-request/${purchaseId}`)
  }

  updatePurchaseStatus(purchaseId: string, status: PurchaseStatus, userId: string, comment?: string): Observable<any> {
    return this.http.patch<any>(`${this.api}/purchase/purchase-request/status/${purchaseId}`, { status, userId, comment });
  }

  getPurchaseRequestsByJobId(jobId: string): Observable<any> {
    return this.http.get<any>(`${this.api}/purchase/purchase-request/job/${jobId}`);
  }

  updatePurchase(purchaseId: string, purchaseData: PurchaseData): Observable<any> {
    return this.http.put<any>(`${this.api}/purchase/purchase-update/${purchaseId}`, purchaseData)
  }


  getBase64ImageFromURL(url: string) {
    return new Promise((resolve, reject) => {
      var img = new Image();
      img.setAttribute("crossOrigin", "anonymous");

      img.onload = () => {
        var canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;

        var ctx = canvas.getContext("2d");
        ctx!.drawImage(img, 0, 0);

        var dataURL = canvas.toDataURL("image/png");

        resolve(dataURL);
      };

      img.onerror = error => {
        reject(error);
      };

      img.src = url;
    });
  }


  async generatePDF(purchaseData: PurchaseOrder, includeStamp: boolean) {
    const pdfMakeInstance = { ...pdfMake };

    (pdfMakeInstance as any).fonts = {
      EBGaramond: {
        normal: `${window.location.origin}/assets/font/EBGaramond-Regular.ttf`,
        bold: `${window.location.origin}/assets/font/EBGaramond-Bold.ttf`,
        italics: `${window.location.origin}/assets/font/EBGaramond-Italic.ttf`,
      }
    };

    const itemTableHeader = [
      { text: 'Sl.\nNo', style: 'tableSlNo' },
      { text: 'Description', style: 'tableHeader' },
      { text: 'Qty', style: 'tableHeader' },
      { text: `Unit Price (${purchaseData.quoteId?.currency})`, style: 'tableHeader' },
      { text: `Total Cost (${purchaseData.quoteId?.currency})`, style: 'tableHeader' },
    ];

    const tableBody: any[] = [];
    let totalCost = 0;
    let serialNumber = 1;

    purchaseData.items.forEach(item => {
      totalCost += item.totalCost;
      tableBody.push([
        { text: serialNumber++, style: 'tableText', alignment: 'center' },
        { text: item.detail, style: 'tableText' },
        { text: item.quantity, style: 'tableText', alignment: 'center' },
        { text: this.formatNumber(item.unitCost), style: 'tableText', alignment: 'center' },
        { text: this.formatNumber(item.totalCost), style: 'tableText', alignment: 'center' },
      ]);
    });

    const finalAmount = [
      { text: `Total Amount (${purchaseData.quoteId?.currency})`, style: 'tableFooter', colSpan: 4 }, '', '', '',
      { text: this.formatNumber(totalCost), style: 'tableFooter' }
    ];

    const itemsTable = {
      table: {
        headerRows: 1,
        widths: [30, '*', 40, 60, 60],
        body: [
          itemTableHeader,
          ...tableBody,
          finalAmount
        ]
      }
    };


    const documentDefinition: any = {
      defaultStyle: {
        font: 'EBGaramond'
      },
      background: {
        image: await this.getBase64ImageFromURL(
          "../../assets/images/logo.webp"
        ),
        width: 450,
        alignment: 'center',
        valign: 'center',
        margin: [0, 220, 0, 0]
      },
      header: {
        image: await this.getBase64ImageFromURL(
          purchaseData.purchaseCompany === "Neuron Security System"
            ? "../../assets/images/pdfheader-security.jpg"
            : "../../assets/images/pdfheader.jpg"
        ),
        width: 550,
        alignment: 'center',
        margin: [0, 25, 0, 0]
      },
      footer: {
        image: await this.getBase64ImageFromURL(
          "../../assets/images/pdfFooter.png"
        ),
        width: 600,
        alignment: 'center',
        margin: [0, 25, 0, 0]
      },
      pageMargins: [45, 115, 45, 100],
      content: [
        {
          "style": "header",
          "table": {
            "heights": 20,
            "widths": "*",
            "body": [[
              {
                style: 'mainHead',
                "border": [false, false, false, false],
                "fillColor": "#1E3964",
                "text": "PURCHASE ORDER",
                "alignment": "center",
                "margin": [0, 3, 0, 3]
              }]
            ]
          }
        },

        {
          style: 'tableExample',
          color: '#444',
          margin: [0, 10, 0, 15],
          table: {
            widths: [78.66, '*', 43.24, '*', 73.60, 'auto'],
            body: [
              [
                { style: 'tableHead', text: 'Supplier:', alignment: 'left' },
                { style: 'tableHead', text: purchaseData.supplierId.supplierName, alignment: 'left', colSpan: 3 },
                {},
                {},
                { style: 'tableHead', text: 'Delivery Terms:', alignment: 'left' },
                { style: 'quoteId', text: purchaseData.etaTerms, alignment: 'left' }
              ],
              [
                { style: 'tableHead', text: 'Address:', alignment: 'left' },
                { style: 'tableHead', text: purchaseData.supplierId.address, alignment: 'left', colSpan: 3 },
                {},
                {},
                { style: 'tableHead', text: 'Place of Delivery:', alignment: 'left' },
                { style: 'quoteId', text: purchaseData.placeOfDelivery, alignment: 'left' }
              ],
              [
                { style: 'tableHead', text: 'Contact Person:', alignment: 'left' },
                { style: 'tableHead', text: purchaseData.supplierId.contactDetails.name, alignment: 'left', colSpan: 3 },
                {},
                {},
                { style: 'tableHead', text: 'Payment Terms:', alignment: 'left' },
                { style: 'quoteId', text: purchaseData.paymentTerms, alignment: 'left' }
              ],
              [
                { style: 'tableHead', text: 'Phone Number:', alignment: 'left' },
                { style: 'tableHead', text: purchaseData.supplierId.contactDetails.phoneNumber, alignment: 'left', colSpan: 3 },
                {},
                {},
                { style: 'tableHead', text: 'Shipping Terms:', alignment: 'left' },
                { style: 'quoteId', text: purchaseData.shippingTerms, alignment: 'left' }
              ],
              [
                { style: 'tableHead', text: 'Email:', alignment: 'left' },
                { style: 'tableHead', text: purchaseData.supplierId.contactDetails.email, alignment: 'left', colSpan: 3 },
                {},
                {},
                { style: 'tableHead', text: 'PO Date:', alignment: 'left' },
                { style: 'quoteId', text: purchaseData.poDate, alignment: 'left' }
              ],
              [
                { style: 'tableHead', text: 'Quote Ref:', alignment: 'left' },
                { style: 'tableHead', text: purchaseData.quoteId?.quoteNo, alignment: 'left', colSpan: 3 },
                {},
                {},
                { style: 'tableHead', text: 'PO No:', alignment: 'left' },
                { style: 'quoteId', text: purchaseData.poNo, alignment: 'left' }
              ],
              [
                { style: 'tableHead', text: 'Subject:', alignment: 'left' },
                { style: 'tableHead', text: purchaseData.subject, alignment: 'left', colSpan: 3 },
                {},
                {},
                { style: 'tableHead', text: 'Job No:', alignment: 'left' },
                { style: 'quoteId', text: purchaseData.jobId?.jobId, alignment: 'left' }
              ]
            ]

          }
        },
        itemsTable,
        { text: 'TERMS & CONDITIONS', style: 'subHeading' },
        { text: purchaseData.termsAndCondition, style: 'text' },
        {
          columns: [
            {
              text: [
                { text: 'Thanking you\nFor ', style: 'footerText' },
                { text: purchaseData.purchaseCompany == "Neuron Security System" ? 'Neuron Security System W.L.L' : 'Neuron Technologies W.L.L', style: 'footerBoldText', id: 'lastPage' }]
            },
            ...(includeStamp ? [{
              image: await this.getBase64ImageFromURL(
                "../../assets/images/stamp.jpg"
              ),
              width: 90,
              margin: [30, 5, 0, 0]
            }] : []),
            { text: `${purchaseData.createdBy.firstName + ' ' + purchaseData.createdBy.lastName}\nMob: - ${purchaseData.createdBy.contactNo}\nE: ${purchaseData.createdBy.email}`, style: 'footerText', alignment: 'right' },
          ],
          margin: [0, 10, 0, 0],
          pageBreak: 'avoid'
        },
      ],
      styles: {
        mainHead: {
          fontSize: 14,
          color: 'white',
          bold: true
        },
        tableHead: {
          color: 'black',
          fontSize: 10
        },
        quoteId: {
          color: 'black',
          fontSize: 9
        },
        header: {
          fontSize: 18,
          bold: true,
          margin: [0, 0, 0, 10]
        },
        text: {
          fontSize: 12,
          margin: [0, 5, 0, 0]
        },
        subHeading: {
          fontSize: 11,
          margin: [0, 12, 0, 0],
          decoration: 'underline',
          bold: true
        },
        tableHeader: {
          fontSize: 12,
          alignment: 'center',
          margin: [0, 10],
          fillColor: "#1E4E79",
          color: 'white',
          bold: true
        },
        tableSlNo: {
          bold: true,
          fontSize: 12,
          alignment: 'center',
          margin: [0, 5],
          fillColor: "#1E4E79",
          color: 'white'
        },
        tableFooter: {
          bold: true,
          fontSize: 11,
          alignment: 'center',
          fillColor: "#BFBEBE",
          margin: [0, 5, 0, 5]
        },
        tableText: {
          fontSize: 10
        },
        footerText: {
          fontSize: 10,
          margin: [5, 10, 0, 0]
        },
        footerBoldText: {
          fontSize: 10,
          margin: [5, 10, 0, 0],
          bold: true
        },
      }

    }


    const pdfDoc = pdfMake.createPdf(documentDefinition);
    return pdfDoc
  }

  formatNumber(value: any, minimumFractionDigits: number = 2, maximumFractionDigits: number = 2): string {
    if (isNaN(value)) {
      return '';
    }

    return value.toLocaleString('en-US', {
      minimumFractionDigits,
      maximumFractionDigits
    });
  }
}
