import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { PurchaseData, PurchaseLineAward, PurchaseOrder, PurchaseStatus, SupplierLastPrice } from 'src/app/shared/interfaces/purchase.interface';
import { environment } from 'src/environments/environment';

import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import { SKIP_ERROR_TOAST } from 'src/app/core/interceptors/error-interceptor/error.interceptor';

// Methods below flagged with context() are called only from components that already
// show their own error toast on failure, so requests opt out of the interceptor's global toast.
const context = () => new HttpContext().set(SKIP_ERROR_TOAST, true);

@Injectable({
  providedIn: 'root'
})
export class PurchaseService {

  api: string = environment.api
  constructor(private http: HttpClient) { }

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
    sortKey?: string;
    sortDir?: 'asc' | 'desc';
    sourceType?: string;
    poProgress?: 'ready' | 'remaining' | 'completed';
    rfqStatus?: 'not-started' | 'quoted' | 'awarded';
    allocation?: 'new';
  }): Observable<any> {
    return this.http.post<any>(`${this.api}/purchase/purchase-requests`, params, { context: context() });
  }

  /** Tab totals for several PR list views in one call; each view carries the same filters as a list query. */
  getPurchaseCounts(params: {
    search?: string;
    views: { id: string; status?: string[]; sourceType?: string; poProgress?: string; allocation?: string }[];
  }): Observable<{ counts: Record<string, number> }> {
    return this.http.post<{ counts: Record<string, number> }>(`${this.api}/purchase/purchase-requests/counts`, params, { context: context() });
  }

  createPurchase(purchaseData: PurchaseData): Observable<any> {
    return this.http.post<any>(`${this.api}/purchase/purchase-request`, purchaseData)
  }

  getPurchaseById(purchaseId: string): Observable<any> {
    return this.http.get(`${this.api}/purchase/purchase-request/${purchaseId}`, { context: context() })
  }

  updatePurchaseStatus(purchaseId: string, status: 'approved' | 'rejected', comment?: string): Observable<any> {
    return this.http.patch<any>(`${this.api}/purchase/purchase-request/status/${purchaseId}`, { status, comment }, { context: context() });
  }

  /** Super Admin restarts a pending PR's approval route; `stepRoleIds` are the stages that get another chance. */
  resetPurchaseWorkflow(purchaseId: string, stepRoleIds: string[]): Observable<{ success: true; message: string }> {
    return this.http.post<{ success: true; message: string }>(`${this.api}/purchase/purchase-request/reset-workflow/${purchaseId}`, { stepRoleIds }, { context: context() });
  }

  getApprovalsByEmployee(filters?: any): Observable<any> {
    let params: any = {};
    if (filters?.page) {
      params.page = filters.page.toString();
    }
    if (filters?.row) {
      params.row = filters.row.toString();
    }
    return this.http.get<any>(`${this.api}/purchase/purchase-request/approvals/employee`, { params });
  }

  getPurchaseRequestsByJobId(jobId: string): Observable<any> {
    return this.http.get<any>(`${this.api}/purchase/purchase-request/job/${jobId}`);
  }

  updatePurchase(purchaseId: string, purchaseData: PurchaseData): Observable<any> {
    return this.http.put<any>(`${this.api}/purchase/purchase-update/${purchaseId}`, purchaseData)
  }

  createPurchaseDraft(purchaseData: PurchaseData): Observable<any> {
    const draftData = { ...purchaseData, status: 'In Progress' };
    return this.createPurchase(draftData);
  }

  updatePurchaseItems(purchaseId: string, items: any[]): Observable<any> {
    return this.http.patch<any>(`${this.api}/purchase/purchase-request/items/${purchaseId}`, { items });
  }

  /** Chooses suppliers for request lines: a share of the line (blank = all of it), or `clear` to take one off. */
  awardLines(purchaseId: string, awards: PurchaseLineAward[]): Observable<any> {
    return this.http.patch<any>(`${this.api}/purchase/purchase-request/award/${purchaseId}`, { awards }, { context: context() });
  }

  /** Each supplier's last price for these products: the last PO price, else the last price taken for comparison. */
  getSupplierPrices(productIds: string[], supplierIds: string[] = [], currency?: string): Observable<{ success: boolean; data: SupplierLastPrice[] }> {
    const params: Record<string, string> = { productIds: productIds.join(',') };
    if (supplierIds.length) params['supplierIds'] = supplierIds.join(',');
    if (currency) params['currency'] = currency;
    return this.http.get<{ success: boolean; data: SupplierLastPrice[] }>(`${this.api}/purchase/supplier-prices`, { params, context: context() });
  }

  updatePurchaseSupplierOffers(purchaseId: string, items: any[]): Observable<any> {
    return this.http.patch<any>(`${this.api}/purchase/purchase-request/supplier-offers/${purchaseId}`, { items }, { context: context() });
  }

  updatePurchaseMrRequest(purchaseId: string, mrRequest: any): Observable<any> {
    return this.http.patch<any>(`${this.api}/purchase/purchase-request/mr-request/${purchaseId}`, { mrRequest }, { context: context() });
  }

  mergeItemsToDealSheet(purchaseId: string): Observable<any> {
    return this.http.patch<any>(`${this.api}/purchase/purchase-request/merge-items/${purchaseId}`, {}, { context: context() });
  }

  revokeMergedItems(purchaseId: string): Observable<any> {
    return this.http.patch<any>(`${this.api}/purchase/purchase-request/revoke-merge/${purchaseId}`, {}, { context: context() });
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
    pdfMake.vfs = pdfFonts.vfs;

    (pdfMake as any).fonts = {
      EBGaramond: {
        normal: `${window.location.origin}/assets/font/EBGaramond-Regular.ttf`,
        bold: `${window.location.origin}/assets/font/EBGaramond-Bold.ttf`,
        italics: `${window.location.origin}/assets/font/EBGaramond-Italic.ttf`,
      }
    };

    const data: any = purchaseData;
    const currency = data.currency || data.quoteId?.currency || data.quoteId?.dealData?.currency || '';
    const money = (v: any) => `${this.currencySymbol(currency)}${this.formatNumber(Number(v) || 0)}`;
    const supplier = data.supplierId || {};
    const contact = supplier.contacts?.find((c: any) => c.isPrimary) || supplier.contactDetails || supplier.contacts?.[0] || {};
    const address = supplier.addresses?.find((a: any) => a.isPrimary) || supplier.address || supplier.addresses?.[0] || {};
    const creator = data.createdBy || {};
    const creatorName = `${creator.firstName || ''} ${creator.lastName || ''}`.trim();
    const creatorPhone = this.qatarPhone(creator.contactNo);
    const footerImage = await this.getBase64ImageFromURL("../../assets/images/pdfFooter.png");

    const tableBody: any[] = [];
    let totalCost = 0;
    let serialNumber = 1;

    (purchaseData.items || []).forEach(item => {
      totalCost += item.totalCost || 0;
      tableBody.push([
        { text: serialNumber++, style: 'tableText', alignment: 'center' },
        { text: item.detail || '', style: 'tableText' },
        { text: item.quantity, style: 'tableText', alignment: 'center' },
        { text: money(item.unitCost), style: 'tableText', alignment: 'right' },
        { text: money(item.totalCost), style: 'tableText', alignment: 'right' },
      ]);
    });

    const itemsTable = {
      table: {
        headerRows: 1,
        widths: [40, '*', 35, 55, 65],
        body: [
          [
            { text: 'Sl. No.', style: 'tableHeader' },
            { text: 'Description', style: 'tableHeader' },
            { text: 'Qty', style: 'tableHeader' },
            { text: 'U- Price', style: 'tableHeader' },
            { text: `Total Cost${currency ? `\n(${currency})` : ''}`, style: 'tableHeader' },
          ],
          ...tableBody,
          [
            { text: `TOTAL${currency ? `(${currency})` : ''}: ${this.amountInWords(totalCost, currency)}`, style: 'tableFooter', colSpan: 4 }, '', '', '',
            { text: money(totalCost), style: 'tableFooter', alignment: 'right' }
          ]
        ]
      }
    };

    const infoRow = (l1: string, v1: any, l2: string, v2: any) => [
      { style: 'tableHead', text: l1 },
      { style: 'tableBody', text: v1 || '' },
      { style: 'tableHead', text: l2 },
      { style: 'tableBody', text: v2 || '' },
    ];

    const section = (title: string, body: string) => body ? [
      { text: title, style: 'subHeading' },
      { text: body, style: 'text', margin: [0, 2, 0, 0] },
    ] : [];

    const signature = (label: string, role: string) => ({
      stack: [
        { text: label, fontSize: 10 },
        { text: role, fontSize: 10, bold: true },
      ],
    });

    const documentDefinition: any = {
      defaultStyle: {
        font: 'EBGaramond'
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
      footer: (currentPage: number) => ({
        stack: [
          {
            text: `For more clarification, please contact ${[creator.email, creatorPhone, 'Tel: +974 40028686', 'Fax: +974 40028080'].filter(Boolean).join(' | ')}`,
            fontSize: 9,
            color: '#888',
            margin: [45, 0, 45, 0]
          },
          { text: `Page | ${currentPage}`, fontSize: 9, color: '#888', alignment: 'right', margin: [0, 0, 45, 2] },
          { image: footerImage, width: 600, alignment: 'center' },
        ],
      }),
      pageMargins: [45, 115, 45, 110],
      content: [
        {
          table: {
            widths: '*',
            body: [[
              {
                style: 'mainHead',
                border: [false, false, false, false],
                fillColor: '#f4b083',
                text: 'PURCHASE ORDER',
                alignment: 'center',
                margin: [0, 3, 0, 3]
              }]
            ]
          }
        },
        {
          margin: [0, 10, 0, 15],
          table: {
            widths: [85, '*', 95, '*'],
            body: [
              infoRow('Supplier:', supplier.supplierName, 'Delivery terms', purchaseData.etaTerms),
              infoRow('Address', [address.buildingNo, address.streetNo, address.zoneNo, address.location, address.city].filter(Boolean).join(', '), 'Place of Delivery', purchaseData.placeOfDelivery),
              infoRow('Contact Person', contact.name, 'Payment Terms', purchaseData.paymentTerms),
              infoRow('Phone', contact.phoneNumber, 'Shipping Terms', purchaseData.shippingTerms),
              infoRow('E-mail', contact.email, 'PO Date:', purchaseData.poDate ? new Date(purchaseData.poDate).toLocaleDateString('en-GB') : ''),
              infoRow('Quote Ref:', purchaseData.quoteId?.quoteId, 'PO No:', purchaseData.poNo),
              infoRow('Subject:', purchaseData.subject, 'Job No:', purchaseData.jobId?.jobId || data.purchaseId?.jobId?.jobId),
            ]
          }
        },
        itemsTable,
        ...section('PO Details:', purchaseData.subject || ''),
        ...section('Point Of Contact:', creatorName ? `PLEASE COORDINATE WITH ${creatorName}${creatorPhone ? ` - ${creatorPhone}` : ''}` : ''),
        ...section('Payment terms', purchaseData.paymentTerms || ''),
        { text: 'General Terms & Conditions:', style: 'subHeading' },
        {
          ul: [
            'The Supplier/Contractor should deliver the Goods/Service as per the specifications agreed and approved.',
            'The Supplier/Contractor is responsible for any damage to any persons (or) property whatever and responsible to insure for the same.',
            'If the delivery is not made as per schedule and as per the approved specification. Neuron has the right to cancel the order partially or fully.',
            "The Supplier's/Contractor's payment will be made as per the agreed terms.",
          ], style: 'text'
        },
        ...(purchaseData.termsAndCondition ? [{ text: purchaseData.termsAndCondition, style: 'text' }] : []),
        {
          unbreakable: true,
          margin: [20, 25, 0, 0],
          columnGap: 10,
          columns: [
            signature('Prepared By', 'Procurement Officer'),
            signature('Approved By', 'Head of Strategy & Operations'),
            signature('Approved By', 'Finance Manager'),
            includeStamp
              ? { image: await this.getBase64ImageFromURL("../../assets/images/stamp.jpg"), width: 90 }
              : { text: '', width: 90 },
          ],
        },
      ],
      styles: {
        mainHead: { fontSize: 13, color: 'white', bold: true },
        tableHead: { color: 'black', fontSize: 10, bold: true },
        tableBody: { fontSize: 10, color: 'black' },
        text: { fontSize: 10, margin: [0, 3, 0, 0] },
        subHeading: { fontSize: 10, margin: [0, 12, 0, 0], decoration: 'underline', bold: true },
        tableHeader: { fontSize: 11, alignment: 'center', margin: [0, 6], bold: true, color: 'black' },
        tableFooter: { bold: true, fontSize: 11, margin: [0, 5, 0, 5] },
        tableText: { fontSize: 10, margin: [0, 2] },
      }
    };

    const pdfDoc = pdfMake.createPdf(documentDefinition);
    return pdfDoc
  }

  private currencySymbol(code: string): string {
    const symbols: Record<string, string> = { USD: '$', EUR: '€', GBP: '£' };
    return symbols[code] ?? (code ? `${code} ` : '');
  }

  private qatarPhone(value: any): string {
    const digits = String(value ?? '').replace(/\D/g, '');
    if (!digits) return '';
    return digits.startsWith('974') ? `+${digits}` : `+974${digits}`;
  }

  // e.g. "FIVE THOUSAND THREE HUNDRED FORTY-FOUR US DOLLARS AND SIXTY-ONE CENTS ONLY."
  private amountInWords(amount: number, currency: string): string {
    const ones = ['', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN', 'ELEVEN', 'TWELVE', 'THIRTEEN', 'FOURTEEN', 'FIFTEEN', 'SIXTEEN', 'SEVENTEEN', 'EIGHTEEN', 'NINETEEN'];
    const tens = ['', '', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY', 'SIXTY', 'SEVENTY', 'EIGHTY', 'NINETY'];
    const words = (n: number): string => {
      if (n < 20) return ones[n];
      if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? '-' + ones[n % 10] : '');
      if (n < 1000) return ones[Math.floor(n / 100)] + ' HUNDRED' + (n % 100 ? ' ' + words(n % 100) : '');
      if (n < 1e6) return words(Math.floor(n / 1000)) + ' THOUSAND' + (n % 1000 ? ' ' + words(n % 1000) : '');
      if (n < 1e9) return words(Math.floor(n / 1e6)) + ' MILLION' + (n % 1e6 ? ' ' + words(n % 1e6) : '');
      return words(Math.floor(n / 1e9)) + ' BILLION' + (n % 1e9 ? ' ' + words(n % 1e9) : '');
    };
    const names: Record<string, [string, string]> = {
      USD: ['US DOLLARS', 'CENTS'], QAR: ['QATARI RIYALS', 'DIRHAMS'], EUR: ['EUROS', 'CENTS'], GBP: ['POUNDS', 'PENCE'],
    };
    const [major, minor] = names[currency] || [currency, 'CENTS'];
    const cents = Math.round((amount || 0) * 100);
    const whole = Math.floor(cents / 100);
    const fraction = cents % 100;
    let text = `${words(whole) || 'ZERO'} ${major}`.trim();
    if (fraction) text += ` AND ${words(fraction)} ${minor}`;
    return `${text} ONLY.`;
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
