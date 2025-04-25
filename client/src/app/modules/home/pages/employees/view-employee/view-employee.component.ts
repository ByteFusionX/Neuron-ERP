import { Component } from '@angular/core';
import { ActivatedRoute, NavigationExtras, Router } from '@angular/router';
import { getEmployeeDetails, Target } from 'src/app/shared/interfaces/employee.interface';
import { EditEmployeeComponent } from '../edit-employee/edit-employee.component';
import { MatDialog } from '@angular/material/dialog';
import { ToastrService } from 'ngx-toastr';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { SetTargetComponent } from 'src/app/shared/components/set-target/set-target.component';
import { MatTableDataSource, MatTable, MatColumnDef, MatHeaderCellDef, MatCellDef, MatCell, MatHeaderRowDef, MatHeaderRow, MatRowDef, MatRow } from '@angular/material/table';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { NgIcon } from '@ng-icons/core';
import { NgIf, TitleCasePipe, DatePipe } from '@angular/common';
import { SkeltonLoadingComponent } from '../../../../../shared/components/skelton-loading/skelton-loading.component';
import { NumberFormatterPipe } from '../../../../../shared/pipes/numFormatter.pipe';

@Component({
    selector: 'app-view-employee',
    templateUrl: './view-employee.component.html',
    styleUrls: ['./view-employee.component.css'],
    imports: [NgIcon, NgIf, MatTable, MatColumnDef, MatHeaderCellDef, MatCellDef, MatCell, MatHeaderRowDef, MatHeaderRow, MatRowDef, MatRow, SkeltonLoadingComponent, TitleCasePipe, DatePipe, NumberFormatterPipe]
})
export class ViewEmployeeComponent {

  employeeData!: getEmployeeDetails;
  targetDataSource: any = new MatTableDataSource();
  targetColumns: string[] = ['year', 'targetType', 'targetValue', 'critical', 'moderate', 'action'];
  isTargetLoading: boolean = true;
  isEmpty: boolean = false;
  isDeleteOption: boolean = false;

  targets: Target[] = [];

  constructor(
    private router: Router,
    private dialog: MatDialog,
    private _toast: ToastrService,
    private employeeService: EmployeeService,
    private route: ActivatedRoute
  ) {
    this.initEmployeeData();
  }

  ngOnInit() {
    this.employeeService.employeeData$.subscribe((employee) => {
      if (employee?.category.role == 'superAdmin') {
        this.isDeleteOption = true
      }

    })
  }

  private initEmployeeData(): void {
    const navigation = this.router.getCurrentNavigation();

    if (navigation?.extras?.state) {
      this.employeeData = navigation.extras.state as getEmployeeDetails;
      this.updateTargetTable(this.employeeData)
    } else {
      const employeeId = this.route.snapshot.paramMap.get('employeeId');
      if (employeeId) {
        this.loadEmployeeData(employeeId);
      } else {
        this.navigateToEmployeeList();
      }
    }
  }

  private loadEmployeeData(employeeId: string): void {
    this.employeeService.employeeData$.subscribe((employee) => {
      const access = employee?.category?.privileges?.employee?.viewReport;
      const userId = employee?._id;

      this.employeeService.getEmployeeByEmployeeId(employeeId, access, userId).subscribe(
        {
          next: (res) => {
            if (res?.access) {
              this.employeeData = res.employeeData;
              this.updateTargetTable(res.employeeData)
            } else {
              this._toast.warning('You do not have permission to view this employee’s details.');
              this.navigateToEmployeeList();
            }
          },
          error: () => this.navigateToEmployeeList()
        }
      );
    });
  }

  private navigateToEmployeeList(): void {
    this.router.navigateByUrl('/home/employees');
  }

  private updateTargetTable(employeeData: getEmployeeDetails): void {
    if (employeeData && employeeData.category.isSalespersonWithTarget) {
      this.targetDataSource.data = this.expandData(employeeData.targets);
      this.targetDataSource._updateChangeSubscription();
      this.isEmpty = !employeeData?.targets?.length ? true : false;
      this.isTargetLoading = false
    }
  }

  onEmployeeEdit() {
    const dialogRef = this.dialog.open(EditEmployeeComponent,
      { data: { employeeData: this.employeeData } });

    dialogRef.afterClosed().subscribe((data) => {
      if (data) {
        this.employeeData = data;
        this._toast.success('Employee Updated Successfully')
      }
    });
  }

  addCompanyTarget() {
    const dialogRef = this.dialog.open(SetTargetComponent);
    dialogRef.afterClosed().subscribe((data: Target) => {
      if (data) {
        this.employeeService.setTarget(data, this.employeeData._id).subscribe({
          next: (res) => {
            this.targetDataSource.data = this.expandData(res);
            this.targetDataSource._updateChangeSubscription()
            this.isEmpty = !res.length ? true : false;
          },
          error: (error) => {
            this._toast.warning(error.error.message)
          }
        })
      }
    })
  }

  editTarget(id: string) {
    const target = this.targets.find(target => target._id == id)

    const dialogRef = this.dialog.open(SetTargetComponent, {
      data: target
    });
    dialogRef.afterClosed().subscribe((data: Target) => {
      if (data) {
        this.employeeService.updateTarget(data, id, this.employeeData._id).subscribe({
          next: (res) => {
            this.targetDataSource.data = this.expandData(res);
            this.targetDataSource._updateChangeSubscription()
          },
          error: (error) => {
            this._toast.warning(error.error.message)
          }
        })
      }
    })
  }

  expandData(data: Target[]) {
    this.targets = data;
    if (data) {
      return data.flatMap((element) => [
        {
          year: element.year,
          _id: element._id,
          targetType: 'Sales Revenue',
          criticalRange: element.salesRevenue.criticalRange,
          targetValue: element.salesRevenue.targetValue,
          moderateRange: element.salesRevenue.moderateRange,
          isFirstRow: true,
          rowspan: 2
        },
        {
          targetType: 'Gross Profit',
          criticalRange: element.grossProfit.criticalRange,
          targetValue: element.grossProfit.targetValue,
          moderateRange: element.grossProfit.moderateRange,
          isFirstRow: false
        }
      ]);
    }
    return
  }

  deleteEmployee() {
    const employee = this.employeeService.employeeToken()

    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        title: 'Delete Employee',
        description: `Are you sure you want to delete "${this.employeeData.firstName} ${this.employeeData.lastName}"?`,
        icon: 'heroExclamationCircle',
        IconColor: 'red'
      }
    });

    dialogRef.afterClosed().subscribe((confirmed: boolean) => {
      if (confirmed) {
        this.employeeService.deleteEmployee({ dataId: this.employeeData._id!, employeeId: employee.id }).subscribe({
          next: () => {
            this._toast.success('Employee deleted successfully');
            this.navigateToEmployeeList();
          },
          error: (error) => {
            this._toast.error(error.error.message || 'Failed to delete employee');
          }
        });
      }
    });
  }

}
