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

  getGRNById(id: string): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/${id}`, { context: context() });
  }

  getAllGRNs(params?: {
    page?: number;
    row?: number;
    search?: string;
  }): Observable<any> {
    return this.http.get<any>(this.baseUrl, { params: params as any, context: context() });
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


  async generateGRNReceiptPDF(grnData: any, selectedItems: any[]) {
    pdfMake.vfs = pdfFonts.vfs;
    
    (pdfMake as any).fonts = {
      EBGaramond: {
        normal: `${window.location.origin}/assets/font/EBGaramond-Regular.ttf`,
        bold: `${window.location.origin}/assets/font/EBGaramond-Bold.ttf`,
        italics: `${window.location.origin}/assets/font/EBGaramond-Italic.ttf`,
      }
    };

    const companyName = grnData.purchaseOrderId?.quoteId?.quoteCompany ||
                       grnData.purchaseOrderId?.purchaseId?.jobId?.quoteId?.quoteCompany ||
                       '';

    const itemTableHeader = [
      { text: 'Sl.\nNo', style: 'tableSlNo' },
      { text: 'Part No.', style: 'tableHeader' },
      { text: 'Item Description', style: 'tableHeader' },
      { text: 'UOM', style: 'tableHeader' },
      { text: 'Ordered Qty', style: 'tableHeader' },
      { text: 'Received Qty', style: 'tableHeader' },
      { text: 'Accepted Qty', style: 'tableHeader' },
      { text: 'Rejected Qty', style: 'tableHeader' },
      { text: 'Remark', style: 'tableHeader' },
      { text: 'Date', style: 'tableHeader' },
    ];

    const tableBody: any[] = [];
    let serialNumber = 1;

    selectedItems.forEach((item: any) => {
      const rejectedQty = item.rejectedQty !== undefined && item.rejectedQty !== null
        ? item.rejectedQty
        : (item.receivedQty || 0) - (item.acceptedQty || 0);
      const partNo = typeof item.partNo === 'string' ? item.partNo : (item.partNo?.partNo || '-');
      const itemDate = item.date ? new Date(item.date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'N/A';
      const remarksText = item.remarks || '-';
      
      tableBody.push([
        { text: serialNumber++, style: 'tableText', alignment: 'center' },
        { text: partNo, style: 'tableText', alignment: 'center' },
        { text: item.itemDescription || '-', style: 'tableText' },
        { text: item.uom || '-', style: 'tableText', alignment: 'center' },
        { text: (item.orderedQty || 0).toString(), style: 'tableText', alignment: 'center' },
        { text: (item.receivedQty || 0).toString(), style: 'tableText', alignment: 'center' },
        { text: (item.acceptedQty || 0).toString(), style: 'tableText', alignment: 'center' },
        { text: rejectedQty.toString(), style: 'tableText', alignment: 'center' },
        { text: remarksText, style: 'tableText', alignment: 'center' },
        { text: itemDate, style: 'tableText', alignment: 'center' },
      ]);
    });

    const formatDateForPDF = (date: any): string => {
      if (!date) return 'N/A';
      const d = new Date(date);
      const day = d.getDate().toString().padStart(2, '0');
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const month = months[d.getMonth()];
      const year = d.getFullYear();
      return `${day}-${month}-${year}`;
    };

    const grnDate = formatDateForPDF(grnData.grnDate);
    const invoiceDate = formatDateForPDF(grnData.supplierInvoiceDate);

    const documentDefinition: any = {
      defaultStyle: {
        font: 'EBGaramond'
      },
      pageMargins: [45, 45, 45, 45],
      content: [
        {
          text: 'GRN Receipt',
          style: 'mainHeading',
          margin: [0, 0, 0, 10]
        },
        {
          text: companyName || 'N/A',
          style: 'companyHeading',
          margin: [0, 0, 0, 20]
        },
        {
          style: 'infoTable',
          table: {
            widths: ['*', '*'],
            body: [
              [{ style: 'infoLabel', text: 'GRN No:' }, { style: 'infoValue', text: grnData.grnNo || 'N/A' }],
              [{ style: 'infoLabel', text: 'GRN Receipt Date:' }, { style: 'infoValue', text: grnDate }],
              [{ style: 'infoLabel', text: 'Supplier Name:' }, { style: 'infoValue', text: grnData.purchaseOrderId?.supplierId?.supplierName || 'N/A' }],
              [{ style: 'infoLabel', text: 'Supplier Invoice No.:' }, { style: 'infoValue', text: grnData.supplierInvoiceNo || 'N/A' }],
              [{ style: 'infoLabel', text: 'Invoice Date:' }, { style: 'infoValue', text: invoiceDate }],
              [{ style: 'infoLabel', text: 'Linked LPO No.:' }, { style: 'infoValue', text: grnData.purchaseOrderId?.poNo || 'N/A' }],
              [{ style: 'infoLabel', text: 'Job ID:' }, { style: 'infoValue', text: grnData.purchaseOrderId?.purchaseId?.jobId?.jobId || 'N/A' }],
              [{ style: 'infoLabel', text: 'Delivery Note No.:' }, { style: 'infoValue', text: grnData.supplierDeliveryNoteNo || 'N/A' }],
              [{ style: 'infoLabel', text: 'Received By:' }, { style: 'infoValue', text: this.formatEmployeeName(grnData.receivedBy) || 'N/A' }],
              [{ style: 'infoLabel', text: 'Warehouse / Location:' }, { style: 'infoValue', text: grnData.warehouse?.wareHouseName || 'N/A' }],
            ]
          },
          margin: [0, 0, 0, 20]
        },
        {
          table: {
            headerRows: 1,
            widths: [25, 40, '*', 40, 35, 40, 40, 45, 45, 50],
            body: [
              itemTableHeader,
              ...tableBody
            ]
          },
          margin: [0, 0, 0, 0]
        }
      ],
      styles: {
        tableHead: {
          color: 'black',
          fontSize: 10
        },
        infoLabel: {
          color: 'black',
          fontSize: 10,
          bold: true,
          margin: [0, 3, 0, 3]
        },
        infoValue: {
          color: 'black',
          fontSize: 10,
          margin: [0, 3, 0, 3]
        },
        tableHeader: {
          fontSize: 10,
          alignment: 'center',
          margin: [0, 5],
          fillColor: "#1E4E79",
          color: 'white',
          bold: true
        },
        tableSlNo: {
          bold: true,
          fontSize: 10,
          alignment: 'center',
          margin: [0, 5],
          fillColor: "#1E4E79",
          color: 'white'
        },
        tableText: {
          fontSize: 9
        },
        mainHeading: {
          fontSize: 18,
          bold: true,
          alignment: 'center',
          color: '#1E3964',
          margin: [0, 0, 0, 10]
        },
        companyHeading: {
          fontSize: 14,
          bold: false,
          alignment: 'center',
          color: '#444',
          margin: [0, 0, 0, 20]
        },
        infoTable: {
          margin: [0, 5, 0, 5]
        }
      }
    };

    const pdfDoc = pdfMake.createPdf(documentDefinition);
    return pdfDoc;
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
