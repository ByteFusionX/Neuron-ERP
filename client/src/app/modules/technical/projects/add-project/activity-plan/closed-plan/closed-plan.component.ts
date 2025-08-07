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
  selector: 'app-closed-plan',
  imports: [
    ReactiveFormsModule,
    FormFieldComponent,
    NgIconsModule
  ],
  templateUrl: './closed-plan.component.html',
  styleUrl: './closed-plan.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClosedPlanComponent {
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
    }
  }

  formatDateForInput(dateString: string): string {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toISOString().split('T')[0];
  }

  form = this.fb.group({
    orginalStartDate: ['', Validators.required],
    orginalEndDate: ['', Validators.required],
    comment: [''],
  });

  onSave() {
    this.isSubmitted = true;
    if (this.form.valid) {
      this.isSaving = true;
      const formData = this.form.value;

      const activityPlanData = {
        orginalStartDate: new Date(formData.orginalStartDate!),
        orginalEndDate: new Date(formData.orginalEndDate!),
        comment: formData.comment
      };

      this.technicalService.closeActivityPlan(this.data.technicalId, this.activityPlan._id, activityPlanData)
        .subscribe({
          next: (response) => {
            this.dialogRef.close({ success: true, data: response.data, action: 'updated' });
          },
          error: (error) => {
            console.error('Error updating activity plan:', error);
            this.isSaving = false;
          }
        });
    }
  }

  onCancel() {
    this.dialogRef.close();
  }
}
