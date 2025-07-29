import { CommonModule } from '@angular/common';
import { Component, Input, Output, EventEmitter, OnInit, OnChanges, inject, Inject } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, FormsModule, Validators, FormControl } from '@angular/forms';
import { SelectDropdownComponent } from 'src/app/shared/components/forms/select-dropdown/select-dropdown.component';
import { RadioGroupComponent } from 'src/app/shared/components/forms/radio-group/radio-group.component';
import { FormFieldComponent } from 'src/app/shared/components/forms/form-field/form-field.component';
import { CustomerService } from 'src/app/core/services/customer/customer.service';
import { getCustomer } from 'src/app/shared/interfaces/customer.interface';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { MatDialogRef } from '@angular/material/dialog';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { TechnicalService } from 'src/app/core/services/technical.service';
import { NgIconsModule } from '@ng-icons/core';

@Component({
  selector: 'app-issue-form',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    SelectDropdownComponent,
    NgIconsModule,
    FormFieldComponent
  ],
  templateUrl: './issue-form.component.html',
  styleUrl: './issue-form.component.css'
})
export class IssueFormComponent implements OnInit, OnChanges {
  @Input() issue: any = null;

  isSaving = false;

  private _employeeService = inject(EmployeeService);
  private _customerService = inject(CustomerService);
  private _technicalService = inject(TechnicalService);

  form: FormGroup = this.fb.group({
    subject: ['', Validators.required],
    customer: ['', Validators.required],
    issueType: ['', Validators.required],
    raisedBy: ['', Validators.required],
    description: [''],
    status: ['', Validators.required],
    respondedOn: [''],
    closedBy: [''],
    closedOn: [''],
    comments: [''],
  });

  isSubmitted = false;
  customers: getCustomer[] = [];
  issueTypeOptions = [
    { id: 'Hardware', name: 'Hardware' },
    { id: 'Software', name: 'Software' },
    { id: 'Network', name: 'Network' },
    { id: 'Other', name: 'Other' }
  ];
  statusOptions = [
    { id: 'Pending', name: 'Pending' },
    { id: 'Resolved', name: 'Resolved' },
    { id: 'Closed', name: 'Closed' }
  ];

  get subjectControl() { return this.form.get('subject') as FormControl; }
  get customerControl() { return this.form.get('customer') as FormControl; }
  get issueTypeControl() { return this.form.get('issueType') as FormControl; }
  get raisedByControl() { return this.form.get('raisedBy') as FormControl; }
  get descriptionControl() { return this.form.get('description') as FormControl; }
  get statusControl() { return this.form.get('status') as FormControl; }
  get respondedOnControl() { return this.form.get('respondedOn') as FormControl; }
  get closedByControl() { return this.form.get('closedBy') as FormControl; }
  get closedOnControl() { return this.form.get('closedOn') as FormControl; }
  get commentsControl() { return this.form.get('comments') as FormControl; }

  constructor(
    private fb: FormBuilder,
    public dialogRef: MatDialogRef<IssueFormComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { technicalId: string, issue: any },
  ) { }

  ngOnInit(): void {
    this.getAllCustomers()
    if (this.data.issue) {
      const issueData = { ...this.data.issue };
      
      if (issueData.respondedOn) {
        issueData.respondedOn = new Date(issueData.respondedOn).toISOString().split('T')[0];
      }
      
      if (issueData.closedOn) {
        issueData.closedOn = new Date(issueData.closedOn).toISOString().split('T')[0];
      }
      
      this.form.patchValue(issueData);
    }
  }

  getAllCustomers() {
    let userId;
    this._employeeService.employeeData$.subscribe((data) => {
      userId = data?._id
    })
    this._customerService.getAllCustomers(userId).subscribe((customers) => {
      this.customers = customers;
    });
  }

  ngOnChanges(): void {
    if (this.issue) {
      const issueData = { ...this.issue };
      
      if (issueData.respondedOn) {
        issueData.respondedOn = new Date(issueData.respondedOn).toISOString().split('T')[0];
      }
      
      if (issueData.closedOn) {
        issueData.closedOn = new Date(issueData.closedOn).toISOString().split('T')[0];
      }
      
      this.form.patchValue(issueData);
    }
  }

  onSave(): void {
    this.isSubmitted = true;
    this.isSaving = true;
    if (this.form.valid) {
      const rawValue = this.form.value;
      const filteredValue = Object.keys(rawValue).reduce((acc, key) => {
        const value = rawValue[key];
        if (value !== '' && value !== null && value !== undefined) {
          acc[key] = value;
        }
        return acc;
      }, {} as any);

      if(this.data.issue._id) {
        this._technicalService.updateIssue(this.data.technicalId, this.data.issue._id, filteredValue).subscribe((res) => {
          this.dialogRef.close(res);
          this.isSaving = false;
        })
      } else {
        this._technicalService.createIssue(this.data.technicalId, filteredValue).subscribe((res) => {
          this.dialogRef.close(res);
          this.isSaving = false;
        })
      }
    }
  }

  onCancel(): void {
    this.dialogRef.close();
  }
} 