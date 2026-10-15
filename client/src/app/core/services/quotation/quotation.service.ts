import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom, Observable } from 'rxjs';
import { FilterQuote, QuoteStatus, getQuotation, Quotatation, quotatationForm, getQuotatation, nextQuoteData, dealData, FilterDeal, getDealSheet, ReportDetails, ReportFilter, QuoteRevisionsResponse, QuoteFollowUp } from 'src/app/shared/interfaces/quotation.interface';
import { environment } from 'src/environments/environment';

import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import { SKIP_ERROR_TOAST } from 'src/app/core/interceptors/error-interceptor/error.interceptor';
import { QuotationTemplateSettings, SystemSettingService } from '../system-setting.service';

// Methods below flagged with context() are called only from components that already
// show their own error toast on failure, so requests opt out of the interceptor's global toast.
const context = () => new HttpContext().set(SKIP_ERROR_TOAST, true);

export interface QuoteStockHold {
  lines: { productId: string; partNo: string; detail: string; uom: string; requested: number; available: number; held: number }[];
  /** When the hold lapses if no job has been created; null when nothing is held. */
  expiresAt: string | null;
  /** Won, and the deal is not yet approved (after that the job reserves the stock). */
  canHold: boolean;
}


@Injectable({
  providedIn: 'root'
})
export class QuotationService {

  api: string = environment.api
  constructor(private http: HttpClient, private systemSettings: SystemSettingService) { }

  saveQuotation(quotationDetails: Quotatation): Observable<Quotatation> {
    return this.http.post<Quotatation>(`${this.api}/quotation`, quotationDetails)
  }

  updateQuotation(quotationDetails: Quotatation, quoteId: string | undefined): Observable<Quotatation> {
    return this.http.patch<Quotatation>(`${this.api}/quotation/update/${quoteId}`, quotationDetails)
  }

  getQuotation(filterData: FilterQuote): Observable<getQuotation> {
    return this.http.post<getQuotation>(`${this.api}/quotation/get`, filterData)
  }

  getQuotationById(id: string, access?: string, userId?: string): Observable<Quotatation> {
    return this.http.post<Quotatation>(`${this.api}/quotation/get/${id}`, { access, userId }, { context: context() })
  }

  getQuotationReport(filterData: ReportFilter): Observable<ReportDetails> {
    return this.http.post<ReportDetails>(`${this.api}/quotation/report`, filterData)
  }

  getDealSheet(filterData: FilterDeal): Observable<getDealSheet> {
    return this.http.post<getDealSheet>(`${this.api}/quotation/deal/get`, filterData, { context: context() })
  }

  getApprovedDealSheet(filterData: FilterDeal): Observable<getDealSheet> {
    return this.http.post<getDealSheet>(`${this.api}/quotation/deal/approved/get`, filterData)
  }

  getNextQuoteId(quoteData: nextQuoteData): Observable<{ quoteId: string }> {
    return this.http.post<{ quoteId: string }>(`${this.api}/quotation/nextQuoteId`, quoteData)
  }

  getProductSuggestions(params: { search: string; departments?: string[]; category?: string; includePending?: boolean; lean?: boolean; skip?: number; limit?: number }): Observable<{ success: boolean; message: string; data: any[] }> {
    let httpParams: any = { search: params.search || '' };
    if (params.skip) httpParams.skip = String(params.skip);
    if (params.limit) httpParams.limit = String(params.limit);
    if (params.departments?.length) {
      httpParams.departments = params.departments.join(',');
    }
    if (params.category?.trim()) {
      httpParams.category = params.category.trim();
    }
    if (params.includePending) httpParams.includePending = 'true';
    if (params.lean) httpParams.lean = 'true';
    return this.http.get<{ success: boolean; message: string; data: any[] }>(`${this.api}/quotation/product-suggestions`, { params: httpParams })
  }

  updateQuoteStatus(quoteId: string, status: QuoteStatus, reason?: string): Observable<QuoteStatus> {
    return this.http.patch<QuoteStatus>(`${this.api}/quotation/status/${quoteId}`, { status, reason })
  }

  sendQuote(quoteId: string, data: { recipient: string; emailStatus?: 'prepared' | 'sent' | 'failed'; pdfFileName?: string; note?: string }): Observable<Quotatation> {
    return this.http.post<Quotatation>(`${this.api}/quotation/send/${quoteId}`, data, { context: context() })
  }

