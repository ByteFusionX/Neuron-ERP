import { AfterViewChecked, AfterViewInit, Component, ElementRef, HostListener, OnInit, ViewChild } from '@angular/core';
import { HomeRoutingModule } from 'src/app/modules/home/home-routing.module';
import * as echarts from 'echarts/core';
import { DashboardService } from 'src/app/core/services/dashboard.service';
import { NumberShortenerPipe } from 'src/app/shared/pipes/numberShortener.pipe';

import { LineChart } from 'echarts/charts';
import { TooltipComponent, GridComponent, MarkAreaComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([
  LineChart,
  TooltipComponent,
  GridComponent,
  MarkAreaComponent,
  CanvasRenderer
]);

@Component({
    selector: 'app-line-chart',
    imports: [HomeRoutingModule],
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
          max: data.profitTarget.targetValue || 0 > maxProfit ? data.profitTarget.targetValue : maxProfit.toFixed(2),
          axisLabel: {
            formatter: function (value: number) {
              return numberShortenerPipe.transform(value);
            }
          },
        },
        series: [
          {
            data: data.profitPerMonths.profits,
            type: 'line',
            smooth: true,
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
                    yAxis: data.profitTarget.criticalRange
                  }
                ],
                [
                  {
                    yAxis: data.profitTarget.criticalRange,
                    itemStyle: {
                      color: '#FFFF00',
                      opacity: 0.5
                    },
                  },
                  {
                    yAxis: data.profitTarget.moderateRange
                  }
                ],
                [
                  {
                    yAxis: data.profitTarget.moderateRange,
                    itemStyle: {
                      color: '#90EE90',
                      opacity: 0.5
                    },
                  },
                  {
                    yAxis: data.profitTarget.targetValue || 0 > maxProfit ? data.profitTarget.targetValue : maxProfit.toFixed(2)
                  }
                ],
              ]
            },
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
