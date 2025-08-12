import { Component } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { ProfileService } from 'src/app/core/services/profile/profile.service';
import { CreateDepartmentDialog } from './pages/create-department/create-department.component';
import { MatTableDataSource, MatTable, MatColumnDef, MatHeaderCellDef, MatCellDef, MatCell, MatHeaderRowDef, MatHeaderRow, MatRowDef, MatRow } from '@angular/material/table';
import { BehaviorSubject, Subscription } from 'rxjs';
import { NoteFormComponent } from './pages/note-form/note-form.component';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { CreateCategoryComponent } from 'src/app/modules/home/pages/employees/create-category/create-category.component';
import { ToastrService } from 'ngx-toastr';
import { EditCategoryComponent } from './pages/edit-category/edit-category.component';
import { GetCategory, Privileges, Target } from 'src/app/shared/interfaces/employee.interface';
import { SetTargetComponent } from 'src/app/shared/components/set-target/set-target.component';
import { InternalDepartmentComponent } from './pages/internal-department/internal-department.component';
import { CreateCustomerTypeDialog } from './pages/create-customer-type/create-customer-type.component';
import { NgIf, NgFor, TitleCasePipe, DatePipe } from '@angular/common';
import { NgIcon } from '@ng-icons/core';
import { SkeltonLoadingComponent } from '../../shared/components/skelton-loading/skelton-loading.component';
import { NumberFormatterPipe } from '../../shared/pipes/numFormatter.pipe';

@Component({
    selector: 'app-portal-management',
    templateUrl: './settings.component.html',
    styleUrls: ['./settings.component.css'],
    imports: [NgIf, NgIcon, MatTable, MatColumnDef, MatHeaderCellDef, MatCellDef, MatCell, MatHeaderRowDef, MatHeaderRow, MatRowDef, MatRow, SkeltonLoadingComponent, NgFor, TitleCasePipe, DatePipe, NumberFormatterPipe]
})
export class SettingsComponnet {
  privileges!: Privileges | undefined;

  isTargetEmpty: boolean = false

  openCreateForm: boolean = false;
  isTargetLoading: boolean = true
  isDepartmentLoading: boolean = true
  isInternalDepartmentLoading: boolean = true
  isCustomerDepartmentLoading: boolean = true
  isCustomerTypeLoading: boolean = true
  isNotesLoading: boolean = true
  isCategoryLoading: boolean = true;
  categorySection: boolean = false;

  departmentDisplayedColumns: string[] = ['position', 'name', 'head', 'date', 'action'];
  customerDepartmentDisplayedColumns: string[] = ['position', 'name', 'date', 'action'];
  cstcDisplayedColumns: string[] = ['customerNote', 'termsCondition'];
  categoryDisplayedColumns: string[] = ['slNo', 'categoryName', 'role', 'count', 'action'];
  companyTargetColumns: string[] = ['year', 'targetType', 'targetValue', 'critical', 'moderate', 'action'];

  targets: Target[] = [];

  departmentDataSource: any = new MatTableDataSource();
  internalDepartmentDataSource: any = new MatTableDataSource();
  customerDepartmentDataSource: any = new MatTableDataSource();
  customerTypeDataSource: any = new MatTableDataSource();
  cstcDataSource: any = new MatTableDataSource();
  categoryDataSource: any = new MatTableDataSource();
  compnayTargetDataSource: any = new MatTableDataSource();

  private subscriptions = new Subscription();
  employeeId!: string;

  constructor(
    private _profileService: ProfileService,
    public dialog: MatDialog,
    private _employeeService: EmployeeService,
    private _toast: ToastrService
  ) { }



