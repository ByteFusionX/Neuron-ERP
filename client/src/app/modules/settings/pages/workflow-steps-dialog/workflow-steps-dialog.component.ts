import { Component, Inject, OnInit, OnDestroy } from '@angular/core';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { NgIcon } from '@ng-icons/core';
import { NgSelectComponent, NgOptionComponent } from '@ng-select/ng-select';
import { CommonModule } from '@angular/common';
import { Observable, Subscription } from 'rxjs';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { WorkflowService } from 'src/app/core/services/workflow.service';
import { GetCategory } from 'src/app/shared/interfaces/employee.interface';
import { WorkflowFeature, ApprovalStep, CreateWorkflowRequest, UpdateWorkflowRequest, ApprovalStepUI } from 'src/app/shared/interfaces/workflow.interface';
import { ToastrService } from 'ngx-toastr';
import { ModalLayoutComponent } from 'src/app/shared/components/modal-layout/modal-layout.component';

@Component({
    selector: 'app-workflow-steps-dialog',
    templateUrl: './workflow-steps-dialog.component.html',
    styleUrls: ['./workflow-steps-dialog.component.css'],
    imports: [
        CommonModule,
        NgIcon,
        FormsModule,
        ReactiveFormsModule,
        NgSelectComponent,
        NgOptionComponent,
        DragDropModule,
        ModalLayoutComponent
    ]
})
export class WorkflowStepsDialogComponent implements OnInit, OnDestroy {
    
    isSaving: boolean = false;
    categories$!: Observable<GetCategory[]>;
    steps: any[] = [];
    selectedCategory = new FormControl('');
    needsManagerApproval = new FormControl(false);
    
    private subscriptions = new Subscription();

    constructor(
        public dialogRef: MatDialogRef<WorkflowStepsDialogComponent>,
        @Inject(MAT_DIALOG_DATA) public data: { 
            feature: WorkflowFeature, 
            existingSteps?: ApprovalStepUI[],
            workflowId?: string,
            isEdit: boolean 
        },
        private _employeeService: EmployeeService,
        private _workflowService: WorkflowService,
        private _toastr: ToastrService
    ) {}

    ngOnInit(): void {
        this.categories$ = this._employeeService.getCategory();
        
        if (this.data.existingSteps) {
            this.steps = this.data.existingSteps.map(step => ({
                role: step.role,
                order: step.order
            }));
        }

        // Initialize needsManagerApproval from existing workflow data if available
        if (this.data.isEdit) {
            this._workflowService.getWorkflows({ feature: this.data.feature }).subscribe(response => {
                if (response.success && response.data && response.data.length > 0) {
                    const workflow = response.data.find(w => w._id === this.data.workflowId);
                    if (workflow) {
                        this.needsManagerApproval.setValue(workflow.needsManagerApproval || false);
                    }
                }
            });
        }
    }

    ngOnDestroy(): void {
        this.subscriptions.unsubscribe();
    }

    onCloseClicked(): void {
        this.dialogRef.close();
    }

    addStep(): void {
        const selectedCategoryId = this.selectedCategory.value;
        if (!selectedCategoryId) return;

        this.subscriptions.add(
            this.categories$.subscribe(categories => {
                const category = categories.find(cat => cat._id === selectedCategoryId);
                if (category) {
                    const newStep: ApprovalStepUI = {
                        role: category,
                        order: this.getNextOrder()
                    };

                    if (!this.steps.some(step => step.role === newStep.role)) {
                        this.steps.push(newStep);
                        this.selectedCategory.reset();
                    } else {
                        this._toastr.warning('This role is already added to the workflow');
                    }
                }
            })
        );
    }

    removeStep(index: number): void {
        this.steps.splice(index, 1);
        this.reorderSteps();
    }

    onDrop(event: CdkDragDrop<ApprovalStep[]>): void {
        moveItemInArray(this.steps, event.previousIndex, event.currentIndex);
        this.reorderSteps();
    }

    private reorderSteps(): void {
        this.steps.forEach((step, index) => {
            step.order = index + 1;
        });
    }

    private getNextOrder(): number {
        if (this.steps.length === 0) return 1;
        return Math.max(...this.steps.map(step => step.order)) + 1;
    }

    getFooterButtons(): any[] {
        return [
            { label: 'Cancel', onClick: this.onCloseClicked.bind(this), theme: 'cancel' },
            { 
                label: this.saveButtonText, 
                onClick: this.onSave.bind(this), 
                theme: 'primary',
                loading: this.isSaving,
                disabled: this.isSaving || this.steps.length === 0,
                icon: this.isSaving ? 'heroArrowPath' : undefined
            }
        ];
    }

    onSave(): void {
        if (this.steps.length === 0) {
            this._toastr.error('Please add at least one approval step');
            return;
        }

        this.steps = this.steps.map(step => ({
            order: step.order,
            role: step.role?._id
        }));

        this.isSaving = true;

        if (this.data.isEdit && this.data.workflowId) {
            const updateData: UpdateWorkflowRequest = {
                steps: this.steps,
                needsManagerApproval: this.needsManagerApproval.value || false
            };

            this.subscriptions.add(
                this._workflowService.updateWorkflow(this.data.workflowId, updateData).subscribe({
                    next: (response) => {
                        if (response.success) {
                            this._toastr.success('Workflow updated successfully');
                            this.dialogRef.close(true);
                        } else {
                            this._toastr.error(response.message || 'Failed to update workflow');
                        }
                        this.isSaving = false;
                    },
                    error: (error) => {
                        this._toastr.error('Failed to update workflow');
                        this.isSaving = false;
                    }
                })
            );
        } else {
            const createData: CreateWorkflowRequest = {
                feature: this.data.feature,
                steps: this.steps,
                needsManagerApproval: this.needsManagerApproval.value || false
            };

            this.subscriptions.add(
                this._workflowService.createWorkflow(createData).subscribe({
                    next: (response) => {
                        if (response.success) {
                            this._toastr.success('Workflow created successfully');
                            this.dialogRef.close(true);
                        } else {
                            this._toastr.error(response.message || 'Failed to create workflow');
                        }
                        this.isSaving = false;
                    },
                    error: (error) => {
                        this._toastr.error('Failed to create workflow');
                        this.isSaving = false;
                    }
                })
            );
        }
    }

    get dialogTitle(): string {
        const featureName = this.data.feature === WorkflowFeature.CLAIM ? 'Claim' : 'Project Claim';
        return this.data.isEdit ? `Edit ${featureName} Workflow` : `Create ${featureName} Workflow`;
    }

    get saveButtonText(): string {
        return this.data.isEdit ? 'Update' : 'Create';
    }

    trackByIndex(index: number, item: ApprovalStepUI): number {
        return index;
    }
} 