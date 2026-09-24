import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { NgIcon } from '@ng-icons/core';
import { FormsModule } from '@angular/forms';
import { NgIf } from '@angular/common';
import { SfFieldComponent } from 'src/app/shared/components/smart-form/sf-field.component';
import { SfComboboxComponent } from 'src/app/shared/components/smart-form/sf-combobox.component';
import { SfTextareaComponent } from 'src/app/shared/components/smart-form/sf-textarea.component';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { SfOption } from 'src/app/shared/components/smart-form/sf.model';

@Component({
    selector: 'app-select-employee',
    templateUrl: './select-employee.component.html',
    imports: [NgIcon, FormsModule, NgIf, SfFieldComponent, SfComboboxComponent, SfTextareaComponent, ActionButtonComponent]
})
export class SelectEmployeeComponent {

  employeeOptions: SfOption[] = [];
  selectedEmployee!:string;
  comment!:string;
  showError:boolean = false;


  constructor(
    private dialogRef: MatDialogRef<SelectEmployeeComponent>,
    @Inject(MAT_DIALOG_DATA) public data: string,
    private _employeeService: EmployeeService,
  ) { }

  ngOnInit(){
    this._employeeService.getAllEmployees().subscribe((employees) => {
      this.employeeOptions = employees.map((e) => ({ value: e._id, label: `${e.firstName} ${e.lastName}` }));
    });
  }

  validateComment() {
    if (!this.comment) {
      this.showError = true;
    } else {
      this.showError = false;
    }
  }

  onClose() {
    this.dialogRef.close()
  }

  onSubmit(){
    if(this.selectedEmployee && this.comment){
      this.dialogRef.close({employeeId:this.selectedEmployee,comment:this.comment})
    }else if(this.selectedEmployee){
      this.showError = true
    }
  }

}
