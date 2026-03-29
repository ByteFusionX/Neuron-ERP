import { Component, Inject, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IconsModule } from 'src/app/lib/icons/icons.module';
import { Observable, Subject, Subscription } from 'rxjs';
import { getEmployee } from '../../interfaces/employee.interface';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { NgSelectModule } from '@ng-select/ng-select';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { UploadFileComponent } from '../upload-file/upload-file.component';
import { EventsService } from 'src/app/core/services/events/events.service';

@Component({
    selector: 'app-events',
    imports: [CommonModule, IconsModule, MatDialogModule, NgSelectModule, ReactiveFormsModule, FormsModule, UploadFileComponent],
    templateUrl: './events.component.html',
    styleUrls: ['./events.component.css']
})
export class EventsComponent implements OnInit, OnDestroy {

  selectedFiles: File[] = []
  employees$!: Observable<getEmployee[]>
  selectedEmployee!: string | undefined;
  selectedEvent!: string;
  selectedDate!: string;
  summary!: string;
  employeeError: boolean = false;
  fileError: boolean = false;
  commentError: boolean = false;
  eventError: boolean = false;
  dateError: boolean = false;
  isClear: boolean = false;
  isSaving: boolean = false;
  availabiltyInput$ = new Subject<string>();

  private subscriptions = new Subscription()

  constructor(
    public dialogRef: MatDialogRef<EventsComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { collectionId: string, from: string },
    private _employeeService: EmployeeService,
    private _eventService: EventsService,
  ) { }

  ngOnInit(): void {
    this.employees$ = this._employeeService.getAllEmployees()
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe()
  }

  onClose() {
    this.dialogRef.close()
  }

  onChange(change: string) {
    this.selectedEmployee = change
    this.validateSalesPerson()
  }

  onChangeEvent(change: string) {
    this.selectedEvent = change
  }

  onFileUpload(event: File[]) {
    this.selectedFiles = event
  }

  onSubmit() {
    this.validateEvent();
    this.validateSalesPerson();
    this.validateComment();
    this.validateDate();
    
    if (this.eventError || this.employeeError || this.commentError || this.dateError) {
      this.isSaving = false;
      return;
    }
    
    this.isSaving = true;
    const eventData = {
      from: this.data.from,
      collectionId: this.data.collectionId,
      event: this.selectedEvent,
      date: this.selectedDate,
      employee: this.selectedEmployee,
      summary: this.summary,
      eventFiles: this.selectedFiles
    }

    let formData = new FormData();
    formData.append('eventData', JSON.stringify(eventData));

    if (eventData.eventFiles) {
      for (let i = 0; i < eventData.eventFiles.length; i++) {
        formData.append('eventFile', (eventData.eventFiles[i] as unknown as Blob))
      }
    }

    this.subscriptions.add(
      this._eventService.newEvent(formData).subscribe({
        next: (res) => {
          if (res) {
            this.dialogRef.close(res)
          }
          this.isSaving = false;
        },
        error: (error) => {
          this.isSaving = false;
        }
      })
    )
  }

  onClear() {
    this.selectedEmployee = undefined
    this.summary = ''
    this.selectedFiles = []
    this.dialogRef.close({ clear: true })
  }

  validateFile() {
    if (this.selectedFiles.length == 0) {
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
    if (!this.summary) {
      this.commentError = true;
    } else {
      this.commentError = false;
    }
  }

  validateEvent() {
    if (!this.selectedEvent) {
      this.eventError = true
    } else {
      this.eventError = false
    }
  }

  validateDate() {
    const dateValue = this.selectedDate;
    if (!dateValue || 
        (typeof dateValue === 'string' && dateValue.trim() === '') ||
        dateValue === null ||
        dateValue === undefined) {
      this.dateError = true
    } else {
      this.dateError = false
    }
  }
}
