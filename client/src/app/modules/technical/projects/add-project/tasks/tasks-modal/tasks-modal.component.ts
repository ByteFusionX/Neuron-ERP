import { Component, Inject, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, FormGroup, FormArray, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { CommonModule } from '@angular/common';
import { TechnicalService } from 'src/app/core/services/technical.service';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { getEmployee } from 'src/app/shared/interfaces/employee.interface';
import { NgIconComponent } from '@ng-icons/core';
import { ModalLayoutComponent } from 'src/app/shared/components/modal-layout/modal-layout.component';

@Component({
  selector: 'app-tasks-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, NgIconComponent, ModalLayoutComponent],
  templateUrl: './tasks-modal.component.html',
  styleUrl: './tasks-modal.component.css',
})
export class TasksModalComponent implements OnInit {
  private fb = inject(FormBuilder);
  private technicalService = inject(TechnicalService);
  private employeeService = inject(EmployeeService);
  public dialogRef = inject(MatDialogRef<TasksModalComponent>);
  public data = inject(MAT_DIALOG_DATA, { optional: true });

  employees = signal<getEmployee[]>([]);
  isEditMode = signal<boolean>(false);
  isSaving = signal<boolean>(false);
  isSubmitted = signal<boolean>(false);

  taskForm: FormGroup = this.fb.group({
    taskName: ['', Validators.required],
    description: ['', Validators.required],
    status: ['Pending', Validators.required],
    priority: ['Medium', Validators.required],
    timeline: this.fb.group({
      expectedStartDate: ['', Validators.required],
      expectedEndDate: ['', Validators.required],
      expectedDuration: [0, [Validators.required, Validators.min(0)]],
    }),
    progress: [0, [Validators.required, Validators.min(0), Validators.max(100)]],
    notes: [''],
    associatedTeam: this.fb.array([]),
  });

  get associatedTeamArray(): FormArray {
    return this.taskForm.get('associatedTeam') as FormArray;
  }

  get timelineGroup(): FormGroup {
    return this.taskForm.get('timeline') as FormGroup;
  }

  ngOnInit(): void {
    this.employeeService.getAllEmployees().subscribe((employees) => {
      this.employees.set(employees);
    });
    if (this.data && this.data.task) {
      this.isEditMode.set(true);
      this.populateForm(this.data.task);
    }else if(this.data && this.data.status){
      this.taskForm.patchValue({
        status: this.data.status,
      });
    } else {
      this.addTeamMember();
    }
  }

  populateForm(task: any): void {
    this.taskForm.patchValue({
      taskName: task.taskName,
      description: task.description,
      status: task.status,
      priority: task.priority,
      timeline: {
        expectedStartDate: task.timeline?.expectedStartDate ? task.timeline.expectedStartDate.split('T')[0] : '',
        expectedEndDate: task.timeline?.expectedEndDate ? task.timeline.expectedEndDate.split('T')[0] : '',
        expectedDuration: task.timeline?.expectedDuration || 0,
      },
      progress: task.progress || 0,
      notes: task.notes || '',
    });
    this.associatedTeamArray.clear();
    if (task.associatedWith && Array.isArray(task.associatedWith)) {
      task.associatedWith.forEach((employee: any) => {
        this.associatedTeamArray.push(this.createTeamMemberGroup(employee._id));
      });
      console.log(this.taskForm.value,'reached here');
    } else {
      this.addTeamMember();
    }
    console.log(this.taskForm.value);
  }

  createTeamMemberGroup(employeeId?: any): FormGroup {
    return this.fb.group({
      employee: [employeeId ? String(employeeId) : '', Validators.required],
    });
  }

  addTeamMember(): void {
    this.associatedTeamArray.push(this.createTeamMemberGroup());
  }

  removeTeamMember(index: number): void {
    if (this.associatedTeamArray.length > 1) {
      this.associatedTeamArray.removeAt(index);
    }
  }

  onSubmit(): void {
    this.isSubmitted.set(true);
    if (this.taskForm.invalid) return;
    this.isSaving.set(true);
    const formValue = this.taskForm.value;
    const payload = {
      taskName: formValue.taskName,
      description: formValue.description,
      status: formValue.status,
      priority: formValue.priority,
      timeline: {
        expectedStartDate: formValue.timeline.expectedStartDate,
        expectedEndDate: formValue.timeline.expectedEndDate,
        expectedDuration: formValue.timeline.expectedDuration,
      },
      progress: formValue.progress,
      notes: formValue.notes,
      associatedWith: formValue.associatedTeam.map((member: any) => {
        return member.employee
      }),
    };
    if (this.isEditMode()) {
      this.technicalService.updateTask(this.data.projectId, this.data.taskId, payload).subscribe({
        next: (res) => {
          this.isSaving.set(false);
          this.dialogRef.close(true);
        },
        error: () => {
          this.isSaving.set(false);
        },
      });
    } else {
      this.technicalService.createTask(this.data.projectId, payload).subscribe({
        next: (res) => {
          this.isSaving.set(false);
          this.dialogRef.close(true);
        },
        error: () => {
          this.isSaving.set(false);
        },
      });
    }
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  getEmployeeDesignation(employeeId: string): string {
    const emp = this.employees().find(e => e._id === employeeId);
    return emp ? emp.designation : '';
  }
}