  updateQuoteFollowUp(quoteId: string, data: { nextFollowUpDate?: string; reminderOwner?: string; note?: string }): Observable<Quotatation> {
    return this.http.patch<Quotatation>(`${this.api}/quotation/follow-up/${quoteId}`, data, { context: context() })
  }

  scheduleQuoteFollowUp(quoteId: string, data: { dueDate: string; note?: string }): Observable<{ success: boolean; followUp: QuoteFollowUp }> {
    return this.http.patch<{ success: boolean; followUp: QuoteFollowUp }>(`${this.api}/quotation/follow-up/${quoteId}/schedule`, data, { context: context() })
  }

  completeQuoteFollowUp(quoteId: string, data: { date: string; outcome: string; note?: string; nextFollowUpDate?: string | null }): Observable<{ success: boolean; followUp: QuoteFollowUp }> {
    return this.http.patch<{ success: boolean; followUp: QuoteFollowUp }>(`${this.api}/quotation/follow-up/${quoteId}/complete`, data, { context: context() })
  }

  cancelQuoteFollowUp(quoteId: string, reason?: string): Observable<{ success: boolean; followUp: QuoteFollowUp }> {
    return this.http.patch<{ success: boolean; followUp: QuoteFollowUp }>(`${this.api}/quotation/follow-up/${quoteId}/cancel`, { reason }, { context: context() })
  }

  recordCustomerDecision(quoteId: string, data: { decision: 'accepted' | 'rejected' | 'no_response'; reason?: string; competitor?: string; expectedValueLost?: number }): Observable<Quotatation> {
    return this.http.patch<Quotatation>(`${this.api}/quotation/customer-decision/${quoteId}`, data, { context: context() })
  }

  updateOptionalItemDecisions(quoteId: string, decisions: { itemId: string; decision: 'pending' | 'accepted' | 'declined' }[]): Observable<Quotatation> {
    return this.http.patch<Quotatation>(`${this.api}/quotation/optional-decisions/${quoteId}`, { decisions }, { context: context() })
  }

  /** Stock held for a Won quote before it becomes a job: each product line with requested, free and held quantity. */
  getStockHold(quoteId: string): Observable<{ success: boolean; data: QuoteStockHold }> {
    return this.http.get<{ success: boolean; data: QuoteStockHold }>(`${this.api}/quotation/stock-hold/${quoteId}`, { context: context() })
  }

  /** Holds the free stock for `days` days; running it again replaces the earlier hold. */
  holdStock(quoteId: string, days: number): Observable<{ success: boolean; message: string; data: QuoteStockHold }> {
    return this.http.post<{ success: boolean; message: string; data: QuoteStockHold }>(`${this.api}/quotation/stock-hold/${quoteId}`, { days }, { context: context() })
  }

  releaseStockHold(quoteId: string): Observable<{ success: boolean; message: string; data: QuoteStockHold }> {
    return this.http.delete<{ success: boolean; message: string; data: QuoteStockHold }>(`${this.api}/quotation/stock-hold/${quoteId}`, { context: context() })
  }

  saveDealSheet(dealDatas: dealData | FormData, quoteId?: string): Observable<Quotatation> {
    return this.http.patch<Quotatation>(`${this.api}/quotation/deal/${quoteId}`, dealDatas, { context: context() })
  }

  totalQuotations(access?: string, userId?: string): Observable<{ total: number }> {
    return this.http.get<{ total: number }>(`${this.api}/quotation/total?access=${access}&userId=${userId}`)
  }


  uploadLpo(lpoData: FormData): Observable<any> {
    return this.http.post<any>(`${this.api}/quotation/lpo`, lpoData)
  }

  approveDeal(quoteId: string | undefined, comment: string | undefined, userId: string | undefined): Observable<{ success: true; awaitingNextApproval?: boolean; message?: string }> {
    return this.http.post<{ success: true; awaitingNextApproval?: boolean; message?: string }>(`${this.api}/quotation/deal/approve`, { quoteId, userId, comment }, { context: context() })
  }

  rejectDeal(comment: string, quoteId?: string): Observable<{ success: true }> {
    return this.http.post<{ success: true }>(`${this.api}/quotation/deal/reject`, { quoteId, comment })
  }

  revokeDeal(quoteId: string | undefined, userId: string | undefined): Observable<{ success: true }> {
    return this.http.post<{ success: true }>(`${this.api}/quotation/deal/revoke`, { quoteId, userId }, { context: context() })
  }

