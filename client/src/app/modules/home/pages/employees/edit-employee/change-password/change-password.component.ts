import { Component } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';

@Component({
    selector: 'app-change-password',
    templateUrl: './change-password.component.html',
    styleUrls: ['./change-password.component.css'],
    standalone: false
})
export class ChangePasswordComponent {

  changePasswordForm!:FormGroup

  constructor(private _fb:FormBuilder,
              private _employeeService:EmployeeService
  ){}

  ngOninIt(){
    this.changePasswordForm = new FormGroup({
      oldPassword:new FormControl('',Validators.required),
      newPassword:new FormControl('',Validators.required)
    })
  }

  onSubmit(){
    const passwords=this.changePasswordForm.value 
    this._employeeService.changePasswordOfEmployee(passwords).subscribe((res:any)=>{
      try {

      } catch (error) {
        console.log(error)
      }
    })
  }

}
