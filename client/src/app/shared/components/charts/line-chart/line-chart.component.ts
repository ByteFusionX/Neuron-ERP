import { AfterViewChecked, AfterViewInit, Component, ElementRef, HostListener, OnInit, ViewChild } from '@angular/core';
import * as echarts from 'echarts/core';
import { DashboardService } from 'src/app/core/services/dashboard.service';
import { NumberShortenerPipe } from 'src/app/shared/pipes/numberShortener.pipe';

import { LineChart } from 'echarts/charts';
import { TooltipComponent, GridComponent, MarkAreaComponent, GraphicComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([
  LineChart,
  TooltipComponent,
  GridComponent,
  MarkAreaComponent,
  GraphicComponent,
  CanvasRenderer
]);

@Component({
    selector: 'app-line-chart',
    imports: [],
    providers: [NumberShortenerPipe],
    templateUrl: './line-chart.component.html',
    styleUrls: ['./line-chart.component.css'],
    standalone: true
})
export class LineChartComponent implements OnInit, AfterViewInit {

  @ViewChild('lineChart', { static: true }) lineChart!: ElementRef;
  chartInstance: any;

  constructor(
    private _dashboardService: DashboardService,
    private numberShortenerPipe: NumberShortenerPipe
  ) { }
  ngOnInit(): void {
    // Initialization logic that doesn't depend on the view
  }

  ngAfterViewInit(): void {
    this.chartInstance = echarts.init(this.lineChart.nativeElement);
    new ResizeObserver(() => this.chartInstance.resize()).observe(this.lineChart.nativeElement);

    this._dashboardService.graphChart$.subscribe((data) => {
      const numberShortenerPipe = this.numberShortenerPipe;
      const maxProfit = Math.max(...data.profitPerMonths.profits);
      const profitTarget = data.profitTarget;
      const hasTarget = !!profitTarget && (profitTarget.targetValue > 0 || profitTarget.criticalRange > 0 || profitTarget.moderateRange > 0);
      const yMax = hasTarget && profitTarget.targetValue > maxProfit ? profitTarget.targetValue : maxProfit.toFixed(2);

      let option = {
        tooltip: {
          trigger: 'axis',
          axisPointer: {
            type: 'cross'
          },
          valueFormatter: (value: any) => `${value.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
          })} QAR`,
        },
        xAxis: {
          type: 'category',
          data: data.profitPerMonths.months
        },
        yAxis: {
          type: 'value',
          max: yMax,
          axisLabel: {
            formatter: function (value: number) {
              return numberShortenerPipe.transform(value);
            }
          },
        },
        graphic: [{
          id: 'no-target-label',
          type: 'text',
          right: 10,
          top: 10,
          ignore: hasTarget,
          style: {
            text: 'No target set for this period',
            fontSize: 12,
            fill: '#9CA3AF'
          }
        }],
        series: [
          {
            data: data.profitPerMonths.profits,
            type: 'line',
            smooth: true,
            ...(hasTarget && {
              markArea: {
                data: [
                  [
                    {
                      yAxis: '0',
                      itemStyle: {
                        color: '#FF7F7F',
                        opacity: 0.5
                      },
                    },
                    {
                      yAxis: profitTarget.criticalRange
                    }
                  ],
                  [
                    {
                      yAxis: profitTarget.criticalRange,
                      itemStyle: {
                        color: '#FFFF00',
                        opacity: 0.5
                      },
                    },
                    {
                      yAxis: profitTarget.moderateRange
                    }
                  ],
                  [
                    {
                      yAxis: profitTarget.moderateRange,
                      itemStyle: {
                        color: '#90EE90',
                        opacity: 0.5
                      },
                    },
                    {
                      yAxis: yMax
                    }
                  ],
                ]
              }
            }),
          }
        ]
      };
      this.chartInstance.setOption(option);
    });
  }

  // @HostListener('window:resize', ['$event'])
  // onWindowResize(): void {
  //   const screenWidth = window.innerWidth;
  //   switch (true) {
  //     case (screenWidth >= 1024 && screenWidth < 1280):
  //       this.chartResize({ width: 700, height: 360 });
  //       break;

  //     case (screenWidth >= 1280 && screenWidth < 1536):
  //       this.chartResize({ width: 800, height: 360 });
  //       break;

  //     case (screenWidth >= 1536 && screenWidth < 1600):
  //       this.chartResize({ width: 900, height: 360 });
  //       break;

  //     case (screenWidth >= 1600 && screenWidth < 1920):
  //       this.chartResize({ width: 1000, height: 360 });
  //       break;

  //     case (screenWidth >= 1920 && screenWidth <= 2560):
  //       this.chartResize({ width: 1150, height: 360 });
  //       break;

  //     case (screenWidth >= 2560):
  //       this.chartResize({ width: 1600, height: 360 });
  //       break;

  //     default:
  //       this.chartResize({ width: 500, height: 360 });
  //       break;
  //   }
  // }

  chartResize(size: any) {
    if (this.chartInstance) {
      this.chartInstance.resize(size);
    }
  }

  makeChartResponsive(): void {
    window.addEventListener('resize', () => {
      if (this.chartInstance) {
        this.chartInstance.resize();
      }
    });
  }
}
