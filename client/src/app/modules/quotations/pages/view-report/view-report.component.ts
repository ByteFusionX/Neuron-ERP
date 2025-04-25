import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { QuotationService } from 'src/app/core/services/quotation/quotation.service';
import { FilterQuote, PieChartOptions, QuoteStatus, QuoteStatusColors, ReportDetails } from 'src/app/shared/interfaces/quotation.interface';
import { NgIcon } from '@ng-icons/core';
import { ChartComponent } from 'ng-apexcharts';
import { NgFor } from '@angular/common';
import { NumberFormatterPipe } from '../../../../shared/pipes/numFormatter.pipe';

@Component({
    selector: 'app-view-report',
    templateUrl: './view-report.component.html',
    styleUrls: ['./view-report.component.css'],
    imports: [NgIcon, ChartComponent, NgFor, NumberFormatterPipe]
})
export class ViewReportComponent {
  reportData!: ReportDetails;
  public chartOptions!: Partial<PieChartOptions>;
  QuoteStatusColors = QuoteStatusColors;
  
  constructor(
    private dialogRef: MatDialogRef<ViewReportComponent>,
    @Inject(MAT_DIALOG_DATA) public data: FilterQuote,
    private _quotationSerice: QuotationService
  ) { }
  
  ngOnInit() {
    this._quotationSerice.getQuotationReport(this.data).subscribe((res) => {
      this.reportData = res;
      this.getPieChartDetails();
    });
  }
  
  getPieChartDetails() {
    this.chartDetails();
  }
  
  onClose() {
    this.dialogRef.close();
  }
  
  chartDetails() {
    this.chartOptions = {
      series: this.reportData.pieChartData.map(data => data.value),
      chart: {
        type: 'pie',
        height: 280,
        fontFamily: 'inherit',
        background: 'transparent',
        toolbar: {
          show: false
        },
        animations: {
          enabled: true,
          speed: 500
        }
      },
      labels: this.reportData.pieChartData.map(data => data.name),
      colors: this.reportData.pieChartData.map(data => {
        return QuoteStatusColors[data.name as keyof typeof QuoteStatusColors] || '#CCCCCC';
      }),
      stroke: {
        width: 2,
        colors: ['#fff']
      },
      dataLabels: {
        enabled: false
      },
      legend: {
        show: false
      },
      tooltip: {
        enabled: true,
        theme: 'light',
        fillSeriesColor: false,
        style: {
          fontSize: '14px'
        },
        y: {
          formatter: (val: number) => {
            return val.toString();
          }
        }
      },
      plotOptions: {
        pie: {
          donut: {
            size: '50%',
            labels: {
              show: false
            }
          },
          customScale: 0.9,
          offsetX: 0,
          offsetY: 0,
          expandOnClick: true
        }
      },
      states: {
        hover: {
          filter: {
            type: 'darken',
            value: 0.9
          }
        }
      },
      responsive: [
        {
          breakpoint: 480,
          options: {
            chart: {
              height: 240
            },
            plotOptions: {
              pie: {
                customScale: 0.8
              }
            }
          }
        }
      ]
    };
  }
  
  getPercentage(value: number): string {
    const total = this.reportData.pieChartData.reduce((sum, item) => sum + item.value, 0);
    return ((value / total) * 100).toFixed(1) + '%';
  }
  
  getStatusColor(statusName: string): string {
    return QuoteStatusColors[statusName as keyof typeof QuoteStatusColors] || '#CCCCCC';
  }
}