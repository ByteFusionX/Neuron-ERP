import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { Observable } from 'rxjs';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { getEmployee } from 'src/app/shared/interfaces/employee.interface';
import { NgIcon } from '@ng-icons/core';
import { NgSelectComponent, NgOptionComponent } from '@ng-select/ng-select';
import { FormsModule } from '@angular/forms';
import { NgFor, NgIf, AsyncPipe } from '@angular/common';

@Component({
    selector: 'app-share-transfer-customer',
    templateUrl: './share-transfer-customer.component.html',
    styleUrls: ['./share-transfer-customer.component.css'],
    imports: [NgIcon, NgSelectComponent, FormsModule, NgFor, NgOptionComponent, NgIf, AsyncPipe]
})
export class ShareTransferCustomerComponent {
  employees$!: Observable<getEmployee[]>
  selectedEmployee!:string;
  showError:boolean = false;


  constructor(
    private dialogRef: MatDialogRef<ShareTransferCustomerComponent>,
    @Inject(MAT_DIALOG_DATA) public data: {type:string,customerId:string},
    private _employeeService: EmployeeService,
  ) { }

  ngOnInit(){
    this.employees$ = this._employeeService.getEmployeesForCustomerTransfer(this.data.customerId)
  }

  onClose() {
    this.dialogRef.close()
  }

  onSubmit(){
    if(this.selectedEmployee){
      this.dialogRef.close({employees:this.selectedEmployee,type:this.data.type})
    }else{
      this.showError = true
    }
  }

}

