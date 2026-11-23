import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { Invoice, InvoiceListResponse, InvoiceFilterParams } from 'src/app/shared/interfaces/invoice.interface';
import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import { SKIP_ERROR_TOAST } from 'src/app/core/interceptors/error-interceptor/error.interceptor';

import { DEFAULT_CURRENCY } from '../../shared/constants/currency';
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
            // Customer invoices store unitCost/totalCost; proformas store unitPrice/amount.
            const lineTotal = Number(item.amount ?? item.totalCost) || 0;
            const unit = Number(item.unitPrice ?? item.unitCost) || (item.quantity ? lineTotal / item.quantity : 0);
            tableBody.push([
                { text: String(index + 1).padStart(2, '0'), style: 'tableText', alignment: 'center' },
                { text: item.description || '-', style: 'tableText' },
                { text: this.fmt(item.quantity || 0, 0, 3), style: 'tableText', alignment: 'center' },
                { text: this.fmt(unit), style: 'tableText', alignment: 'right' },
                { text: this.fmt(lineTotal), style: 'tableText', alignment: 'right' }
            ]);
        });

        const currency = invoice.currency || DEFAULT_CURRENCY;
        
        tableBody.push([
            { text: `Total (${currency})`, style: 'tableFooter', colSpan: 4, alignment: 'left' }, '', '', '',
            { text: this.fmt(invoice.amount || 0), style: 'tableFooter', alignment: 'right' },
          ]);
        if (!invoice.isProforma && Number(invoice.discount) > 0) {
            tableBody.push(
                [{ text: `Discount (${currency})`, style: 'tableFooter', colSpan: 4, alignment: 'left' }, '', '', '', { text: this.fmt(invoice.discount), style: 'tableFooter', alignment: 'right' }],
                [{ text: `Net Total (${currency})`, style: 'tableFooter', colSpan: 4, alignment: 'left' }, '', '', '', { text: this.fmt(Math.max(0, Math.round((Number(invoice.amount || 0) - Number(invoice.discount)) * 100) / 100)), style: 'tableFooter', alignment: 'right' }],
            );
        }
        
        const netPayable = Math.max(0, Number(invoice.amount || 0) - (Number(invoice.discount) > 0 ? Number(invoice.discount) : 0));
        const wordsText = `${currency ? `(${currency}) ` : ''}${this.amountInWords(netPayable, currency)}`;
        if (!invoice.isProforma) {
            tableBody.push([{ text: wordsText, style: 'tableFooter', colSpan: 5, alignment: 'left' }, '', '', '', '']);
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
        // same type as the invoice / DN: EBGaramond, 12pt info block, 10pt table text
        // proforma: one font (Times New Roman) and one size (10pt) for every label/value/table/bank/sign-off text
        const PF_SIZE = 10;
        const cell = (text: string, extra: any = {}) => ({ text, fontSize: PF_SIZE, margin: [2, 2, 2, 2], ...extra });
        const tcell = (text: string, extra: any = {}) => cell(text, { fontSize: PF_SIZE, margin: [5, 5, 5, 5], ...extra });
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
                        [cell('Atten'), cell(invoice.attention || '-'), cell('LPO No:'), cell(invoice.lpoRef || '-')],
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
                        ['SL.\nNo.', 'Description', 'Qty', `Unit Price\n(${currency})`, `Total Cost\n(${currency})`].map((t, i) => ({ text: t, bold: true, color: 'white', fillColor: '#1E3964', fontSize: PF_SIZE, alignment: 'center', margin: [0, 4, 0, 4] })),
                        ...items.map((item: any, index: number) => [
                            tcell(String(index + 1).padStart(2, '0'), { alignment: 'center' }),
                            tcell(item.description || '-'),
                            tcell(this.fmt(item.quantity || 0, 0, 3), { alignment: 'center' }),
                            tcell(this.fmt((item.amount / item.quantity) || 0), { alignment: 'right' }),
                            tcell(this.fmt(item.amount || 0), { alignment: 'right' }),
                        ]),
                        [tcell(`TOTAL (${currency})`, { colSpan: 4 }), {}, {}, {}, tcell(this.fmt(invoice.amount || 0), { alignment: 'right' })],
                        ...(Number(invoice.discount) > 0 ? [
                            [tcell(`DISCOUNT (${currency})`, { colSpan: 4 }), {}, {}, {}, tcell(this.fmt(invoice.discount), { alignment: 'right' })],
                            [tcell(`NET TOTAL (${currency})`, { bold: true, colSpan: 4 }), {}, {}, {}, tcell(this.fmt(Math.max(0, Number(invoice.amount || 0) - Number(invoice.discount))), { bold: true, alignment: 'right' })],
                        ] : []),
                        [tcell(wordsText, { bold: true, colSpan: 5 }), {}, {}, {}, {}],
                        [tcell(`${(invoice.paymentTerms || '').toUpperCase()} AMOUNT CLAIM (${currency}):`.trim(), { bold: true, colSpan: 4 }), {}, {}, {}, tcell(this.fmt(invoice.claimAmount ?? invoice.amount ?? 0), { bold: true, alignment: 'right' })],
                    ]
                }
            },
            { stack: bankStack.map((b: any) => invoice.isProforma ? { ...b, ...(b.text && Array.isArray(b.text) ? { text: b.text.map((t: any) => ({ ...t, fontSize: PF_SIZE })) } : { fontSize: PF_SIZE }) } : b), alignment: 'left', margin: [0, 0, 0, 25] },
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
                unbreakable: true,
                columns: [
                    { width: '*', text: '' },
                    {
                        width: 250,
                        stack: [
                            { text: `For, ${(invoice.customer?.companyName || '').toUpperCase()}`, fontSize: PF_SIZE, bold: true, margin: [0, 0, 0, 25] },
                            { text: 'Received by : ____________________________', fontSize: PF_SIZE, margin: [0, 0, 0, 15] },
                            { text: 'Date : ________________________________', fontSize: PF_SIZE },
                        ]
                    },
                ]
            },
        ] : null;

        const documentDefinition: any = {
            defaultStyle: {
                font: 'EBGaramond',
                fontSize: 10
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
                    fontSize: 10,
                    bold: true,
                    margin: [0, 2, 0, 2]
                },
                bankValue: {
                    fontSize: 10,
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

    private fmt(value: any, minFrac = 2, maxFrac = 2): string {
        const n = Number(value);
        return isNaN(n) ? '' : n.toLocaleString('en-US', { minimumFractionDigits: minFrac, maximumFractionDigits: maxFrac });
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
}
