import { Component, ElementRef, ViewChild, OnInit, AfterViewInit } from '@angular/core';
import { DashboardService } from 'src/app/core/services/dashboard.service';

import * as echarts from 'echarts/core';
import {
  PieChart
} from 'echarts/charts';
import {
  TitleComponent,
  TooltipComponent,
  LegendComponent
} from 'echarts/components';
import {
  CanvasRenderer
} from 'echarts/renderers';

echarts.use([
  PieChart,
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  CanvasRenderer
]);

@Component({
  selector: 'app-doughnut-chart',
  templateUrl: './doughnut-chart.component.html',
  styleUrls: ['./doughnut-chart.component.css'],
  imports: [],
  standalone: true
})
export class DoughnutChartComponent implements OnInit, AfterViewInit {
  @ViewChild('doughnutChart', { static: true }) doughnutChart!: ElementRef;
  chartInstance: any;

  constructor(private _dashboardService: DashboardService) {}

  ngOnInit(): void {}

  ngAfterViewInit(): void {
    requestAnimationFrame(() => this.initChart());
  }

  private initChart(): void {
    this.chartInstance = echarts.init(this.doughnutChart.nativeElement);
    new ResizeObserver(() => this.chartInstance.resize()).observe(this.doughnutChart.nativeElement);

    this._dashboardService.donutChart$.subscribe((data: any) => {
      if (!this.chartInstance) {
        console.error('Chart instance is not initialized');
        return;
      }

      const option = {
        tooltip: {
          trigger: 'item',
          formatter: function (params: any) {
            return `${params.name} : ${parseInt(params.value).toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            })} QAR`;
          }
        },
        series: [
          {
            name: 'Sales Person',
            type: 'pie',
            radius: ['40%', '70%'],
            avoidLabelOverlap: false,
            label: {
              show: false,
              position: 'center'
            },
            emphasis: {
              label: {
                show: true,
                fontSize: 40,
                fontWeight: 'bold'
              }
            },
            labelLine: {
              show: false
            },
            data: data
          }
        ]
      };

      this.chartInstance.setOption(option);
    });
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
