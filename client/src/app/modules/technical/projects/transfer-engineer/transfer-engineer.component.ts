import { Component, Inject, OnInit } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { Observable } from 'rxjs';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { getEmployee } from 'src/app/shared/interfaces/employee.interface';
import { NgIcon } from '@ng-icons/core';
import { NgSelectComponent, NgOptionComponent } from '@ng-select/ng-select';
import { FormsModule } from '@angular/forms';
import { NgFor, NgIf, AsyncPipe, CommonModule } from '@angular/common';

@Component({
    selector: 'app-transfer-engineer',
    standalone: true,
    imports: [NgIcon, NgSelectComponent, FormsModule, NgFor, NgOptionComponent, NgIf, AsyncPipe, CommonModule],
    templateUrl: './transfer-engineer.component.html',
    styleUrls: ['./transfer-engineer.component.css']
})
export class TransferEngineerComponent implements OnInit {
  employees$!: Observable<getEmployee[]>
  selectedEmployee!: string;
  showError: boolean = false;

  constructor(
    private dialogRef: MatDialogRef<TransferEngineerComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { projectId: string, currentEngineer?: any },
    private _employeeService: EmployeeService,
  ) { }

  ngOnInit() {
    this.employees$ = this._employeeService.getAllEmployees()
  }

  onClose() {
    this.dialogRef.close()
  }

  onSubmit() {
    if (this.selectedEmployee) {
      this.dialogRef.close({ engineerId: this.selectedEmployee })
    } else {
      this.showError = true
    }
  }
}

