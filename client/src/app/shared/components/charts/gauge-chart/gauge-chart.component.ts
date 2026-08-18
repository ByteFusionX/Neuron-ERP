import {
  Component,
  ElementRef,
  ViewChild,
  OnInit,
  AfterViewInit,
  HostListener
} from '@angular/core';
import * as echarts from 'echarts/core';

import {
  GaugeChart
} from 'echarts/charts';
import {
  TooltipComponent,
  TitleComponent
} from 'echarts/components';
import {
  CanvasRenderer
} from 'echarts/renderers';

import { DashboardService } from 'src/app/core/services/dashboard.service';
import { NumberShortenerPipe } from 'src/app/shared/pipes/numberShortener.pipe';

// Register ECharts components
echarts.use([
  GaugeChart,
  TooltipComponent,
  TitleComponent,
  CanvasRenderer
]);

@Component({
    selector: 'app-gauge-chart',
    templateUrl: './gauge-chart.component.html',
    styleUrls: ['./gauge-chart.component.css'],
    imports: [],
    providers: [NumberShortenerPipe],
    standalone: true
})
export class GaugeChartComponent implements OnInit, AfterViewInit {

  @ViewChild('gaugeChart', { static: false }) gaugeChart!: ElementRef;
  chartInstance: any;

  constructor(
    private _dashboardService: DashboardService,
    private numberShortenerPipe: NumberShortenerPipe
  ) { }

  ngOnInit(): void {
    // Initialization logic that doesn't depend on the view
  }

  ngAfterViewInit(): void {
    requestAnimationFrame(() => this.initChart());
  }

  private initChart(): void {
    this.chartInstance = echarts.init(this.gaugeChart.nativeElement);
    new ResizeObserver(() => this.chartInstance.resize()).observe(this.gaugeChart.nativeElement);

    this._dashboardService.guageChart$.subscribe((report) => {
      let criticalRange = (report.criticalRange / report.targetValue);
      let moderateRange = (report.moderateRange / report.targetValue);
      let revenue = (report.companyRevenue / report.targetValue);

      const numberShortenerPipe = this.numberShortenerPipe;

      let option = {
        series: [
          {
            type: 'gauge',
            startAngle: 180,
            endAngle: 0,
            center: ['50%', '75%'],
            radius: '90%',
            min: 0,
            max: 1,
            axisLine: {
              lineStyle: {
                width: 40,
                color: [
                  [criticalRange, '#FF6E76'],
                  [moderateRange, '#FDDD60'],
                  [1, '#7CFFB2']
                ]
              }
            },
            pointer: {
              icon: 'path://M12.8,0.7l12,40.1H0.7L12.8,0.7z',
              length: '30%',
              width: 10,
              offsetCenter: [0, '-40%'],
              itemStyle: {
                color: 'auto'
              }
            },
            axisTick: {
              length: 0,
              lineStyle: {
                color: 'auto',
                width: 0
              }
            },
            splitLine: {
              length: 10,
              lineStyle: {
                color: 'auto',
                width: 0
              }
            },
            axisLabel: {
              color: '#464646',
              fontSize: 12,
              distance: -30,
              rotate: 'tangential',
              formatter: function (value: number) {
                if (value === 0) {
                  return '0';
                } else if (value.toFixed(1) === criticalRange.toFixed(1)) {
                  return numberShortenerPipe.transform(report.criticalRange); // Use pipe here
                } else if (value.toFixed(1) === moderateRange.toFixed(1)) {
                  return numberShortenerPipe.transform(report.moderateRange); // Use pipe here
                } else if (value === 1) {
                  return numberShortenerPipe.transform(report.targetValue); // Use pipe here
                }
                return '';
              }
            },
            title: {
              offsetCenter: [0, '20%'],
              fontSize: 12
            },
            detail: {
              fontSize: 20,
              offsetCenter: [0, '0%'],
              valueAnimation: true,
              formatter: function (value: number) {
                return report.companyRevenue.toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2
                });
              },
              color: 'inherit'
            },
            data: [
              {
                value: revenue,
                name: 'Revenue Achieved'
              }
            ]
          }
        ]
      };

      this.chartInstance.setOption(option);
    });
  }

  @HostListener('window:resize', ['$event'])
  onWindowResize(): void {
    const screenWidth = window.innerWidth;
    switch (true) {
      case (screenWidth >= 1024 && screenWidth < 1280):
        this.chartResize({ width: 350, height: 250 });
        this.chartResize({ width: 400, height: 300 });
        break;
      case (screenWidth >= 1536 && screenWidth < 1600):
        this.chartResize({ width: 450, height: 320 });
        break;

      case (screenWidth >= 1600 && screenWidth < 1920):
        this.chartResize({ width: 500, height: 350 });
        break;

      case (screenWidth >= 1920 && screenWidth <= 2560):
        this.chartResize({ width: 550, height: 450 });
        break;

      case (screenWidth >= 2560):
        this.chartResize({ width: 600, height: 500 });
        break;

      default:
        this.chartResize({ width: 300, height: 220 });
        break;
    }
  }

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
