import { Component, Inject, OnInit } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { Observable } from 'rxjs';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { getEmployee } from 'src/app/shared/interfaces/employee.interface';
import { ModalLayoutComponent } from 'src/app/shared/components/modal-layout/modal-layout.component';
import { NgSelectComponent, NgOptionComponent } from '@ng-select/ng-select';
import { FormsModule } from '@angular/forms';
import { NgFor, NgIf, AsyncPipe, CommonModule } from '@angular/common';

@Component({
    selector: 'app-transfer-procurement-person',
    standalone: true,
    imports: [ModalLayoutComponent, NgSelectComponent, FormsModule, NgFor, NgOptionComponent, NgIf, AsyncPipe, CommonModule],
    templateUrl: './transfer-procurement-person.component.html',
    styleUrls: ['./transfer-procurement-person.component.css']
})
export class TransferProcurementPersonComponent implements OnInit {
  employees$!: Observable<getEmployee[]>
  selectedEmployee!: string;
  showError: boolean = false;

  constructor(
    private dialogRef: MatDialogRef<TransferProcurementPersonComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { jobId: string, jobLabel?: string, currentProcurementPerson?: any },
    private _employeeService: EmployeeService,
  ) { }

  ngOnInit() {
    this.employees$ = this._employeeService.getProcurementEmployees()
  }

  onClose() {
    this.dialogRef.close()
  }

  get currentId(): string | undefined {
    return this.data.currentProcurementPerson?._id;
  }

  getFooterButtons(): any[] {
    return [
      { label: 'Cancel', onClick: this.onClose.bind(this), theme: 'cancel' },
      { label: 'Transfer', onClick: this.onSubmit.bind(this), theme: 'primary' },
    ];
  }

  onSubmit() {
    if (this.selectedEmployee) {
      this.dialogRef.close({ procurementPersonId: this.selectedEmployee })
    } else {
      this.showError = true
    }
  }
}

