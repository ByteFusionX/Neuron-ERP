import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable } from '@angular/core';
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
export class DeliveryNoteService {
  private apiUrl = `${environment.api}/delivery-note`;

  constructor(private http: HttpClient) { }

  generateDnNumber(): Observable<{ dnNumber: string }> {
    return this.http.get<{ dnNumber: string }>(`${this.apiUrl}/generate-dn-number`);
  }

  createDn(data: any): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}`, data);
  }

  updateDn(id: string, data: any): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/${id}`, data);
  }

  getDnsByJobId(jobId: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/job/${jobId}`);
  }

  getDraftDnByJobId(jobId: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/draft/${jobId}`);
  }

  getDnItemsForJob(jobId: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/items-for-job/${jobId}`);
  }

  getAllDeliveryNotes(filter: any): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/get`, filter, { context: context() });
  }

  getReadyForDnReceipts(filter: { page: number; row: number; search?: string }): Observable<any> {
    const params: any = { page: filter.page, row: filter.row };
    if (filter.search) params.search = filter.search;
    return this.http.get<any>(`${this.apiUrl}/ready-for-dn`, { params, context: context() });
  }

  getPendingDeliveries(filter: any): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/pending`, filter);
  }


  getPendingDeliveryDetails(jobId: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/pending/${jobId}`);
  }

  getDnById(id: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/${id}`);
  }

  /** Latest live invoice billing this DN; 404 when none is raised yet. */
  getDnInvoice(id: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/${id}/invoice`, { context: context() });
  }

  cancelDn(id: string): Observable<any> {
    return this.http.patch<any>(`${this.apiUrl}/${id}/cancel`, {});
  }

  dispatchDn(id: string): Observable<any> {
    return this.http.patch<any>(`${this.apiUrl}/${id}/dispatch`, {});
  }

  rejectDnItems(id: string, data: { items: { itemId: string; rejectedQty: number; reason?: string }[]; reason: string }): Observable<any> {
    return this.http.patch<any>(`${this.apiUrl}/${id}/reject`, data);
  }

  completePod(id: string, data: any): Observable<any> {
    return this.http.patch<any>(`${this.apiUrl}/${id}/pod`, data);
  }

  /** Closes a dispatched DN: who delivered it and when, plus optional receiver and proof files. */
  confirmDelivery(id: string, data: { receivedDate: string; deliveredBy: string; receivedBy?: string; remarks?: string }, files: File[] = []): Observable<any> {
    const body = new FormData();
    body.append('receivedDate', data.receivedDate);
    body.append('deliveredBy', data.deliveredBy);
    if (data.receivedBy) body.append('receivedBy', data.receivedBy);
    if (data.remarks) body.append('remarks', data.remarks);
    files.forEach((file) => body.append('files', file));
    return this.http.patch<any>(`${this.apiUrl}/${id}/pod`, body);
  }


  getBase64ImageFromURL(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.setAttribute("crossOrigin", "anonymous");
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          const dataURL = canvas.toDataURL("image/png");
          resolve(dataURL);
        } else {
          reject(new Error("Could not get canvas context"));
        }
      };
      img.onerror = (error) => reject(error);
      img.src = url;
    });
  }

  async generatePDF(dnData: any, includeStamp: boolean = true) {
    pdfMake.vfs = pdfFonts.vfs;

    (pdfMake as any).fonts = {
      EBGaramond: {
        normal: `${window.location.origin}/assets/font/EBGaramond-Regular.ttf`,
        bold: `${window.location.origin}/assets/font/EBGaramond-Bold.ttf`,
        italics: `${window.location.origin}/assets/font/EBGaramond-Italic.ttf`,
      }
    };

    const items = dnData.items || [];
    const tableBody: any[] = [];
    const fmt = (d: any) => d ? new Date(d).toLocaleDateString('en-GB') : '';

    // Description carries part no and serials underneath, as the template has only SL / Description / Qty.
    items.forEach((item: any, index: number) => {
      const serials = Array.isArray(item.serialNos) && item.serialNos.length ? item.serialNos.join(', ') : '';
      tableBody.push([
        { text: String(index + 1).padStart(2, '0'), style: 'tableText', alignment: 'center' },
        {
          stack: [
            { text: item.description || '-', style: 'tableText', margin: [5, 5, 5, item.partNo || serials ? 0 : 5] },
            ...(item.partNo ? [{ text: `Part No: ${item.partNo}`, style: 'subText' }] : []),
            ...(serials ? [{ text: `S/N: ${serials}`, style: 'subText' }] : []),
          ]
        },
        { text: String(item.currentDeliveryQty || 0), style: 'tableText', alignment: 'center' },
      ]);
    });

    const deliveryDate = dnData.pod?.receivedDate || dnData.dispatchedAt || dnData.dnDate;
    const lineValue = '...............................................';
    const receivedRow = (label: string, value: string, height = 0) => [
      { text: label, style: 'label', margin: [4, 4, 4, 4 + height] },
      { text: ':', style: 'label', margin: [0, 4, 0, 4] },
      { text: value || lineValue, style: 'text', margin: [4, 4 + height, 4, 4] },
    ];

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
          "../../assets/images/pdfheader.jpg"
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
                "border": [1, 1, 1, 1],
                "fillColor": "#c5966a",
                "text": "DELIVERY NOTE",
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
            widths: [73.66, '*', 10, '*', 85.60, '*'],
            body: [
              [{ style: 'tableHead', text: 'Client:', alignment: 'left' }, { style: 'tableHead', text: dnData.clientName || '-', alignment: 'left', colSpan: 3 }, {}, {}, { style: 'tableHead', text: 'Delivery Date:', alignment: 'left' }, { style: 'tableHead', text: fmt(deliveryDate) || '-', alignment: 'left' }],
              [{ style: 'tableHead', text: 'Invoice No:', alignment: 'left' }, { style: 'tableHead', text: dnData.invoiceNo || '-', alignment: 'left', colSpan: 3, bold: true }, {}, {}, { style: 'tableHead', text: 'Payment Terms:', alignment: 'left' }, { style: 'tableHead', text: dnData.paymentTerms || '-', alignment: 'left' }],
              [{ style: 'tableHead', text: 'DN. No:', alignment: 'left' }, { style: 'tableHead', text: dnData.dnNo || '-', alignment: 'left', colSpan: 3, bold: true }, {}, {}, { style: 'tableHead', text: 'LPO. Ref:', alignment: 'left' }, { style: 'tableHead', text: dnData.customerLpoNumber || '-', alignment: 'left' }],
              [{ style: 'tableHead', text: 'Sub:', alignment: 'left' }, { style: 'tableHead', text: dnData.subject || '-', alignment: 'left', colSpan: 3 }, {}, {}, { style: 'tableHead', text: 'Job No:', alignment: 'left' }, { style: 'tableHead', text: dnData.jobId?.jobId || dnData.job?.jobId || '-', alignment: 'left' }],
            ]
          }
        },
        {
          table: {
            headerRows: 1,
            widths: [40, '*', 80],
            body: [
              [
                { text: 'SL. No.', style: 'tableHeader', alignment: 'center' },
                { text: 'DESCRIPTION', style: 'tableHeader' },
                { text: 'QTY', style: 'tableHeader', alignment: 'center' }
              ],
              ...tableBody
            ]
          },
          margin: [0, 0, 0, 30]
        },
        {
          columns: [
            {
              width: '*',
              stack: [
                { text: 'Thanking you', style: 'text', margin: [0, 0, 0, 5] },
                { text: [{ text: 'For ' }, { text: 'Neuron Technologies W.L.L', bold: true }], style: 'text' }
              ]
            },

          ]
        },
        {
          columns: [
            { width: '*', text: '' },
            {
              width: 200,
              margin: [0, 30, 0, 0],
              table: {
                widths: [55, 8, '*'],
                body: [
                  receivedRow('Received by', dnData.pod?.receivedBy),
                  receivedRow('Signature', '', 12),
                  receivedRow('Contact No', dnData.pod?.receivedContactNo),
                  receivedRow('Date', fmt(dnData.pod?.receivedDate)),
                ]
              },
              layout: { hLineColor: () => '#d1d5db', vLineColor: () => '#d1d5db', vLineWidth: (i: number) => (i === 0 || i === 3 ? 1 : 0) }
            }
          ]
        }
      ],
      styles: {
        mainHead: {
          fontSize: 14,
          color: 'white',
          bold: true
        },
        infoRow: {
          fontSize: 10,
          margin: [0, 0, 0, 0]
        },
        label: {
          fontSize: 10,
          bold: true,
          margin: [0, 2, 0, 2]
        },
        value: {
          fontSize: 10,
          margin: [0, 0, 0, 0]
        },
        tableHeader: {
          fontSize: 10,
          bold: true,
          fillColor: '#e6cdb1',
          margin: [5, 5, 5, 5],
          alignment: 'center'
        },
        tableText: {
          fontSize: 10,
          margin: [5, 5, 5, 5]
        },
        subText: {
          fontSize: 8,
          color: '#6b7280',
          margin: [5, 1, 5, 4]
        },
        text: {
          fontSize: 10,
          margin: [0, 0, 0, 0]
        },
        dottedLine: {
          fontSize: 10,
          margin: [0, 0, 0, 0]
        }
      }
    };

    const pdfDoc = pdfMake.createPdf(documentDefinition);
    return pdfDoc;
  }
}
