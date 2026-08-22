
import {
    ChartComponent,
    ApexAxisChartSeries,
    ApexChart,
    ApexXAxis,
    ApexDataLabels,
    ApexTooltip,
    ApexStroke
} from "ng-apexcharts";

export type ChartOptions = {
    series: ApexAxisChartSeries;
    chart: ApexChart;
    xaxis: ApexXAxis;
    stroke: ApexStroke;
    tooltip: ApexTooltip;
    dataLabels: ApexDataLabels;
};

export function createChart() {
    let chartOptions: Partial<ChartOptions> = {
        series: [
            {
                name: "ICT",
                data: [6, 11, 17, 22, 36, 40, 48, 53, 64, 71, 89, 95]
            },
            {
                name: "Security System",
                data: [10, 14, 27, 31, 34, 50, 57, 69, 78, 81, 84, 98]
            },
            {
                name: "Distribution",
                data: [5, 9, 16, 19, 23, 38, 42, 45, 61, 74, 87, 92]
            }
        ],
        chart: {
            height: 350,
            type: "area",
            toolbar: {
                show: false,
            }
        },
        dataLabels: {
            enabled: false
        },
        stroke: {
            curve: "smooth"
        },
        xaxis: {
            type: "datetime",
            categories: [
                "2023-01-01",
                "2023-02-01",
                "2023-03-01",
                "2023-04-01",
                "2023-05-01",
                "2023-06-01",
                "2023-07-01",
                "2023-08-01",
                "2023-09-01",
                "2023-010-01",
                "2023-011-01",
                "2023-012-01",
            ]
        },
        tooltip: {
            x: {
                format: "dd/MM/yy HH:mm"
            }
        }
    };
}