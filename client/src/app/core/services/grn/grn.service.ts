import { Injectable } from '@angular/core';
import { HttpClient, HttpContext } from '@angular/common/http';
import { Observable } from 'rxjs';
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
export class GrnService {
  private baseUrl = `${environment.api}/grn`;

  constructor(private http: HttpClient) {}

  generateGRNNumber(): Observable<{ grn: string }> {
    return this.http.get<{ grn: string }>(`${this.baseUrl}/generate-grn-no`, { context: context() });
  }

  createGRN(grnData: any): Observable<any> {
    return this.http.post<any>(`${this.baseUrl}`, grnData, { context: context() });
  }

  getGRNByLpoId(lpoId: string): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/purchase-order/${lpoId}`);
  }

  getAllGRNsByLpoId(lpoId: string): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/purchase-order/${lpoId}/all`);
  }

  updateGRN(id: string, grnData: any): Observable<any> {
    return this.http.patch<any>(`${this.baseUrl}/${id}`, grnData, { context: context() });
  }

  getGRNById(id: string): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/${id}`, { context: context() });
  }

  getAllGRNs(params?: {
    page?: number;
    row?: number;
    search?: string;
    status?: 'pending' | 'partial' | 'arrived' | 'returns';
  }): Observable<any> {
    return this.http.get<any>(this.baseUrl, { params: params as any, context: context() });
  }

  /** Placed LPOs still waiting on goods, soonest expected delivery first. */
  getArrivingPurchaseOrders(params?: { page?: number; row?: number; search?: string; stage?: 'upcoming' | 'arriving' }): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/arriving`, { params: params as any, context: context() });
  }

  updateSupplierInvoices(grnId: string, formData: FormData): Observable<any> {
    return this.http.patch<any>(`${this.baseUrl}/${grnId}/supplier-invoices`, formData, { context: context() });
  }

  updateSupplierDeliveryNotes(grnId: string, formData: FormData): Observable<any> {
    return this.http.patch<any>(`${this.baseUrl}/${grnId}/supplier-delivery-notes`, formData, { context: context() });
  }

  getGRNRejections(params?: { purchaseOrderId?: string; supplierId?: string }): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/rejections`, { params: params as any, context: context() });
  }


  async generateGRNReceiptPDF(grnData: any, items: any[]) {
    pdfMake.vfs = pdfFonts.vfs;

    (pdfMake as any).fonts = {
      EBGaramond: {
        normal: `${window.location.origin}/assets/font/EBGaramond-Regular.ttf`,
        bold: `${window.location.origin}/assets/font/EBGaramond-Bold.ttf`,
        italics: `${window.location.origin}/assets/font/EBGaramond-Italic.ttf`,
      }
    };

    const po = grnData.purchaseOrderId || {};
    const supplier = po.supplierId || {};
    const formatDate = (date: any) => date ? new Date(date).toLocaleDateString('en-GB') : '';
    const footerImage = await this.getBase64ImageFromURL("../../assets/images/pdfFooter.png");

    const tableBody: any[] = [];
    let serialNumber = 1;
    let totalOrdered = 0, totalReceived = 0, totalAccepted = 0, totalRejected = 0;

    items.forEach((item: any) => {
      const rejectedQty = item.rejectedQty ?? ((item.receivedQty || 0) - (item.acceptedQty || 0));
      const partNo = typeof item.partNo === 'string' ? item.partNo : (item.partNo?.partNo || '-');
      totalOrdered += item.orderedQty || 0;
      totalReceived += item.receivedQty || 0;
      totalAccepted += item.acceptedQty || 0;
      totalRejected += rejectedQty || 0;
      tableBody.push([
        { text: serialNumber++, style: 'tableText', alignment: 'center' },
        { text: partNo, style: 'tableText' },
        { text: item.itemDescription || '-', style: 'tableText' },
        { text: item.uom || '-', style: 'tableText', alignment: 'center' },
        { text: String(item.orderedQty || 0), style: 'tableText', alignment: 'center' },
        { text: String(item.receivedQty || 0), style: 'tableText', alignment: 'center' },
        { text: String(item.acceptedQty || 0), style: 'tableText', alignment: 'center' },
        { text: String(rejectedQty || 0), style: 'tableText', alignment: 'center' },
        { text: [item.rejectionReason, item.remarks].filter(Boolean).join(' / ') || '-', style: 'tableText' },
      ]);
    });

    const itemsTable = {
      table: {
        headerRows: 1,
        widths: [28, 55, '*', 35, 42, 45, 45, 45, 70],
        body: [
          [
            { text: 'Sl. No.', style: 'tableHeader' },
            { text: 'Part No.', style: 'tableHeader' },
            { text: 'Description', style: 'tableHeader' },
            { text: 'UOM', style: 'tableHeader' },
            { text: 'Ordered', style: 'tableHeader' },
            { text: 'Received', style: 'tableHeader' },
            { text: 'Accepted', style: 'tableHeader' },
            { text: 'Rejected', style: 'tableHeader' },
            { text: 'Remarks', style: 'tableHeader' },
          ],
          ...tableBody,
          [
            { text: 'TOTAL', style: 'tableFooter', colSpan: 4 }, '', '', '',
            { text: String(totalOrdered), style: 'tableFooter', alignment: 'center' },
            { text: String(totalReceived), style: 'tableFooter', alignment: 'center' },
            { text: String(totalAccepted), style: 'tableFooter', alignment: 'center' },
            { text: String(totalRejected), style: 'tableFooter', alignment: 'center' },
            { text: '', style: 'tableFooter' },
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

    const signature = (label: string, name: string) => ({
      stack: [
        { text: label, fontSize: 10, bold: true },
        { text: name || ' ', fontSize: 10, margin: [0, 4, 0, 0] },
        { text: '______________________', fontSize: 10, margin: [0, 18, 0, 0] },
        { text: 'Signature', fontSize: 9, color: '#666' },
      ],
    });

    const documentDefinition: any = {
      defaultStyle: {
        font: 'EBGaramond'
      },
      header: {
        image: await this.getBase64ImageFromURL(
          po.purchaseCompany === "Neuron Security System"
            ? "../../assets/images/pdfheader-security.jpg"
            : "../../assets/images/pdfheader.jpg"
        ),
        width: 550,
        alignment: 'center',
        margin: [0, 25, 0, 0]
      },
      footer: (currentPage: number) => ({
        stack: [
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
                text: 'GOODS RECEIPT NOTE',
                alignment: 'center',
                margin: [0, 3, 0, 3]
              }]
            ]
          }
        },
        {
          margin: [0, 10, 0, 15],
          table: {
            widths: [95, '*', 95, '*'],
            body: [
              infoRow('Supplier:', supplier.supplierName, 'GRN No:', grnData.grnNo),
              infoRow('Supplier Invoice No:', grnData.supplierInvoiceNo, 'GRN Date:', formatDate(grnData.grnDate)),
              infoRow('Invoice Date:', formatDate(grnData.supplierInvoiceDate), 'PO No:', po.poNo),
              infoRow('Delivery Note No:', grnData.supplierDeliveryNoteNo, 'Job No:', po.jobId?.jobId || po.purchaseId?.jobId?.jobId),
              infoRow('Warehouse:', grnData.warehouse?.wareHouseName, 'Status:', grnData.status),
            ]
          }
        },
        itemsTable,
        {
          unbreakable: true,
          margin: [0, 30, 0, 0],
          columnGap: 20,
          columns: [
            signature('Received By', this.formatEmployeeName(grnData.receivedBy)),
            signature('Checked By', ''),
            signature('Store In-charge', ''),
          ],
        },
      ],
      styles: {
        mainHead: { fontSize: 13, color: 'white', bold: true },
        tableHead: { color: 'black', fontSize: 10, bold: true },
        tableBody: { fontSize: 10, color: 'black' },
        tableHeader: { fontSize: 10, alignment: 'center', margin: [0, 5], bold: true, color: 'black' },
        tableFooter: { bold: true, fontSize: 10, margin: [0, 4, 0, 4] },
        tableText: { fontSize: 9, margin: [0, 2] },
      }
    };

    return pdfMake.createPdf(documentDefinition);
  }

  private getBase64ImageFromURL(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.setAttribute("crossOrigin", "anonymous");
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        canvas.getContext("2d")!.drawImage(img, 0, 0);
        resolve(canvas.toDataURL("image/png"));
      };
      img.onerror = error => reject(error);
      img.src = url;
    });
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
}
