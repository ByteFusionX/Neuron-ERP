import { AfterViewInit, Component, DoCheck, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatTableDataSource } from '@angular/material/table';
import { ProfileService } from 'src/app/core/services/profile/profile.service';
import { BehaviorSubject, Observable, Subscription } from 'rxjs';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { getEmployee } from 'src/app/shared/interfaces/employee.interface';
import { getCompanyDetails } from 'src/app/shared/interfaces/company.interface';
import { Router } from '@angular/router';
import { EditCompanyDetailsComponent } from '../edit-company-details/edit-company-details.component';
import { SetTargetComponent } from 'src/app/shared/components/set-target/set-target.component';
import { NgIf, AsyncPipe, TitleCasePipe } from '@angular/common';
import { NgIcon } from '@ng-icons/core';
import { SkeltonLoadingComponent } from '../../../../shared/components/skelton-loading/skelton-loading.component';

@Component({
    selector: 'app-profile-info',
    templateUrl: './profile-info.component.html',
    styleUrls: ['./profile-info.component.css'],
    imports: [NgIf, NgIcon, SkeltonLoadingComponent, AsyncPipe, TitleCasePipe]
})
export class ProfileInfoComponent {

  depName!: string;
  depHead!: string;
  optionSelected!: string;
  employee!: { id: string, employeeId: string }
  employeeData$!: Observable<getEmployee | undefined>
  isLoading: boolean = true
  companyDetails!: getCompanyDetails | null;



  displayedColumns: string[] = ['position', 'name', 'head', 'date', 'action'];
  dataSource: any = new MatTableDataSource()

  constructor(private _profileService: ProfileService,
    public dialog: MatDialog,
    private _employeeService: EmployeeService,
    private router: Router
  ) { }

  ngOnInit() {
    this.employee = this._employeeService.employeeToken()
    const employeeId = this.employee.employeeId
    this._employeeService.getEmployeeData(employeeId)
    this.employeeData$ = this._employeeService.employeeData$
    this.getCompanyDetails();
  }


  getCompanyDetails() {
    this._profileService.getCompanyDetails().subscribe((res) => {
      if (res) {
        this.companyDetails = res
      }
    })
  }

  updateCompanyDetails() {
    const dialogRef = this.dialog.open(EditCompanyDetailsComponent);

    dialogRef.afterClosed().subscribe((data) => {
      if (data) {
        this.getCompanyDetails();
      }
    });
  }
}