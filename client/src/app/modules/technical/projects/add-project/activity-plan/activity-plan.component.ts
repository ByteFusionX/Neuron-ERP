import { Component, ElementRef, OnInit, inject, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { TableComponent } from 'src/app/shared/components/table/table.component';
import { TableColumn } from 'src/app/shared/components/table/table.model';
import { SelectDropdownComponent } from 'src/app/shared/components/forms/select-dropdown/select-dropdown.component';
import { TechnicalService } from 'src/app/core/services/technical.service';
import { Project } from 'src/app/shared/interfaces/project.interface';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import Gantt from 'frappe-gantt';
import { MatDialog } from '@angular/material/dialog';
import { AddPlanComponent } from './add-plan/add-plan.component';
import { ButtonComponent } from 'src/app/shared/components/button/button.component';

@Component({
  selector: 'app-activity-plan',
  standalone: true,
  imports: [CommonModule,ReactiveFormsModule,ButtonComponent],
  templateUrl: './activity-plan.component.html',
  styleUrl: './activity-plan.component.css',
})
export class ActivityPlanComponent implements OnInit {
  private technicalService = inject(TechnicalService);
  private el = inject(ElementRef);  
  private _dialog = inject(MatDialog);
  private route = inject(ActivatedRoute);
  private ngZone = inject(NgZone);
  
  activityPlans: any[] = [];
  technicalId: string = '';
  ganttInstance: any = null;
  isLoading = false;
  isGanttInitialized = false;
  isDragging = false;
  viewMode: string = 'Day';
  private dateChangeTimeout: any = null;
  private lastUpdatedTask: any = null;
  
  ngOnInit(): void {
    this.route.params.subscribe(params => {
      this.technicalId = params['id'];
      if (this.technicalId) {
        this.loadActivityPlans();
      }
    });
  }
  
  ngAfterViewInit() {
    this.ngZone.runOutsideAngular(() => {
      setTimeout(() => {
        this.initializeGantt();
      }, 100);
    });
  }

  loadActivityPlans() {
    if (this.technicalId) {
      this.isLoading = true;
      this.technicalService.getActivityPlans(this.technicalId).subscribe({
        next: (response) => {
          this.activityPlans = response.data || [];
          this.ngZone.run(() => {
            this.updateGanttChart();
            this.isLoading = false;
          });
        },
        error: (error) => {
          console.error('Error loading activity plans:', error);
          this.ngZone.run(() => {
            this.isLoading = false;
          });
        }
      });
    }
  }

  initializeGantt() {
    const ganttElement = this.el.nativeElement.querySelector('#gantt');
    if (ganttElement && !this.isGanttInitialized) {
      this.ngZone.runOutsideAngular(() => {
        this.ganttInstance = new Gantt(ganttElement, [], {
          on_click: (data: any) => {
            this.ngZone.run(() => {
              if (!this.isDragging) {
                this.onGanttClick(data);
              }
            });
          },
          on_date_change: (task: any, start: string, end: string) => {
            this.ngZone.run(() => {
              this.isDragging = true;
              this.onDateChange(task, start, end);
            });
          },
          on_progress_change: (task: any, progress: number) => {
            this.ngZone.run(() => {
              this.onProgressChange(task, progress);
            });
          },
          bar_height: 40,
        });
        this.isGanttInitialized = true;
      });
    }
  }

  onDateChange(task: any, start: string, end: string) {
    const activityPlanIndex = this.activityPlans.findIndex(plan => plan._id === task.id || plan.activityName === task.name);
    if (activityPlanIndex !== -1) {
      const activityPlan = this.activityPlans[activityPlanIndex];
      
      this.activityPlans[activityPlanIndex].startDate = new Date(start);
      this.activityPlans[activityPlanIndex].endDate = new Date(end);
      
      this.lastUpdatedTask = { task, start, end, activityPlan };
      
      if (this.dateChangeTimeout) {
        clearTimeout(this.dateChangeTimeout);
      }
      
      this.dateChangeTimeout = setTimeout(() => {
        this.saveDateChange();
      }, 500);
    }
  }

  changeViewMode(view: string) {
    this.viewMode = view;
    this.ganttInstance.change_view_mode(view);
    this.scrollToEarliestDate();
  }

  saveDateChange() {
    if (this.lastUpdatedTask) {
      const { task, start, end, activityPlan } = this.lastUpdatedTask;
      
      const updatedData = {
        activityName: activityPlan.activityName,
        startDate: new Date(start).getTime() + 86400000,
        endDate: new Date(end).getTime() + 86400000,
        includedEmployees: activityPlan.includedEmployees?.map((emp: any) => emp._id || emp) || []
      };

      this.technicalService.updateActivityPlan(this.technicalId, activityPlan._id, updatedData).subscribe({
        next: (response) => {
          console.log('Activity plan dates updated successfully');
          this.lastUpdatedTask = null;
          this.isDragging = false;
        },
        error: (error) => {
          console.error('Error updating activity plan dates:', error);
          this.loadActivityPlans();
          this.lastUpdatedTask = null;
          this.isDragging = false;
        }
      });
    }
  }

  onProgressChange(task: any, progress: number) {
    console.log('Progress changed:', task, progress);
  }

  updateGanttChart() {
    if (this.ganttInstance && this.isGanttInitialized) {
      this.ngZone.runOutsideAngular(() => {
        const tasks = this.activityPlans.map((plan, index) => ({
          id: plan._id || `task-${index}`,
          name: plan.activityName,
          start: this.formatDateForGantt(plan.startDate),
          end: this.formatDateForGantt(plan.endDate),
          custom_class: "",
        }));


        this.ganttInstance.refresh(tasks);
        
        if (this.activityPlans.length > 0) {
          this.scrollToEarliestDate();
        }
      });
    } else if (!this.isGanttInitialized) {
      setTimeout(() => {
        this.initializeGantt();
        this.updateGanttChart();
      }, 200);
    }
  }

  scrollToEarliestDate() {
    if (this.ganttInstance && this.activityPlans.length > 0) {
      const earliestDate = this.activityPlans.reduce((earliest, plan) => {
        const planDate = new Date(plan.startDate);
        const earliestDate = new Date(earliest);
        return planDate < earliestDate ? planDate : earliestDate;
      }, new Date(this.activityPlans[0].startDate));

      const twoDaysBefore = new Date(earliestDate);
      twoDaysBefore.setDate(twoDaysBefore.getDate() - 1);
      
      const formattedDate = this.formatDateForGantt(twoDaysBefore.toISOString());
      this.ganttInstance.set_scroll_position(formattedDate);
    }
  }

  formatDateForGantt(dateString: string): string {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toISOString().split('T')[0];
  }

  onGanttClick(data: any) {
    const activityPlan = this.activityPlans.find(plan => plan._id === data.id || plan.activityName === data.name);
    if (activityPlan) {
      this.editActivityPlan(activityPlan);
    }
  }

  onSelectActivityPlan(data: any) {
    if(data._id){
      this.editActivityPlan(data);
    }
  }

  onAddActivityPlan() {
    const dialogRef = this._dialog.open(AddPlanComponent, {
      width: '500px',
      data: { technicalId: this.technicalId }
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result?.success) {
        this.loadActivityPlans();
      }
    });
  }

  editActivityPlan(activityPlan: any) {
    const dialogRef = this._dialog.open(AddPlanComponent, {
      width: '500px',
      data: { 
        technicalId: this.technicalId,
        activityPlan: activityPlan
      }
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result?.success) {
        this.loadActivityPlans();
      }
    });
  }

}
