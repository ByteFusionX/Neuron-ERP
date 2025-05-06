import { Component, EventEmitter, Output } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { NgSelectModule } from '@ng-select/ng-select';

@Component({
    selector: 'generate-report',
    templateUrl: './generate-report.component.html',
    styleUrls: ['./generate-report.component.css'],
    imports: [
        FormsModule,
        ReactiveFormsModule,
        CommonModule,
        NgSelectModule
    ]
})
export class GenerateReportComponent {
  @Output() generatePdf: EventEmitter<{selectedMonth?: number, selectedYear: number,selectedMonthName?:string, download:boolean }> = new EventEmitter();

  selectedDateFormat:string = 'monthly';
  selectedMonth!: string;
  selectedYear!: number;
  months!: string[];
  years!: number[];
  isSubmitted:boolean = false;
  AllMonths : string[] = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  constructor() {
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();

    this.months = this.generateMonths(currentDate.getMonth(), currentYear);
    this.years = this.generateYears(currentYear);
  }

  generateMonths(currentMonth: number, currentYear: number): string[] {
    if (currentYear === this.selectedYear) {
      return this.AllMonths.slice(0, currentMonth + 1);
    } else {
      return this.AllMonths;
    }
  }

  generateYears(currentYear: number): number[] {
    const years = [];
    const startYear = 2000;
    for (let i = startYear; i <= currentYear; i++) {
      years.push(i);
    }
    return years;
  }
  

  onYearChange() {
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    this.months = this.generateMonths(currentDate.getMonth(), currentYear);
  }

  handleClick(event:any){
      event.preventDefault();
      event.stopPropagation(); 
  }


  onGenerate(isDownload:boolean){
    this.isSubmitted = true;
    if(this.selectedDateFormat == 'monthly'){
      if(this.selectedMonth && this.selectedYear){
        const monthIndex = this.AllMonths.indexOf(this.selectedMonth) + 1;
        this.generatePdf.emit({ selectedMonth:monthIndex,selectedYear:this.selectedYear,selectedMonthName:this.selectedMonth, download:isDownload });
      }
    }else{
      if(this.selectedYear){
        this.generatePdf.emit({ selectedYear:this.selectedYear, download:isDownload  });
      }
    }
  }
}
