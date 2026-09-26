import { SettingsSectionHeaderComponent } from '../settings-section-header.component';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { NgIf } from '@angular/common';
import { NgIcon } from '@ng-icons/core';
import { Subscription, filter, take } from 'rxjs';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { WorkflowService } from 'src/app/core/services/workflow.service';
import { Privileges } from 'src/app/shared/interfaces/employee.interface';
import { departmentPrivileges } from 'src/app/shared/utils/privilege-fallback';
import { MatTableDataSource, MatTable, MatColumnDef, MatHeaderCellDef, MatCellDef, MatCell, MatHeaderRowDef, MatHeaderRow, MatRowDef, MatRow } from '@angular/material/table';
import { Workflow, WorkflowFeature } from 'src/app/shared/interfaces/workflow.interface';
import { WorkflowStepsDialogComponent } from 'src/app/modules/hr/pages/workflow-steps-dialog/workflow-steps-dialog.component';
import { SkeltonLoadingComponent } from 'src/app/shared/components/skelton-loading/skelton-loading.component';

@Component({
  selector: 'app-approval-workflow',
  standalone: true,
  templateUrl: './approval-workflow.component.html',
  styleUrls: ['./approval-workflow.component.css'],
  imports: [SettingsSectionHeaderComponent, NgIf, NgIcon, MatTable, MatColumnDef, MatHeaderCellDef, MatCellDef, MatCell, MatHeaderRowDef, MatHeaderRow, MatRowDef, MatRow, SkeltonLoadingComponent],
})
export class ApprovalWorkflowComponent implements OnInit, OnDestroy {
  privileges!: Privileges | undefined;
  categorySection: boolean = false;
  isWorkflowLoading: boolean = true;
  workflows: any[] = [];
  workflowFeatures = WorkflowFeature;
  workflowDisplayedColumns: string[] = ['slNo', 'feature', 'steps'];
  workflowDataSource: any = new MatTableDataSource();

  private subscriptions = new Subscription();

  constructor(
    private _workflowService: WorkflowService,
    public dialog: MatDialog,
    private _employeeService: EmployeeService,
  ) {}

  get canViewDepartments(): boolean {
    return departmentPrivileges(this.privileges).view;
  }

  ngOnInit(): void {
    this.subscriptions.add(
      this._employeeService.employeeData$.pipe(filter((e) => !!e), take(1)).subscribe((employee) => {
        this.privileges = employee?.category?.privileges;
        this.categorySection = employee?.category.role == 'superAdmin';

        if (departmentPrivileges(this.privileges).view || this.categorySection) {
          this.loadWorkflows();
        }
      })
    );
  }

  loadWorkflows(): void {
    this.isWorkflowLoading = true;
    this.workflows = Object.values(WorkflowFeature).map(feature => ({ feature, workflow: null }));

    this.subscriptions.add(
      this._workflowService.getWorkflows().subscribe({
        next: (response) => {
          if (response && response.success && response.data) {
            response.data.forEach((workflow: Workflow) => {
              const workflowData = this.workflows.find(w => w.feature === workflow.feature);
              if (workflowData) {
                workflowData.workflow = workflow;
              }
            });
          }
          this.workflowDataSource.data = this.workflows;
          this.workflowDataSource._updateChangeSubscription();
          this.isWorkflowLoading = false;
        },
        error: (error) => {
          console.error('Error loading workflows:', error);
          this.workflowDataSource.data = this.workflows;
          this.workflowDataSource._updateChangeSubscription();
          this.isWorkflowLoading = false;
        }
      })
    );
  }

  openWorkflowStepsDialog(feature: WorkflowFeature, existingWorkflow?: Workflow): void {
    const dialogRef = this.dialog.open(WorkflowStepsDialogComponent, {
      width: '600px',
      data: {
        feature: feature,
        existingSteps: existingWorkflow?.steps || [],
        workflowId: existingWorkflow?._id,
        isEdit: !!existingWorkflow
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loadWorkflows();
      }
    });
  }

  getFeatureDisplayName(feature: WorkflowFeature): string {
    switch (feature) {
      case WorkflowFeature.CLAIM:
        return 'Claim';
      case WorkflowFeature.PROJECT_CLAIM:
        return 'Project Claim';
      case WorkflowFeature.PURCHASE_APPROVAL:
        return 'Purchase Approval';
      default:
        return feature;
    }
  }

  getStepsButtonText(workflowData: any): string {
    if (workflowData.workflow && workflowData.workflow.steps?.length > 0) {
      return `Edit Steps (${workflowData.workflow.steps.length})`;
    }
    return 'Setup Steps';
  }

  ngOnDestroy() {
    this.subscriptions.unsubscribe();
  }
}
