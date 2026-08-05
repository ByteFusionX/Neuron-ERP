import { Injectable } from '@angular/core';

import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
const pdfMakeInstance = pdfMake;
pdfMakeInstance.vfs = pdfFonts;

@Injectable({
    providedIn: 'root'
})
export class GeneratePdfReport {

    generatePdf(reportName: string, reportDate: string, data: any, tableHeader: string[],width:string[]) {
        const tableData = data.map((value: string[]) => {
            return value.map((value: string) => {
                return { style: 'tableRow', text: value }
            })
        });

        const tableHeaders = tableHeader.map((header: string) => { return { style: 'tableHeader', text: header, alignment: 'center' } });

        const docDefinition: any = {
            content: [
                { text: `${reportName} (${reportDate})`, style: 'header',alignment:'center' },
                {
                    table: {
                        headerRows: 1,
                        widths: width,
                        body: [tableHeaders, ...tableData],
                        style: 'tableRow'
                    }
                }
            ],
            styles: {
                header: {
                    fontSize: 18,
                    bold: true,
                    margin: [0, 0, 0, 10]
                },
                tableHeader: {
                    fillColor: '#EEEEEE',
                    bold: true,
                    fontSize: 12
                },
                tableRow: {
                    fontSize: 10
                }
            },
            pageOrientation: 'landscape'
        };
        pdfMake.createPdf(docDefinition).download(`jobReport (${reportDate})`);
    }


}
