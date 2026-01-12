import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { CommonModule } from '@angular/common';
import { NgIcon } from '@ng-icons/core';

@Component({
  selector: 'app-view-employees',
  standalone: true,
  imports: [CommonModule, NgIcon],
  templateUrl: './view-employees.component.html',
  styleUrl: './view-employees.component.css'
})
export class ViewEmployeesComponent {
  constructor(
    private dialogRef: MatDialogRef<ViewEmployeesComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { employees: any[] }
  ) { }

  onClose() {
    this.dialogRef.close();
  }
}
