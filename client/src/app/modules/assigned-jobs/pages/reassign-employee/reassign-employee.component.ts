import { Component, Inject, OnDestroy, OnInit } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { Subscription } from 'rxjs';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { EnquiryService } from 'src/app/core/services/enquiry/enquiry.service';
import { NgIcon } from '@ng-icons/core';
import { FormsModule } from '@angular/forms';
import { SfFieldComponent } from 'src/app/shared/components/smart-form/sf-field.component';
import { SfComboboxComponent } from 'src/app/shared/components/smart-form/sf-combobox.component';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { SfOption } from 'src/app/shared/components/smart-form/sf.model';

@Component({
    selector: 'app-reassign-employee',
    templateUrl: './reassign-employee.component.html',
    imports: [NgIcon, FormsModule, SfFieldComponent, SfComboboxComponent, ActionButtonComponent]
})
export class ReassignEmployeeComponent implements OnInit, OnDestroy {

  employeeOptions: SfOption[] = [];
  selectedEmployee!: string;
  private subscriptions = new Subscription()

  constructor(
    private dialogRef: MatDialogRef<ReassignEmployeeComponent>,
    private _employeeService: EmployeeService,
    @Inject(MAT_DIALOG_DATA) public data: { enquiryId: string },
    private _enquiryService: EnquiryService,
  ) { }

  ngOnInit() {
    this._employeeService.getPresaleEngineers().subscribe((employees) => {
      this.employeeOptions = employees.map((e) => ({ value: e._id, label: `${e.firstName} ${e.lastName}` }));
    });
  }

  onClose() {
    this.dialogRef.close()
  }

  onSubmit() {
    this.subscriptions.add(
      this._enquiryService.reassignjob({ enquiryId: this.data.enquiryId, employeeId: this.selectedEmployee })
        .subscribe((res) => {
          if (res.message) {
            this.dialogRef.close({ message: res.message })
          }
        })
    )
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe()
  }
}