  ngOnInit() {
    const employee = this._employeeService.employeeToken()
    if (employee) {
      const employeeId = employee.employeeId
      this._employeeService.getEmployeeData();
    }

    this.subscriptions.add(
      this._employeeService.employeeData$.subscribe((employee) => {
        this.employeeId = employee?._id!
        this.privileges = employee?.category?.privileges;

        if (this.privileges?.portalManagement?.companyTarget) {
          this.subscriptions.add(
            this._profileService.getCompanyTargets().subscribe((data) => {
              if (data) {
                this.compnayTargetDataSource.data = this.expandData(data.targets)
                this.compnayTargetDataSource._updateChangeSubscription()
                this.isTargetEmpty = false;
              } else {
                this.isTargetEmpty = true;
              }
              this.isTargetLoading = false;
            })
          )
        }

        if (this.privileges?.portalManagement?.department) {
          this.subscriptions.add(
            this._profileService.getDepartments().subscribe((data) => {
              if (data) {
                this.departmentDataSource.data = data
                this.isDepartmentLoading = false
              }
            })
          )
        }

        if (this.privileges?.portalManagement?.department) {
          this.subscriptions.add(
            this._profileService.getInternalDepartments().subscribe((data) => {
              if (data) {
                this.internalDepartmentDataSource.data = data
                this.isInternalDepartmentLoading = false
              }
            })
          )
        }


        if (this.privileges?.portalManagement?.department) {
          this.subscriptions.add(
            this._profileService.getCustomerDepartments().subscribe((data) => {
              if (data) {
                this.customerDepartmentDataSource.data = data
                this.isCustomerDepartmentLoading = false
              }
            })
          )
        }

        if(this.privileges?.portalManagement?.customerType){
          this.subscriptions.add(
            this._profileService.getCustomerTypes().subscribe((data) => {
              if(data) {
                this.customerTypeDataSource.data = data
                this.isCustomerTypeLoading = false
              }
            })
          )
        }

        if (this.privileges?.portalManagement?.notesAndTerms) {
          this.subscriptions.add(
            this._profileService.getNotes().subscribe((data) => {
              if (data) {
                this.cstcDataSource.data = [data]
              }else {
                this.cstcDataSource.data = []
              }
              this.isNotesLoading = false
            })
          )
        }

        if (employee?.category.role == 'superAdmin') {
          this.categorySection = true
          this.subscriptions.add(
            this._employeeService.getCategory().subscribe((data) => {
              if (data) {
                this.categoryDataSource.data = data
                this.isCategoryLoading = false
              }
            })
          )
        }

      })
    )
  }

  onCreateDepartment() {
    const dialogRef = this.dialog.open(CreateDepartmentDialog, {
      data: { forCustomer: false }
    });
    dialogRef.afterClosed().subscribe(data => {
      if (data) {
        data.departmentHead = [data.departmentHead]
        this.departmentDataSource.data = [...this.departmentDataSource.data, data]
      }
    });
  }

  onCreateInternalDepartment() {
    const dialogRef = this.dialog.open(InternalDepartmentComponent, {});
    dialogRef.afterClosed().subscribe(data => {
      if (data) {
        data.departmentHead = [data.departmentHead]
        this.internalDepartmentDataSource.data = [...this.internalDepartmentDataSource.data, data]
      }
    });
  }

  onCreateCustomerDepartment() {
    const dialogRef = this.dialog.open(CreateDepartmentDialog, {
      data: { forCustomer: true }
    });
    dialogRef.afterClosed().subscribe(data => {
      if (data) {
        data.departmentHead = [data.departmentHead]
        this.customerDepartmentDataSource.data = [...this.customerDepartmentDataSource.data, data];
        this.customerDepartmentDataSource._updateChangeSubscription()
      }
    });
  }

  onCreateCustomerType() {
    const dialogRef = this.dialog.open(CreateCustomerTypeDialog, {
      data: {  }
    });
    dialogRef.afterClosed().subscribe(data => {
      if (data) {
        this.customerTypeDataSource.data = [...this.customerTypeDataSource.data, data]
      }
    });
  }

  onNoteForm(action: string, note?: string, noteId?: string) {
    const dialogRef = this.dialog.open(NoteFormComponent, {
      data: { action, note, noteId }
    });
    dialogRef.afterClosed().subscribe(data => {
      if (data) {
        this.cstcDataSource.data = [data]
      }
    });
  }

  onEditClick(index: number) {
    let department = this.departmentDataSource.data[index]
    if (department) {
      const dialogRef = this.dialog.open(CreateDepartmentDialog, { data: { forCustomer: false, department } });
      dialogRef.afterClosed().subscribe(data => {
        if (data) {
          data.departmentHead = [data.departmentHead]
          this.departmentDataSource.data[index] = data
          this.departmentDataSource.data = [...this.departmentDataSource.data]
        }
      })
    }
  }

