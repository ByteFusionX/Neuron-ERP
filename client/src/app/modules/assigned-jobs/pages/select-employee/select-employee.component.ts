import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { Observable } from 'rxjs';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { getEmployee } from 'src/app/shared/interfaces/employee.interface';
import { NgIcon } from '@ng-icons/core';
import { NgSelectComponent, NgOptionComponent } from '@ng-select/ng-select';
import { FormsModule } from '@angular/forms';
import { NgFor, NgClass, NgIf, AsyncPipe } from '@angular/common';

@Component({
    selector: 'app-select-employee',
    templateUrl: './select-employee.component.html',
    styleUrls: ['./select-employee.component.css'],
    imports: [NgIcon, NgSelectComponent, FormsModule, NgFor, NgOptionComponent, NgClass, NgIf, AsyncPipe]
})
export class SelectEmployeeComponent {

  employees$!: Observable<getEmployee[]>
  selectedEmployee!:string;
  comment!:string;
  showError:boolean = false;


  constructor(
    private dialogRef: MatDialogRef<SelectEmployeeComponent>,
    @Inject(MAT_DIALOG_DATA) public data: string,
    private _employeeService: EmployeeService,
  ) { }

  ngOnInit(){
    this.employees$ = this._employeeService.getAllEmployees()
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
