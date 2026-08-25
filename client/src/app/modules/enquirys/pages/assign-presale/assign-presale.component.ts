import { ChangeDetectionStrategy, Component, ElementRef, Inject, OnInit, ViewChild, ViewEncapsulation } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { fileEnterState } from '../../enquiry-animations';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { combineLatest, map, Observable } from 'rxjs';
import { getEmployee } from 'src/app/shared/interfaces/employee.interface';
import { TitleStrategy } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { FormsModule } from '@angular/forms';
import { NgSelectComponent, NgOptionComponent } from '@ng-select/ng-select';
import { NgFor, NgIf, NgClass, AsyncPipe } from '@angular/common';
import { appNoLeadingSpace } from '../../../../shared/directives/trim-validator.directive';
import { UploadFileComponent } from '../../../../shared/components/upload-file/upload-file.component';
import { ModalLayoutComponent, ModalFooterButton } from '../../../../shared/components/modal-layout/modal-layout.component';

@Component({
    selector: 'app-assign-presale',
    templateUrl: './assign-presale.component.html',
    styleUrls: ['./assign-presale.component.css'],
    animations: [fileEnterState],
    encapsulation: ViewEncapsulation.None,
    imports: [NgIcon, FormsModule, NgSelectComponent, NgFor, NgOptionComponent, NgIf, appNoLeadingSpace, NgClass, UploadFileComponent, AsyncPipe, ModalLayoutComponent]
})
export class AssignPresaleComponent implements OnInit {

  selectedFiles: File[] = []
  employees$!: Observable<getEmployee[]>
  selectedEmployee!: string | undefined;
  comment!: string;
  employeeError: boolean = false;
  fileError: boolean = false;
  commentError: boolean = false;
  isClear: boolean = false;
  isSaving: boolean = false;

  footerButtons: ModalFooterButton[] = [];

  constructor(
    public dialogRef: MatDialogRef<AssignPresaleComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { presalePerson: string, presaleFiles: File[], comment: string },
    private _employeeService: EmployeeService,
  ) { }

  ngOnInit(): void {
    this.employees$ = combineLatest([
      this._employeeService.getPresaleEngineers(),
      this._employeeService.getPresaleManagers()
    ]).pipe(map(([engineers, managers]) => [...engineers, ...managers]))
    if (this.data?.presalePerson) {
      this.selectedEmployee = this.data.presalePerson
      this.comment = this.data.comment
      this.selectedFiles = this.data.presaleFiles || []
      this.isClear = true
    }
    this.updateFooterButtons();
  }

  updateFooterButtons() {
    this.footerButtons = [];
    if (this.isClear) {
      this.footerButtons.push({
        label: 'Clear',
        onClick: () => this.onClear(),
        theme: 'secondary'
      });
    }
    this.footerButtons.push({
      label: 'Close',
      onClick: () => this.onClose(),
      theme: 'cancel'
    });
    this.footerButtons.push({
      label: 'Submit',
      onClick: () => this.onSubmit(),
      theme: 'primary',
      loading: this.isSaving
    });
  }

  onClose() {
    this.dialogRef.close()
  }

  onChange(change: string) {
    this.selectedEmployee = change
    this.validateSalesPerson()
  }

  onFileUpload(event: File[]) {
    this.validateFile()
    this.selectedFiles = event
  }

  onSubmit() {

    let presalePersonName: String;
    this.isSaving = true;
    this.employees$.subscribe((employees) => {
      employees.forEach((employee) => {
        if (this.selectedEmployee == employee._id) {
          presalePersonName = `${employee.firstName} ${employee.lastName}`
        }
      })
      if (this.selectedEmployee && this.selectedFiles.length && presalePersonName && this.comment) {
        let newFiles: File[] = [];
        let existingFile: File[] = [];
        this.selectedFiles.forEach((file) => {
          if (file.name) {
            newFiles.push(file)
          } else {
            existingFile.push(file)
          }
        })
        let presale = { presalePerson: this.selectedEmployee, newPresaleFile: newFiles, existingPresaleFiles: existingFile, presalePersonName: presalePersonName, comment: this.comment }
        this.isSaving = false;
        this.updateFooterButtons();
        this.dialogRef.close(presale)
      } else {
        this.isSaving = false;
        this.updateFooterButtons();
        this.validateComment();
        this.validateFile();
        this.validateSalesPerson();
      }
    })
  }

  onClear() {
    this.selectedEmployee = undefined
    this.comment = ''
    this.selectedFiles = []
    this.dialogRef.close({ clear: true })
  }

  validateFile() {
    if (this.selectedFiles && this.selectedFiles.length == 0) {
      this.fileError = true
    } else {
      this.fileError = false
    }
  }

  validateSalesPerson() {
    if (!this.selectedEmployee) {
      this.employeeError = true
    } else {
      this.employeeError = false
    }
  }

  validateComment() {
    if (!this.comment) {
      this.commentError = true;
    } else {
      this.commentError = false;
    }
  }
}
