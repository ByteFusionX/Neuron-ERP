import { ChangeDetectionStrategy, Component, inject, Signal, signal } from '@angular/core';
import { FormBuilder, FormGroup, FormArray, ReactiveFormsModule, Validators, FormControl } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { NgIconsModule } from '@ng-icons/core';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { TechnicalService } from 'src/app/core/services/technical.service';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { FormFieldComponent } from 'src/app/shared/components/forms/form-field/form-field.component';
import { SelectDropdownComponent } from 'src/app/shared/components/forms/select-dropdown/select-dropdown.component';
import { getEmployee } from 'src/app/shared/interfaces/employee.interface';

@Component({
  selector: 'app-add-plan',
  imports: [
    ReactiveFormsModule,
    FormFieldComponent,
    SelectDropdownComponent,
    NgIconsModule
  ],
  templateUrl: './add-plan.component.html',
  styleUrl: './add-plan.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddPlanComponent {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef);
  private employeeService = inject(EmployeeService);
  private technicalService = inject(TechnicalService);
  private _dialog = inject(MatDialog);
  public data: any = inject(MAT_DIALOG_DATA);
  isSaving = false;
  isSubmitted = false;
  activityPlan: any = null;
  employees = signal<{ id: string; name: string }[]>([]);

  ngOnInit(): void {
    this.employeeService.getAllEmployees().subscribe((employees) => {
      let employeeList = employees.map((employee) => {
        return {
          id: employee._id ?? '',
          name: employee.firstName + ' ' + employee.lastName,
        };
      });
      this.employees.set(employeeList);
    });

    if (this.data?.activityPlan) {
      this.activityPlan = this.data.activityPlan;
      this.populateForm();
    }
  }

  populateForm() {
    if (this.activityPlan) {
      this.form.patchValue({
        activityName: this.activityPlan.activityName,
        startDate: this.formatDateForInput(this.activityPlan.startDate),
        endDate: this.formatDateForInput(this.activityPlan.endDate),
        includedEmployees: this.activityPlan.includedEmployees?.map((emp: any) => emp._id || emp) || []
      });
    }
  }

  formatDateForInput(dateString: string): string {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toISOString().split('T')[0];
  }

  form = this.fb.group({
    activityName: ['', Validators.required],
    startDate: ['', Validators.required],
    endDate: ['', Validators.required],
    includedEmployees: [[]],
  });

  get includedEmployeesArray(): FormControl {
    return this.form.get('includedEmployees') as FormControl;
  }

  onSave() {
    this.isSubmitted = true;
    if (this.form.valid) {
      this.isSaving = true;
      const formData = this.form.value;

      const activityPlanData = {
        activityName: formData.activityName,
        startDate: new Date(formData.startDate!),
        endDate: new Date(formData.endDate!),
        includedEmployees: formData.includedEmployees
      };

      if (this.activityPlan) {
        this.technicalService.updateActivityPlan(this.data.technicalId, this.activityPlan._id, activityPlanData)
          .subscribe({
            next: (response) => {
              this.dialogRef.close({ success: true, data: response.data, action: 'updated' });
            },
            error: (error) => {
              console.error('Error updating activity plan:', error);
              this.isSaving = false;
            }
          });
      } else {
        this.technicalService.createActivityPlan(this.data.technicalId, activityPlanData)
          .subscribe({
            next: (response) => {
              this.dialogRef.close({ success: true, data: response.data, action: 'created' });
            },
            error: (error) => {
              console.error('Error creating activity plan:', error);
              this.isSaving = false;
            }
          });
      }
    }
  }

  onDelete() {
    if (this.activityPlan) {
      const confimationDialog = this._dialog.open(ConfirmationDialogComponent, {
        data: {
          title: 'Delete Activity Plan',
          description: 'Are you sure you want to delete this activity plan?',
          icon: 'heroExclamationCircle',
          IconColor: 'red'
        }
      });

      confimationDialog.afterClosed().subscribe((result) => {
        if (result) {
          this.technicalService.deleteActivityPlan(this.data.technicalId, this.activityPlan._id)
            .subscribe({
              next: (response) => {
                this.dialogRef.close({ success: true, data: response.data, action: 'deleted' });
              }
            });
        }
      });
    }
  }

  onCancel() {
    this.dialogRef.close();
  }
}
