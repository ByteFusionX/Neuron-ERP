import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, Inject, NgZone, OnDestroy, OnInit, ViewChild, ViewEncapsulation } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { NgSelectConfig } from '@ng-select/ng-select';
import { CustomerService } from 'src/app/core/services/customer/customer.service';
import { ProfileService } from 'src/app/core/services/profile/profile.service';
import { ContactDetail, getCustomer } from 'src/app/shared/interfaces/customer.interface';
import { getDepartment } from 'src/app/shared/interfaces/department.interface';
import { AssignPresaleComponent } from '../assign-presale/assign-presale.component';
import { Observable, Subscription } from 'rxjs';
import { fileEnterState } from '../enquiry-animations';
import { Enquiry, Presale } from 'src/app/shared/interfaces/enquiry.interface';
import { EnquiryService } from 'src/app/core/services/enquiry/enquiry.service';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';

@Component({
    selector: 'app-create-enquiry',
    templateUrl: './create-enquiry.component.html',
    styleUrls: ['./create-enquiry.component.css'],
    animations: [fileEnterState],
    encapsulation: ViewEncapsulation.None,
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class CreateEnquiryDialog implements OnInit, OnDestroy {

  @ViewChild('fileInput') fileInput!: ElementRef;

  customers$!: Observable<getCustomer[]>;
  enquirys$!: Observable<Enquiry[]>;
  contacts: ContactDetail[] = []
  departments$!: Observable<getDepartment[]>;
  selectedDep!: string;
  selectedFiles: any[] = []
  private subscriptions = new Subscription();
  tokenData!: { id: string, employeeId: string };
  submit: boolean = false;

  isSaving: boolean = false;
  isQuoting: boolean = false;

  today = new Date().toISOString().substring(0, 10)
  enquiryForm = this._fb.group({
    client: [undefined, Validators.required],
    contact: [undefined, Validators.required],
    department: [undefined, Validators.required],
    salesPerson: ['', Validators.required],
    title: ['', Validators.required],
    date: [this.today, Validators.required],
    attachments: [],
    presale: [],
    status: 'Work In Progress'
  })

  constructor(
    public dialogRef: MatDialogRef<CreateEnquiryDialog>,
    @Inject(MAT_DIALOG_DATA) public data: string,
    private dialog: MatDialog,
    private config: NgSelectConfig,
    private _fb: FormBuilder,
    private _customerService: CustomerService,
    private _profileService: ProfileService,
    private _enquiryService: EnquiryService,
    private _employeeService: EmployeeService,
    private router: Router,
    private toastr: ToastrService,
    private cdr: ChangeDetectorRef
  ) {
    this.config.notFoundText = 'Select a client first..';
  }

  ngOnInit(): void {
    this.tokenData = this._employeeService.employeeToken()
    this.getEmployee()
    this.getAllCustomers()
    this.getDepartments()
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe()
  }

  onChange(change: string) {
    this.enquiryForm.controls.contact.patchValue(undefined)
    this.contacts = []
    this.config.notFoundText = 'Wait a few Seconds..';
    if (change && this.customers$) {
      this.subscriptions.add(this.customers$.subscribe((data) => {
        let customer = data.find((contact) => contact._id == change)
        if (customer) {
          this.contacts = customer.contactDetails
        }
      }))
    } else {
      this.config.notFoundText = 'Select a client first..';
      this.contacts = []
      this.enquiryForm.controls.contact.setValue(undefined)
    }
  }

  onFileSelected(event: any) {
    let files = event.target.files
    for (let i = 0; i < files.length; i++) {
      const newFile = files[i]
      const exist = (this.selectedFiles as File[]).some((file: File) => file.name === newFile.name)
      if (!exist) {
        (this.selectedFiles as File[]).push(files[i])
      }
    }
  }

  get f() {
    return this.enquiryForm.controls;
  }

  onFileRemoved(index: number) {
    (this.selectedFiles as File[]).splice(index, 1)
    this.fileInput.nativeElement.value = '';
  }


  setUpFormData(): FormData {
    let formData = new FormData();

    this.enquiryForm.controls.salesPerson.setValue(this.tokenData.id)
    let data = this.enquiryForm.value as Partial<Enquiry>

    formData.append('enquiryData', JSON.stringify(data));
    for (let i = 0; i < this.selectedFiles.length; i++) {
      formData.append('attachments', (this.selectedFiles[i] as Blob))
    }
    return formData;
  }

  onSubmit() {
    this.submit = true;
    this.isSaving = true;
    if (this.enquiryForm.valid) {
      const formData = this.setUpFormData()
      this.subscriptions.add(
        this._enquiryService.createEnquiry(formData).subscribe((data) => {
          if (data) {
            this.isSaving = false
            this.dialogRef.close(data)
          }
        })
      )
    } else {
      this.isSaving = false
      this.toastr.warning('Check the fields properly!', 'Warning !')
    }
  }


  onClose() {
    this.dialogRef.close()
  }

  createCustomer() {
    this.onClose()
  }

  onClickQuote() {
    this.submit = true;
    this.isQuoting = true;
    if (this.enquiryForm.valid) {
      const formData = this.setUpFormData()
      this.subscriptions.add(
        this._enquiryService.createEnquiry(formData).subscribe((data) => {
          if (data) {
            this._enquiryService.emitToQuote(data)
            this.isQuoting = false;
            this.dialogRef.close()
            this.router.navigate(['/quotations/create'])
          }
        })
      )
    } else {
      this.isQuoting = false;
      this.toastr.warning('Check the fields properly!', 'Warning !')
    }
  }

  getAllCustomers() {
    let userId;
    this._employeeService.employeeData$.subscribe((data)=>{
      userId = data?._id
    })
    this.customers$ = this._customerService.getAllCustomers(userId)
  }

  getDepartments() {
    this.departments$ = this._profileService.getDepartments()
  }

  getEmployee() {
    this._employeeService.employeeData$.subscribe(data => {
      if (data) {
        this.enquiryForm.controls.salesPerson.setValue(data.firstName + ' ' + data.lastName)
      }
    })
  }

  getDepartment(id: string) {
    this.subscriptions.add(
      this.departments$.subscribe((data) => {
        let department = data.find(val => val._id == id)
        if (department) {
          this.selectedDep = department.departmentName.toUpperCase().slice(0, 4)
        }
      })
    )
  }
}