  /** Super Admin restarts a pending deal's approval route; `stepRoleIds` are the stages that get another chance. */
  resetDealWorkflow(quoteId: string, stepRoleIds: string[]): Observable<{ success: true; message: string }> {
    return this.http.post<{ success: true; message: string }>(`${this.api}/quotation/deal/reset-workflow`, { quoteId, stepRoleIds }, { context: context() })
  }

  markDealAsViewed(quoteIds: any): Observable<any> {
    return this.http.post(`${this.api}/quotation/markAsSeenedDeal`, { quoteIds })
  }

  markAsQuotationSeen(quoteId: any, userId: string): Observable<any> {
    return this.http.post(`${this.api}/quotation/markAsQuotationSeened`, { quoteId, userId })
  }

  removeLpo(fileName: string, quoteId: string): Observable<any> {
    return this.http.delete(`${this.api}/quotation/lpo/${quoteId}/${fileName}`)
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

  async generatePDF(quoteData: getQuotatation, includeStamp?: boolean, template?: QuotationTemplateSettings) {
    if (!template) {
      try {
        template = (await firstValueFrom(this.systemSettings.getDocuments())).data.quotation;
      } catch {
        // Keep quotation output available when settings cannot be loaded.
      }
    }
    const templateSettings: QuotationTemplateSettings = {
      title: template?.title || 'COMMERCIAL PROPOSAL',
      primaryColor: template?.primaryColor || '#1E3964',
      openingText: template?.openingText || 'Reference to your query on the above subject, we are pleased to enclose herewith our OFFER for your perusal and due consideration.',
      showOpening: template?.showOpening !== false,
      showCommercialTerms: template?.showCommercialTerms !== false,
      showTerms: template?.showTerms !== false,
      showNotes: template?.showNotes !== false,
      includeStampByDefault: template?.includeStampByDefault !== false,
    };
    const shouldIncludeStamp = includeStamp ?? templateSettings.includeStampByDefault;
    pdfMake.vfs = pdfFonts.vfs;
    
    (pdfMake as any).fonts = {
      EBGaramond: {
        normal: `${window.location.origin}/assets/font/EBGaramond-Regular.ttf`,
        bold: `${window.location.origin}/assets/font/EBGaramond-Bold.ttf`,
        italics: `${window.location.origin}/assets/font/EBGaramond-Italic.ttf`,
      }
    };
    
    const optionalItems = quoteData.optionalItems;

    if (!quoteData.quoteId) {
      let getQuoteIdData: nextQuoteData = {
        department: quoteData.department,
        createdBy: quoteData.createdBy._id,
        date: quoteData.date
      };
      this.getNextQuoteId(getQuoteIdData).subscribe((res) => {
        quoteData.quoteId = res.quoteId;
      });
    }


    const tables = optionalItems.map((items, index) => {
      // Define a standalone option header as a paragraph
      let optionHeader
      if (optionalItems.length > 1) {
        optionHeader = {
          text: `Option ${index + 1}`,
          style: 'optionHeader',
          margin: [0, 10, 0, 5], // Adjust margins as needed
          alignment: 'left'
        };
      }

      const itemTableHeader = [
        { text: 'Sl.\nNo', style: 'tableSlNo' },
        { text: 'Part Number/Description', style: 'tableHeader' },
        { text: 'Qty', style: 'tableHeader' },
        { text: 'Unit', style: 'tableHeader' },
        { text: `Unit Price (${quoteData.currency})`, style: 'tableHeader' },
        { text: `Total Cost (${quoteData.currency})`, style: 'tableHeader' },
        { text: `Availability`, style: 'tableHeader' },
      ];

      const tableBody: any[] = [];
      let totalCost = 0;
      let serialNumber = 1;
      let hasExcludedOptionalItems = false;

      items.items.forEach(item => {
        const isExcludedOptional = !!item.isOptional && !item.includeInTotal;
        if (isExcludedOptional) {
          hasExcludedOptionalItems = true;
        }

        tableBody.push([
          {
            text: item.itemName + (isExcludedOptional ? '  (Optional)' : ''),
            colSpan: 7,
            style: 'itemRow'
          },
          '', '', '', '', '', ''
        ]);

        item.itemDetails.forEach(detail => {
          const unitPrice = detail.unitSellingPrice;
          const totalPrice = unitPrice * detail.quantity;
          if (!isExcludedOptional) {
            totalCost += totalPrice;
          }

          const segments = detail.detail;
          const result = [];
          const regex = /(\*\*\{[^}]+\}\*\*)|(\*\*[^{]*\*\*)|(\{[^}]*\})|([^{*}]+)/g;
          let match;

          while ((match = regex.exec(segments)) !== null) {
            const [fullMatch] = match;

            if (fullMatch.startsWith('**')) {
              if (fullMatch.includes('{') && fullMatch.includes('}')) {
                const text = fullMatch.slice(3, -3).trim();
                result.push({ text, bold: true, color: 'orange' });
              } else {
                const text = fullMatch.slice(2, -2);
                result.push({ text, bold: true });
              }
            } else if (fullMatch.startsWith('{') && fullMatch.endsWith('}')) {
              const text = fullMatch.slice(1, -1).trim();
              result.push({ text, color: 'orange' });
            } else {
              const text = fullMatch;
              if (text) result.push({ text });
            }
          }

          tableBody.push([
            { text: serialNumber++, style: 'tableText', alignment: 'center' },
            { text: result, style: 'tableText' },
            { text: detail.quantity, style: 'tableText', alignment: 'center' },
            { text: 'Ea', style: 'tableText', alignment: 'center' },
            { text: this.formatNumber(unitPrice), style: 'tableText', alignment: 'center' },
            { text: this.formatNumber(totalPrice), style: 'tableText', alignment: 'center' },
            { text: detail.availability, style: 'tableText', alignment: 'center' },
          ]);
        });
      });

      const totalAmount = [
        { text: 'Sub Total', style: 'tableFooter', colSpan: 5 }, '', '', '', '',
        { text: this.formatNumber(totalCost), style: 'tableFooter' },
        { text: '', style: 'tableFooter' }
      ];

      let discount;
      let finalAmount;

      if (items.totalDiscount != 0) {
        discount = [
          { text: 'Special Discount', style: 'tableFooter', colSpan: 5 }, '', '', '', '',
          { text: this.formatNumber(items.totalDiscount), style: 'tableFooter' },
          { text: '', style: 'tableFooter' }
        ];
        finalAmount = [
          { text: `Total Amount (${quoteData.currency})`, style: 'tableFooter', colSpan: 5 }, '', '', '', '',
          { text: this.formatNumber(totalCost - items.totalDiscount), style: 'tableFooter' },
          { text: '', style: 'tableFooter' }
        ];
      } else {
        finalAmount = [
          { text: `Total Amount (${quoteData.currency})`, style: 'tableFooter', colSpan: 5 }, '', '', '', '',
          { text: this.formatNumber(totalCost), style: 'tableFooter' },
          { text: '', style: 'tableFooter' }
        ];
      }

      let body;
      if (optionalItems.length > 1) {
        if (items.totalDiscount != 0) {
          body = [
            itemTableHeader,
            ...tableBody,
            totalAmount,
            discount,
            finalAmount
          ];
        } else {
          body = [
            itemTableHeader,
            ...tableBody,
            finalAmount
          ];
        }
      } else {
        if (items.totalDiscount != 0) {
          body = [
            itemTableHeader,
            ...tableBody,
            totalAmount,
            discount,
            finalAmount
          ];
        } else {
          body = [
            itemTableHeader,
            ...tableBody,
            finalAmount
          ];
        }
      }

      return [
        optionHeader, // Add the standalone header here
        {
          table: {
            headerRows: 1,
            widths: [20, 175, 25, 40, 60, 60, 60],
            body: body
          }
        },
        ...(hasExcludedOptionalItems ? [{
          text: 'Note: Items marked (Optional) above are not included in the Total Amount.',
          style: 'optionalNote'
        }] : [])
      ];
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
          quoteData.quoteCompany === "Neuron Security System"
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
        ...(quoteData.quoteCompany == 'Neuron Security System'
          ? [
            { text: 'Respected Sir/ Ma’am,', style: 'text' },
            ...(templateSettings.showOpening ? [{ text: templateSettings.openingText, style: 'text' }] : []),
            { text: 'Thanking you for your co-operation and assuring you of our commitment to always providing professional support and services.', style: 'text' },
            { text: 'Statement of Confidentiality', style: 'orangeHeading' },
            { text: 'Copyright: © 2020 Neuron Security System.', style: 'italicText' },
            { text: 'This document is the property of Neuron Security Systems and the information contained herein is confidential. This work, either in whole or in part, must not be reproduced or disclosed to others or used for purposes other than that for which it is supplied, without Neuron’ s prior written permission, or if any part hereof is furnished by virtue of a contract with a third party, as expressly authorized under that contract. Neuron Security System must not be considered liable for any mistake or omission in the edition of this document.', style: 'text' },
            { text: 'Disclaimer', style: 'orangeHeading' },
            { text: 'The information included in this document is proprietary to Neuron Security Systems and is solely for the use of the designated recipient. No part of this document may be quoted, circulated, repurposed, reproduced, or distributed without prior written permission from Neuron. The information contained within is subject to change if there is any change in end client requirement or change in our assumptions or even due to change in socio-economic environments.', style: 'text' },
            {
              text: '', // Blank text to initiate the next page
              pageBreak: 'before'
            },
          ]
          : []),

        {
          "style": "header",
          "table": {
            "heights": 20,
            "widths": "*",
            "body": [[
              {
                style: 'mainHead',
                "border": [false, false, false, false],
                "fillColor": templateSettings.primaryColor,
                "text": templateSettings.title,
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
              [{ style: 'tableHead', text: 'Company:', alignment: 'left' }, { style: 'tableHead', text: quoteData.client.companyName, alignment: 'left', colSpan: 4 }, {}, {}, {}, { text: ['Total Pages : 0', { pageReference: 'lastPage' }], alignment: 'left', style: 'pageNumber' }],
              [{ style: 'tableHead', text: 'Attention:', alignment: 'left' }, { style: 'tableHead', text: `${quoteData.attention.courtesyTitle + ' ' + quoteData.attention.firstName + ' ' + quoteData.attention.lastName}`, alignment: 'left', colSpan: 3, bold: true }, {}, {}, { style: 'tableHead', text: 'Date:', alignment: 'left' }, { style: 'tableHead', text: quoteData.date ? new Date(quoteData.date).toLocaleDateString('en-GB') : '', alignment: 'left' }],
              [{ rowSpan: 2, style: 'vCentertableHead', text: 'Address:', alignment: 'left' }, { rowSpan: 2, style: 'vCentertableHead', text: quoteData.client.companyAddress, alignment: 'left', colSpan: 3 }, {}, {}, { style: 'stableHead', text: 'Client Ref:', alignment: 'left' }, { style: 'stableHead', text: quoteData.client.clientRef || '-', alignment: 'left' }],
              ['', '', '', '', { style: 'stableHead', text: 'Closing Date:', alignment: 'left' }, { style: 'stableHead', text: quoteData.closingDate ? new Date(quoteData.closingDate).toLocaleDateString('en-GB') : '', alignment: 'left' }],
              [{ style: 'tableHead', text: 'Client Tel:', alignment: 'left' }, { style: 'tableHead', text: `+974 ${quoteData.attention.phoneNo}`, alignment: 'left' }, { style: 'tableHead', text: 'FAX:', alignment: 'center' }, { style: 'tableHead', text: '+974', alignment: 'left' }, { style: 'tableHead', text: 'Salesperson:', alignment: 'left' }, { style: 'tableHead', text: `${quoteData.createdBy.firstName + ' ' + quoteData.createdBy.lastName}`, alignment: 'left' }],
              [{ style: 'tableHead', text: 'Subject:', alignment: 'left' }, { style: 'tableHead', text: quoteData.subject, alignment: 'left', colSpan: 3 }, {}, {}, { style: 'tableHead', text: 'Quote Ref:', alignment: 'left' }, { style: 'quoteId', text: quoteData.quoteId, alignment: 'left' }],
              [{ style: 'tableHead', text: 'Payment Terms:', alignment: 'left' }, { style: 'tableHead', text: quoteData.paymentTerms || '-', alignment: 'left', colSpan: 3 }, {}, {}, { style: 'tableHead', text: 'Valid Until:', alignment: 'left' }, { style: 'tableHead', text: quoteData.validityDate ? new Date(quoteData.validityDate).toLocaleDateString('en-GB') : '', alignment: 'left' }],
              [{ style: 'tableHead', text: 'Delivery Terms:', alignment: 'left' }, { style: 'tableHead', text: quoteData.deliveryTerms || '-', alignment: 'left', colSpan: 5 }, {}, {}, {}, {}],
              [{ style: 'tableHead', text: 'Delivery Location:', alignment: 'left' }, { style: 'tableHead', text: quoteData.deliveryLocation || '-', alignment: 'left', colSpan: 5 }, {}, {}, {}, {}],
            ]
          }
        },
        ...(quoteData.quoteCompany !== 'Neuron Security System' && templateSettings.showOpening
          ? [
            { text: 'Respected Sir/ Ma’am,', style: 'text' },
            { text: templateSettings.openingText, style: 'text' },
            { text: 'Thanking you for your co-operation and assuring you of our commitment to always providing professional support and services.', style: 'text', margin: [0, 10, 0, 15] },
          ]
          : []),
        ...tables,
        ...(templateSettings.showCommercialTerms && (quoteData.paymentTerms || quoteData.deliveryTerms || quoteData.deliveryLocation || quoteData.validityDate) ? [
          { text: 'COMMERCIAL TERMS', style: 'subHeading' },
          {
            ul: [
              ...(quoteData.paymentTerms ? [`Payment Terms: ${quoteData.paymentTerms}`] : []),
              ...(quoteData.deliveryTerms ? [`Delivery Terms: ${quoteData.deliveryTerms}`] : []),
              ...(quoteData.deliveryLocation ? [`Delivery Location: ${quoteData.deliveryLocation}`] : []),
              ...(quoteData.validityDate ? [`Valid Until: ${new Date(quoteData.validityDate).toLocaleDateString('en-GB')}`] : []),
            ],
            style: 'text'
          }
        ] : []),
        ...(templateSettings.showTerms ? [
          { text: 'TERMS & CONDITIONS', style: 'subHeading' },
          { text: quoteData.termsAndCondition, style: 'text' },
        ] : []),
        ...(templateSettings.showNotes ? [
          { text: 'Notes', style: 'subHeading' },
          { text: quoteData.customerNote, style: 'text' },
        ] : []),
        {
          columns: [
            {
              text: [
                { text: 'Thanking you\nFor ', style: 'footerText' },
                { text: quoteData.quoteCompany == "Neuron Security System" ? 'Neuron Security System W.L.L' : 'Neuron Technologies W.L.L', style: 'footerBoldText', id: 'lastPage' }]
            },
            ...(shouldIncludeStamp ? [{
              image: await this.getBase64ImageFromURL(
                "../../assets/images/stamp.jpg"
              ),
              width: 90,
              margin: [30, 5, 0, 0]
            }] : []),
            { text: `${quoteData.createdBy.firstName + ' ' + quoteData.createdBy.lastName}\nMob: - ${quoteData.createdBy.contactNo}\nE: ${quoteData.createdBy.email}`, style: 'footerText', alignment: 'right' },
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
        orangeHeading: {
          fontSize: 16,
          color: '#ED7D31',
          margin: [0, 10, 0, 0],
          bold: true
        },
        italicText: {
          italics: true
        },
        tableHead: {
          color: 'black',
          fontSize: 10
        },
        stableHead: {
          color: 'black',
          fontSize: 9
        },
        vCentertableHead: {
          color: 'black',
          fontSize: 10,
          margin: [0, 5, 0, 5],
          verticalAlignment: 'middle'
        },
        quoteId: {
          color: 'black',
          fontSize: 9
        },
        tableData: {
          fontSize: 11
        },
        header: {
          fontSize: 18,
          bold: true,
          margin: [0, 0, 0, 10]
        },
        pageNumber: {
          color: 'grey',
          fontSize: 10
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
          fillColor: templateSettings.primaryColor,
          color: 'white',
          bold: true
        },
        tableSlNo: {
          bold: true,
          fontSize: 12,
          alignment: 'center',
          margin: [0, 5],
          fillColor: templateSettings.primaryColor,
          color: 'white'
        },
        itemRow: {
          bold: true,
          fontSize: 11,
          alignment: 'center',
          fillColor: "#D0CECE"
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
        optionHeader: {
          fontSize: 12,
          color: 'red',
          bold: true,
          margin: [0, 5, 0, 5]
        },
        optionalNote: {
          fontSize: 9,
          italics: true,
          color: '#ED7D31',
          margin: [0, 3, 0, 10]
        }
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

  deleteQuotation(data: { dataId: string, employeeId: string }): Observable<any> {
    return this.http.post<any>(`${this.api}/quotation/delete`, data, { context: context() });
  }

  getQuoteNote(quoteId: string): Observable<{ saveNote: string, createdBy: string }> {
    return this.http.get<{ saveNote: string, createdBy: string }>(`${this.api}/quotation/note/${quoteId}`);
  }

  /** Past revision snapshots plus the live content, newest first. */
  getQuoteRevisions(quoteId: string): Observable<QuoteRevisionsResponse> {
    return this.http.get<QuoteRevisionsResponse>(`${this.api}/quotation/revisions/${quoteId}`);
  }

}
