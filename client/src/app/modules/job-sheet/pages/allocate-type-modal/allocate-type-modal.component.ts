import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Inject, OnInit, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { CommonModule } from '@angular/common';
import { NgIconComponent } from '@ng-icons/core';
import { getJob } from 'src/app/shared/interfaces/job.interface';
import { IconsModule } from 'src/app/lib/icons/icons.module';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { getEmployee } from 'src/app/shared/interfaces/employee.interface';
import { FormsModule } from '@angular/forms';
import { NgSelectModule } from '@ng-select/ng-select';
import { ModalLayoutComponent } from 'src/app/shared/components/modal-layout/modal-layout.component';

export enum allocateType {
  SupplyOnly = 'Supply Only',
  ProjectWithSupply = 'Project With Supply',
  ProjectsWithOutSupply = 'Projects With Out Supply',
  AMC = 'AMC'
}

@Component({
  selector: 'app-allocate-type-modal',
  imports: [CommonModule, NgIconComponent, IconsModule, FormsModule, NgSelectModule, ModalLayoutComponent],
  templateUrl: './allocate-type-modal.component.html',
  styleUrl: './allocate-type-modal.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AllocateTypeModalComponent implements OnInit {
  private employeeService = inject(EmployeeService);
  private cdr = inject(ChangeDetectorRef);
  
  allocateTypeEnum = allocateType;
  selectedAllocationType: allocateType | null = null;
  selectedProcurementPerson: string | null = null;
  employees: getEmployee[] = [];
  employeeOptions: { label: string; value: string }[] = [];
  procurementPersonError: boolean = false;
  
  allocationTypes = [
    { key: allocateType.SupplyOnly, label: 'Supply Only', icon: 'heroTruck' },
    { key: allocateType.ProjectWithSupply, label: 'Project With Supply', icon: 'heroWrench' },
    { key: allocateType.ProjectsWithOutSupply, label: 'Projects Without Supply', icon: 'heroCog6Tooth' },
    { key: allocateType.AMC, label: 'AMC', icon: 'heroShieldCheck' }
  ];

  constructor(
    public dialogRef: MatDialogRef<AllocateTypeModalComponent>,
    @Inject(MAT_DIALOG_DATA) public data: getJob,
  ) {}

  ngOnInit(): void {
    this.loadEmployees();
  }

  loadEmployees(): void {
    this.employeeService.getAllEmployees().subscribe({
      next: (employees) => {
        this.employees = employees;
        this.employeeOptions = employees.map(emp => ({
          label: `${emp.firstName} ${emp.lastName}`,
          value: emp._id || ''
        }));
        this.cdr.markForCheck();
      },
      error: (error) => {
        console.error('Error loading employees:', error);
      }
    });
  }

  selectAllocationType(type: allocateType) {
    this.selectedAllocationType = type;
    if (!this.shouldShowProcurementPerson()) {
      this.selectedProcurementPerson = null;
    }
    this.procurementPersonError = false;
    this.cdr.markForCheck();
  }

  shouldShowProcurementPerson(): boolean {
    return this.selectedAllocationType === allocateType.SupplyOnly || 
           this.selectedAllocationType === allocateType.ProjectWithSupply;
  }

  onConfirm() {
    if (!this.selectedAllocationType) {
      return;
    }

    if (this.shouldShowProcurementPerson() && !this.selectedProcurementPerson) {
      this.procurementPersonError = true;
      this.cdr.markForCheck();
      return;
    }

    const result: any = {
      allocationType: this.selectedAllocationType,
      id: this.data._id,
      jobId: this.data.jobId
    };

    if (this.shouldShowProcurementPerson()) {
      result.procurementPerson = this.selectedProcurementPerson;
    }

    this.dialogRef.close(result);
  }

  onProcurementPersonChange() {
    if (this.selectedProcurementPerson) {
      this.procurementPersonError = false;
      this.cdr.markForCheck();
    }
  }

  onCancel() {
    this.dialogRef.close();
  }

  getFooterButtons(): any[] {
    return [
      { label: 'Cancel', onClick: this.onCancel.bind(this), theme: 'cancel' },
      { 
        label: 'Confirm Selection', 
        onClick: this.onConfirm.bind(this), 
        theme: 'primary', 
        disabled: !this.selectedAllocationType || (this.shouldShowProcurementPerson() && !this.selectedProcurementPerson)
      }
    ];
  }
}