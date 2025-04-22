import { AfterViewChecked, AfterViewInit, Component, ElementRef, HostListener, OnInit, ViewChild } from '@angular/core';
import { HomeRoutingModule } from 'src/app/modules/home/home-routing.module';
import * as echarts from 'echarts';
import { DashboardService } from 'src/app/core/services/dashboard.service';

@Component({
    selector: 'app-doughnut-chart',
    templateUrl: './doughnut-chart.component.html',
    styleUrls: ['./doughnut-chart.component.css'],
    imports: [HomeRoutingModule]
})
export class DoughnutChartComponent implements OnInit, AfterViewInit {

  @ViewChild('doughnutChart', { static: true }) doughnutChart!: ElementRef;
  chartInstance: any;

  constructor(
    private _dashboardService: DashboardService
  ) { }

  ngOnInit(): void {
    // Initialization logic that doesn't depend on the view
  }

  ngAfterViewInit(): void {
    this.chartInstance = echarts.init(this.doughnutChart.nativeElement);
    new ResizeObserver(() => this.chartInstance.resize()).observe(this.doughnutChart.nativeElement);

    this._dashboardService.donutChart$.subscribe((data :any) => {


      if (!this.chartInstance) {
        console.error('Chart instance is not initialized');  
        return;
      }

      let option = {
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