  onInternalEditClick(index: number) {
    let department = this.internalDepartmentDataSource.data[index]
    if (department) {
      const dialogRef = this.dialog.open(InternalDepartmentComponent, { data: department });
      dialogRef.afterClosed().subscribe(data => {
        if (data) {
          data.departmentHead = [data.departmentHead]
          this.internalDepartmentDataSource.data[index] = data;
          this.internalDepartmentDataSource.data = [...this.internalDepartmentDataSource.data]
        }
      })
    }
  }

  onEditCustomerClick(index: number) {
    let department = this.customerDepartmentDataSource.data[index]
    if (department) {
      const dialogRef = this.dialog.open(CreateDepartmentDialog, { data: { forCustomer: true, department } });
      dialogRef.afterClosed().subscribe(data => {
        if (data) {
          data.departmentHead = [data.departmentHead]
          this.customerDepartmentDataSource.data[index] = data
          this.customerDepartmentDataSource._updateChangeSubscription()
        }
      })
    }
  }

  onEditCustomerTypeClick(index: number) {
    let customerType = this.customerTypeDataSource.data[index]
    if (customerType) {
      const dialogRef = this.dialog.open(CreateCustomerTypeDialog, { data: {  customerType } });
      dialogRef.afterClosed().subscribe(data => {
        if (data) {
          this.customerTypeDataSource.data[index] = data
          this.customerTypeDataSource._updateChangeSubscription()
        }
      })
    }
  }

  onCustomerTypeDeleteClick(index: number) {
    let customerType = this.customerTypeDataSource.data[index]
    if (customerType) {
      const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
        data: {
          title: 'Delete Customer Type',
          description: `Are you sure you want to delete "${customerType.customerTypeName}" department?`,
          icon: 'heroExclamationCircle',
          IconColor: 'red'
        }
      });

