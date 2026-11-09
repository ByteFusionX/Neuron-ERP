import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { Invoice, InvoiceListResponse, InvoiceFilterParams } from 'src/app/shared/interfaces/invoice.interface';
import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import { SKIP_ERROR_TOAST } from 'src/app/core/interceptors/error-interceptor/error.interceptor';

// Methods below flagged with context() are called only from components that already
// show their own error toast on failure, so requests opt out of the interceptor's global toast.
const context = () => new HttpContext().set(SKIP_ERROR_TOAST, true);

@Injectable({
    providedIn: 'root'
})
export class InvoiceService {

    api: string = environment.api;

    constructor(private http: HttpClient) { }

    getInvoices(params: InvoiceFilterParams): Observable<InvoiceListResponse> {
        return this.http.get<InvoiceListResponse>(`${this.api}/invoice`, { params: params as any, context: context() });
    }

    getInvoiceDnLinkingReport(params: any): Observable<any> {
        return this.http.get<any>(`${this.api}/invoice/dn-linking-report`, { params, context: context() });
    }

    getInvoiceByInvoiceNo(invoiceNo: string): Observable<any> {
        return this.http.get<any>(`${this.api}/invoice/by-invoice-no/${invoiceNo}`, { context: context() });
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

    async generateInvoicePDF(invoice: any, includeStamp = false) {
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
        if (!invoice.isProforma && Number(invoice.discount) > 0) {
            tableBody.push(
                [{ text: `Discount (${currency})`, style: 'tableFooter', colSpan: 4, alignment: 'left' }, '', '', '', { text: String(invoice.discount), style: 'tableFooter', alignment: 'right' }],
                [{ text: `Net Total (${currency})`, style: 'tableFooter', colSpan: 4, alignment: 'left' }, '', '', '', { text: String(Math.max(0, Math.round((Number(invoice.amount || 0) - Number(invoice.discount)) * 100) / 100)), style: 'tableFooter', alignment: 'right' }],
            );
        }
        
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

        // Proforma layout: boxed client block, blue item table, claim rows, then bank details and sign-off.
        const box = { hLineWidth: () => 1.5, vLineWidth: () => 1.5 };
        const cell = (text: string, extra: any = {}) => ({ text, fontSize: 10, margin: [2, 2, 2, 2], ...extra });
        const proformaContent: any[] | null = invoice.isProforma ? [
            {
                table: {
                    widths: ['*'],
                    body: [[{ text: invoice.documentTitle || 'PROFORMA INVOICE', style: 'mainHead', border: [false, false, false, false], fillColor: '#1E3964', alignment: 'center', margin: [0, 3, 0, 3] }]]
                }
            },
            {
                layout: box, margin: [0, 8, 0, 15],
                table: {
                    widths: [45, '*', 75, '*'],
                    body: [
                        [cell('PI No'), cell(invoice.invoiceNo || '-', { bold: true }), cell('PI Date'), cell(new Date(invoice.date).toLocaleDateString('en-GB').replace(/\//g, '-'))],
                        [cell('Client'), cell((invoice.customer?.companyName || '-').toUpperCase()), cell('Payment Terms'), cell((invoice.paymentTerms || '-').toUpperCase(), { bold: true })],
                        [cell('Atten'), cell(invoice.attention || '-'), cell('LPO, No:'), cell(invoice.lpoRef || '-')],
                        [cell('Ship To'), cell((invoice.shipTo || invoice.customer?.companyName || '-').toUpperCase()), cell('Job No:'), cell(invoice.jobId?.jobId || invoice.jobNo || '-')],
                    ]
                }
            },
            {
                layout: { ...box, hLineColor: () => '#000', vLineColor: () => '#000' }, margin: [0, 0, 0, 20],
                table: {
                    headerRows: 1,
                    widths: [35, '*', 30, 55, 60],
                    body: [
                        ['SL.\nNo.', 'Description', 'Qty', `Unit Price\n(${currency})`, `Total Cost\n(${currency})`].map((t, i) => ({ text: t, bold: true, color: 'white', fillColor: '#1E3964', fontSize: 9, alignment: 'center', margin: [0, 4, 0, 4] })),
                        ...items.map((item: any, index: number) => [
                            cell(String(index + 1).padStart(2, '0'), { alignment: 'center' }),
                            cell(item.description || '-'),
                            cell(String(item.quantity || 0).padStart(2, '0'), { alignment: 'center' }),
                            cell(Number((item.amount / item.quantity) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), { alignment: 'right' }),
                            cell(Number(item.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), { alignment: 'right' }),
                        ]),
                        [cell(`TOTAL (${currency})`, { colSpan: 4 }), {}, {}, {}, cell(Number(invoice.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), { alignment: 'right' })],
                        ...(Number(invoice.discount) > 0 ? [
                            [cell(`DISCOUNT (${currency})`, { colSpan: 4 }), {}, {}, {}, cell(Number(invoice.discount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), { alignment: 'right' })],
                            [cell(`NET TOTAL (${currency})`, { bold: true, colSpan: 4 }), {}, {}, {}, cell(Math.max(0, Number(invoice.amount || 0) - Number(invoice.discount)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), { bold: true, alignment: 'right' })],
                        ] : []),
                        [cell(`${(invoice.paymentTerms || '').toUpperCase()} AMOUNT CLAIM (${currency}):`.trim(), { bold: true, colSpan: 4 }), {}, {}, {}, cell(Number(invoice.claimAmount ?? invoice.amount ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), { bold: true, alignment: 'right' })],
                    ]
                }
            },
            { stack: bankStack, alignment: 'left', margin: [0, 0, 0, 25] },
            {
                unbreakable: true,
                stack: [
                    ...(includeStamp ? [{
                        image: await this.getBase64ImageFromURL('assets/images/stamp.jpg'),
                        width: 90,
                        alignment: 'left',
                        margin: [0, 0, 0, 10],
                    }] : []),
                    { text: 'For, Neuron Technologies W.L.L', bold: true, fontSize: 10, margin: [0, 0, 0, 5] },
                ],
            },
            {
                margin: [90, 0, 0, 0],
                stack: [
                    { text: `For, ${(invoice.customer?.companyName || '').toUpperCase()}`, fontSize: 10, margin: [0, 0, 0, 25] },
                    { text: 'Received by: ……………………………', fontSize: 10, margin: [0, 0, 0, 15] },
                    { text: 'Date…………………………………………', fontSize: 10 },
                ]
            },
        ] : null;

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
                    isSecurity
                        ? '../../assets/images/pdfheader-security.jpg'
                        : '../../assets/images/pdfheader.jpg'
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
            content: proformaContent ?? [
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
                                text: invoice.documentTitle || 'INVOICE',
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
                                { style: 'tableHead', text: invoice.jobId?.jobId || invoice.jobNo || '-', alignment: 'left' }
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
        return this.http.post<any>(`${this.api}/invoice`, data, { context: context() });
    }

    getInvoiceById(id: string): Observable<any> {
        return this.http.get<any>(`${this.api}/invoice/${id}`, { context: context() });
    }

    updateInvoice(id: string, data: Partial<Invoice>): Observable<any> {
        return this.http.put<any>(`${this.api}/invoice/${id}`, data, { context: context() });
    }

    cancelInvoice(id: string, data: { reason: string }): Observable<any> {
        return this.http.patch<any>(`${this.api}/invoice/${id}/cancel`, data, { context: context() });
    }

    cancelAndReissueInvoice(id: string, data: { reason: string }): Observable<any> {
        return this.http.post<any>(`${this.api}/invoice/${id}/cancel-reissue`, data, { context: context() });
    }

    rejectInvoiceByCustomer(id: string, data: { reason: string }): Observable<any> {
        return this.http.patch<any>(`${this.api}/invoice/${id}/reject`, data, { context: context() });
    }

    generateInvoiceNumber(): Observable<{ success: boolean, invoiceNo: string }> {
        return this.http.get<{ success: boolean, invoiceNo: string }>(`${this.api}/invoice/generate-number`, { context: context() });
    }

    getCancelledAdjustedInvoices(params: any): Observable<any> {
        return this.http.get<any>(`${this.api}/invoice/audit`, { params, context: context() });
    }

    getCancelledReissuedInvoices(params: any): Observable<any> {
        return this.http.get<any>(`${this.api}/invoice/cancelled-reissued-report`, { params });
    }
}
