import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { Invoice, InvoiceListResponse, InvoiceFilterParams } from 'src/app/shared/interfaces/invoice.interface';
import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';

@Injectable({
    providedIn: 'root'
})
export class InvoiceService {

    api: string = environment.api;

    constructor(private http: HttpClient) { }

    getInvoices(params: InvoiceFilterParams): Observable<InvoiceListResponse> {
        return this.http.get<InvoiceListResponse>(`${this.api}/invoice`, { params: params as any });
    }

    getInvoiceDnLinkingReport(params: any): Observable<any> {
        return this.http.get<any>(`${this.api}/invoice/dn-linking-report`, { params });
    }

  getJobItemInvoicedQty(jobId: string, excludeInvoiceId?: string): Observable<any> {
      const params: any = {};
      if (excludeInvoiceId) {
          params.excludeInvoiceId = excludeInvoiceId;
      }
      return this.http.get<any>(`${this.api}/invoice/item-invoiced-qty/${jobId}`, { params });
  }

    private getBase64ImageFromURL(url: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.setAttribute('crossOrigin', 'anonymous');
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.drawImage(img, 0, 0);
                    const dataURL = canvas.toDataURL('image/png');
                    resolve(dataURL);
                } else {
                    reject(new Error('Could not get canvas context'));
                }
            };
            img.onerror = (error) => reject(error);
            img.src = url;
        });
    }

    async generateInvoicePDF(invoice: any) {
        pdfMake.vfs = pdfFonts.vfs;

        (pdfMake as any).fonts = {
            EBGaramond: {
                normal: `${window.location.origin}/assets/font/EBGaramond-Regular.ttf`,
                bold: `${window.location.origin}/assets/font/EBGaramond-Bold.ttf`,
                italics: `${window.location.origin}/assets/font/EBGaramond-Italic.ttf`,
            }
        };

        const items = invoice.items || [];
        const tableBody: any[] = [];

        items.forEach((item: any, index: number) => {
            tableBody.push([
                { text: String(index + 1).padStart(2, '0'), style: 'tableText', alignment: 'center' },
                { text: item.description || '-', style: 'tableText' },
                { text: String(item.quantity || 0), style: 'tableText', alignment: 'center' },
                { text: String((item.amount / item.quantity) || 0), style: 'tableText', alignment: 'right' },
                { text: String(item.amount || 0), style: 'tableText', alignment: 'right' }
            ]);
        });

        const currency = invoice.currency || 'QAR';
        
        tableBody.push([
            { text: `Total (${currency})`, style: 'tableFooter', colSpan: 4, alignment: 'left' }, '', '', '',
            { text: String(invoice.amount || 0), style: 'tableFooter', alignment: 'right' },
          ]);
        
        const quoteCompany = (invoice.quoteCompany || '').toString().toLowerCase();
        const isSecurity = quoteCompany.includes('security');

        const bankStack = isSecurity
            ? [
                { text: 'BANK DETAILS:', style: 'bankLabel', margin: [0, 15, 0, 5], decoration: 'underline' },
                {
                    text: [
                        { text: 'Account name : ', style: 'bankLabel' },
                        { text: 'Neuron Security System', style: 'bankValue' }
                    ],
                    margin: [0, 0, 0, 5]
                },
                {
                    text: [
                        { text: 'A/c No : ', style: 'bankLabel' },
                        { text: '01549719900019', style: 'bankValue' }
                    ],
                    margin: [0, 0, 0, 5]
                },
                {
                    text: [
                        { text: 'IBAN : ', style: 'bankLabel' },
                        { text: 'QA18QISB000000000154971990019', style: 'bankValue' }
                    ],
                    margin: [0, 0, 0, 5]
                },
                {
                    text: [
                        { text: 'Bank Name : ', style: 'bankLabel' },
                        { text: 'QIB', style: 'bankValue' }
                    ],
                    margin: [0, 0, 0, 5]
                }
            ]
            : [
                { text: 'BANK DETAILS:', style: 'bankLabel', margin: [0, 15, 0, 5], decoration: 'underline' },
                {
                    text: [
                        { text: 'Account name : ', style: 'bankLabel' },
                        { text: 'Neuron Technologies Trading & Maintenance W.L.L', style: 'bankValue' }
                    ],
                    margin: [0, 0, 0, 5]
                },
                {
                    text: [
                        { text: 'A/c No : ', style: 'bankLabel' },
                        { text: '0250074492001', style: 'bankValue' }
                    ],
                    margin: [0, 0, 0, 5]
                },
                {
                    text: [
                        { text: 'IBAN : ', style: 'bankLabel' },
                        { text: 'QA93QNBA000000000250074492001', style: 'bankValue' }
                    ],
                    margin: [0, 0, 0, 5]
                },
                {
                    text: [
                        { text: 'Bank Name : ', style: 'bankLabel' },
                        { text: 'Qatar National Bank (QNB)', style: 'bankValue' }
                    ],
                    margin: [0, 0, 0, 5]
                },
                {
                    text: [
                        { text: 'Swift Code : ', style: 'bankLabel' },
                        { text: 'QNBAQAQAXXX', style: 'bankValue' }
                    ],
                    margin: [0, 0, 0, 5]
                }
            ];

        const documentDefinition: any = {
            defaultStyle: {
                font: 'EBGaramond'
            },
            background: {
                image: await this.getBase64ImageFromURL(
                    '../../assets/images/logo.webp'
                ),
                width: 450,
                alignment: 'center',
                valign: 'center',
                margin: [0, 220, 0, 0]
            },
            header: {
                image: await this.getBase64ImageFromURL(
                    '../../assets/images/pdfheader.jpg'
                ),
                width: 550,
                alignment: 'center',
                margin: [0, 25, 0, 0]
            },
            footer: {
                image: await this.getBase64ImageFromURL(
                    '../../assets/images/pdfFooter.png'
                ),
                width: 600,
                alignment: 'center',
                margin: [0, 25, 0, 0]
            },
            pageMargins: [45, 115, 45, 100],
            content: [
                {
                    style: 'header',
                    table: {
                        heights: 20,
                        widths: '*',
                        body: [[
                            {
                                style: 'mainHead',
                                border: [1, 1, 1, 1],
                                fillColor: '#1f3864',
                                text: 'INVOICE',
                                alignment: 'center',
                                margin: [0, 3, 0, 3]
                            }]]
                    }
                },
                {
                    style: 'tableExample',
                    color: '#444',
                    margin: [0, 10, 0, 15],
                    table: {
                        widths: [73.66, '*', 10, '*', 85.60, '*'],
                        body: [
                            [
                                { style: 'tableHead', text: 'Client:', alignment: 'left' },
                                { style: 'tableHead', text: invoice.customer?.companyName || '-', alignment: 'left', colSpan: 3 }, {}, {},
                                { style: 'tableHead', text: 'Invoice Date:', alignment: 'left' },
                                { style: 'tableHead', text: new Date(invoice.date).toLocaleDateString('en-GB'), alignment: 'left' }
                            ],
                            [
                                { style: 'tableHead', text: 'Invoice No:', alignment: 'left' },
                                { style: 'tableHead', text: invoice.invoiceNo || '-', alignment: 'left', colSpan: 3, bold: true }, {}, {},
                                { style: 'tableHead', text: 'Payment Terms:', alignment: 'left' },
                                { style: 'tableHead', text: invoice.paymentTerms || '-', alignment: 'left' }
                            ],
                            [
                                { style: 'tableHead', text: 'DN No:', alignment: 'left' },
                                { style: 'tableHead', text: invoice.dnNumbers || '-', alignment: 'left', colSpan: 3 }, {}, {},
                                { style: 'tableHead', text: 'LPO Ref:', alignment: 'left' },
                                { style: 'tableHead', text: invoice.lpoRef || '-', alignment: 'left' }
                            ],
                            [
                                { style: 'tableHead', text: 'Sub:', alignment: 'left' },
                                { style: 'tableHead', text: invoice.subject || '-', alignment: 'left', colSpan: 3 }, {}, {},
                                { style: 'tableHead', text: 'Job No:', alignment: 'left' },
                                { style: 'tableHead', text: invoice.jobId?.jobId || '-', alignment: 'left' }
                            ]
                        ]
                    }
                },
                {
                    table: {
                        headerRows: 1,
                        widths: [40, '*', 60, 80, 80],
                        body: [
                            [
                                { text: 'SL.\nNo.', style: 'tableHeader', alignment: 'center' },
                                { text: 'DESCRIPTION', style: 'tableHeader' },
                                { text: 'QTY', style: 'tableHeader', alignment: 'center' },
                                { text: `UNIT PRICE (${currency})`, style: 'tableHeader', alignment: 'right' },
                                { text: `TOTAL AMOUNT (${currency})`, style: 'tableHeader', alignment: 'right' }
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
                },
                {
                    width: '*',
                    stack: bankStack,
                    alignment: 'left'
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
                bankLabel: {
                    fontSize: 11,
                    bold: true,
                    margin: [0, 2, 0, 2]
                },
                bankValue: {
                    fontSize: 11,
                    margin: [0, 0, 0, 0]
                },
                tableHeader: {
                    fontSize: 10,
                    bold: true,
                    fillColor: '#8496b0',
                    color: 'white',
                    margin: [5, 5, 5, 5],
                    alignment: 'center'
                },
                tableFooter: {
                    fontSize: 10,
                    bold: true,
                    fillColor: '#d5dce4',
                    margin: [5, 5, 5, 5],
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

        return pdfMake.createPdf(documentDefinition);
    }

    createInvoice(data: Partial<Invoice>): Observable<any> {
        return this.http.post<any>(`${this.api}/invoice`, data);
    }

    getInvoiceById(id: string): Observable<any> {
        return this.http.get<any>(`${this.api}/invoice/${id}`);
    }

    updateInvoice(id: string, data: Partial<Invoice>): Observable<any> {
        return this.http.put<any>(`${this.api}/invoice/${id}`, data);
    }

    cancelInvoice(id: string, data: { reason: string }): Observable<any> {
        return this.http.patch<any>(`${this.api}/invoice/${id}/cancel`, data);
    }

    cancelAndReissueInvoice(id: string, data: { reason: string }): Observable<any> {
        return this.http.post<any>(`${this.api}/invoice/${id}/cancel-reissue`, data);
    }

    generateInvoiceNumber(): Observable<{ success: boolean, invoiceNo: string }> {
        return this.http.get<{ success: boolean, invoiceNo: string }>(`${this.api}/invoice/generate-number`);
    }

    getCancelledAdjustedInvoices(params: any): Observable<any> {
        return this.http.get<any>(`${this.api}/invoice/audit`, { params });
    }

    getCancelledReissuedInvoices(params: any): Observable<any> {
        return this.http.get<any>(`${this.api}/invoice/cancelled-reissued-report`, { params });
    }
}