      dialogRef.afterClosed().subscribe((confirmed: boolean) => {
        if (confirmed) {
          this._profileService.deleteCustomerType({ dataId: customerType._id, employee: this.employeeId }).subscribe({
            next: () => {
              // Remove the department from the table
              this.customerTypeDataSource.data.splice(index, 1);
              this.customerTypeDataSource._updateChangeSubscription();
              this._toast.success('Customer Type deleted successfully');
            },
            error: (error) => {
              this._toast.error(error.error.message || 'Failed to delete customer type');
            }
          });
        }
      });
    }
  }

  onNoteDelete(noteType: string, noteId: string) {
    const dialogRef = this.dialog.open(ConfirmationDialogComponent,
      {
        data: {
          title: `Are you absolutely sure?`,
          description: `This action is irreversible. The note will be deleted.`,
          icon: 'heroExclamationCircle',
          IconColor: 'orange'
        }
      });

    dialogRef.afterClosed().subscribe((approved: boolean) => {
      if (approved) {
        this._profileService.deleteNote(noteType, noteId).subscribe((res) => {
          if (res.success) {
            let noteData = this.cstcDataSource.data[0];
            if (noteType === "customerNotes" || noteType === "termsAndConditions") {
              const index = noteData[noteType].findIndex((note: any) => note._id === noteId);
              if (index !== -1) {
                noteData[noteType].splice(index, 1);
              }
            }
            this.cstcDataSource.data = [noteData];
          }
        })
      }
    })
  }

  createCategory() {
    const dialogRef = this.dialog.open(CreateCategoryComponent, {
      width: '100vh'
    });
    dialogRef.afterClosed().subscribe((data) => {
      if (data) {
        this.categoryDataSource.data.push(data)
        this.categoryDataSource._updateChangeSubscription();

        this._toast.success('Category Created Successfully')
      }
    });
  }

  editCategory(data: GetCategory, index: number) {
    const dialogRef = this.dialog.open(EditCategoryComponent, {
      width: '100vh',
      data: data
    });
    dialogRef.afterClosed().subscribe((data) => {
      if (data) {
        this.categoryDataSource.data[index] = data;
        this.categoryDataSource._updateChangeSubscription();

        this._toast.success('Category Updated Successfully')
      }
    });
  }

  addCompanyTarget() {
    const dialogRef = this.dialog.open(SetTargetComponent);
    dialogRef.afterClosed().subscribe((data: Target) => {
      if (data) {
        this._profileService.setCompanyTarget(data).subscribe({
          next: (res) => {
            this.compnayTargetDataSource.data = this.expandData(res);
            this.compnayTargetDataSource._updateChangeSubscription()
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
        this._profileService.updateCompanyTarget(id, data).subscribe({
          next: (res) => {
            this.compnayTargetDataSource.data = this.expandData(res);
            this.compnayTargetDataSource._updateChangeSubscription()
          },
          error: (error) => {
            console.log(error);

            this._toast.warning(error.error.message)
          }
        })
      }
    })
  }

  expandData(data: Target[]) {
    this.targets = data;
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

  ngOnDestroy() {
    this.subscriptions.unsubscribe()
  }

  onDeleteClick(index: number) {
    let department = this.departmentDataSource.data[index]
    if (department) {
      const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
        data: {
          title: 'Delete Department',
          description: `Are you sure you want to delete "${department.departmentName}" department?`,
          icon: 'heroExclamationCircle',
          IconColor: 'red'
        }
      });

      dialogRef.afterClosed().subscribe((confirmed: boolean) => {
        if (confirmed) {
          this._profileService.deleteDepartment({ dataId: department._id, employee: this.employeeId }).subscribe({
            next: () => {
              // Remove the department from the table
              this.departmentDataSource.data.splice(index, 1);
              this.departmentDataSource._updateChangeSubscription();
              this._toast.success('Department deleted successfully');
            },
            error: (error) => {
              this._toast.error(error.error.message || 'Failed to delete department');
            }
          });
        }
      });
    }
  }

  onInternalDeleteClick(index: number) {
    let department = this.internalDepartmentDataSource.data[index]
    if (department) {
      const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
        data: {
          title: 'Delete Internal Department',
          description: `Are you sure you want to delete "${department.departmentName}" department?`,
          icon: 'heroExclamationCircle',
          IconColor: 'red'
        }
      });

      dialogRef.afterClosed().subscribe((confirmed: boolean) => {
        if (confirmed) {
          this._profileService.deleteInternalDepartment({ dataId: department._id, employee: this.employeeId }).subscribe({
            next: () => {
              // Remove the department from the table
              this.internalDepartmentDataSource.data.splice(index, 1);
              this.internalDepartmentDataSource._updateChangeSubscription();
              this._toast.success('Internal department deleted successfully');
            },
            error: (error) => {
              this._toast.error(error.error.message || 'Failed to delete internal department');
            }
          });
        }
      });
    }
  }

  onCustomerDeleteClick(index: number) {
    let department = this.customerDepartmentDataSource.data[index]
    if (department) {
      const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
        data: {
          title: 'Delete Customer Department',
          description: `Are you sure you want to delete "${department.departmentName}" department?`,
          icon: 'heroExclamationCircle',
          IconColor: 'red'
        }
      });

      dialogRef.afterClosed().subscribe((confirmed: boolean) => {
        if (confirmed) {
          this._profileService.deleteCustomerDepartment({ dataId: department._id, employee: this.employeeId }).subscribe({
            next: () => {
              // Remove the department from the table
              this.customerDepartmentDataSource.data.splice(index, 1);
              this.customerDepartmentDataSource._updateChangeSubscription();
              this._toast.success('Customer department deleted successfully');
            },
            error: (error) => {
              this._toast.error(error.error.message || 'Failed to delete customer department');
            }
          });
        }
      });
    }
  }

  deleteCategory(index: number) {
    const category = this.categoryDataSource.data[index];
    if (category) {
      const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
        data: {
          title: 'Delete Category',
          description: `Are you sure you want to delete "${category.categoryName}" category?`,
          icon: 'heroExclamationCircle',
          IconColor: 'red'
        }
      });

      dialogRef.afterClosed().subscribe((confirmed: boolean) => {
        if (confirmed) {
          this._employeeService.deleteCategory({ dataId: category._id, employee: this.employeeId }).subscribe({
            next: () => {
              // Remove the category from the table
              this.categoryDataSource.data.splice(index, 1);
              this.categoryDataSource._updateChangeSubscription();
              this._toast.success('Category deleted successfully');
            },
            error: (error) => {
              this._toast.error(error.error.message || 'Failed to delete category');
            }
          });
        }
      });
    }
  }
}

