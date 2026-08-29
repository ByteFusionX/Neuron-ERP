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

  getPendingDeliveries(filter: any): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/pending`, filter);
  }

  getInvoiceLinking(filter: any): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/invoice-linking`, filter, { context: context() });
  }

  getPendingDeliveryDetails(jobId: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/pending/${jobId}`);
  }

  getDnById(id: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/${id}`);
  }

  cancelDn(id: string): Observable<any> {
    return this.http.patch<any>(`${this.apiUrl}/${id}/cancel`, {});
  }

  rejectDnItems(id: string, data: { items: { itemId: string; rejectedQty: number; reason?: string }[]; reason: string }): Observable<any> {
    return this.http.patch<any>(`${this.apiUrl}/${id}/reject`, data);
  }

  getInventoryDeductionReport(params: any): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/inventory-deduction-report`, params, { context: context() });
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

    items.forEach((item: any, index: number) => {
      tableBody.push([
        { text: String(index + 1).padStart(2, '0'), style: 'tableText', alignment: 'center' },
        { text: item.description || '-', style: 'tableText' },
        { text: String(item.currentDeliveryQty || 0), style: 'tableText', alignment: 'center' }
      ]);
    });

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
              [{ style: 'tableHead', text: 'Client:', alignment: 'left' }, { style: 'tableHead', text: dnData.clientName || '-', alignment: 'left', colSpan: 3 }, {}, {}, { style: 'tableHead', text: 'DN Date:', alignment: 'left' }, { style: 'tableHead', text: new Date(dnData.dnDate).toLocaleDateString('en-GB'), alignment: 'left' }],
              [{ style: 'tableHead', text: 'DN No:', alignment: 'left' }, { style: 'tableHead', text: dnData.dnNo || '-', alignment: 'left', colSpan: 3, bold: true }, {}, {}, { style: 'tableHead', text: 'Payment Terms:', alignment: 'left' }, { style: 'tableHead', text: dnData.paymentTerms || '-', alignment: 'left' }],
              [{ style: 'tableHead', text: 'Subject:', alignment: 'left' }, { style: 'tableHead', text: dnData.subject || '-', alignment: 'left', colSpan: 3 }, {}, {}, { style: 'tableHead', text: 'LPO Ref:', alignment: 'left' }, { style: 'quoteId', text: dnData.customerLpoNumber, alignment: 'left' }],
              [{ style: 'tableHead', text: 'Job No:', alignment: 'left' }, { style: 'tableHead', text: dnData.jobId?.jobId || '-', alignment: 'left', colSpan: 3 }, {}, {}, { style: 'tableHead', text: '', alignment: 'left' }, { style: 'tableHead', text: ``, alignment: 'left' }],
            ]
          }
        },
        {
          table: {
            headerRows: 1,
            widths: [40, '*', 60],
            body: [
              [
                { text: 'SL.\nNo.', style: 'tableHeader', alignment: 'center' },
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
                { text: 'For Neuron Technologies W.L.L.', style: 'text' }
              ]
            },

          ]
        },
        {
          width: '*',
          stack: [
            { text: 'Received by : __________________________________', style: 'label', margin: [0, 0, 0, 5] },
            { text: 'Signature : __________________________________', style: 'label', margin: [0, 15, 0, 5] },
            { text: 'Contact No : __________________________________', style: 'label', margin: [0, 5, 0, 5] },
            { text: 'Date : __________________________________', style: 'label', margin: [0, 5, 0, 5] }
          ],
          alignment: 'right'
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
