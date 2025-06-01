import { ChangeDetectionStrategy, Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { CommonModule } from '@angular/common';
import { NgIconComponent } from '@ng-icons/core';
import { getJob } from 'src/app/shared/interfaces/job.interface';
import { IconsModule } from 'src/app/lib/icons/icons.module';

export enum allocateType {
  SupplyOnly = 'Supply Only',
  ProjectWithSupply = 'Project With Supply',
  ProjectsWithOutSupply = 'Projects With Out Supply',
  AMC = 'AMC'
}

@Component({
  selector: 'app-allocate-type-modal',
  imports: [CommonModule, NgIconComponent,IconsModule],
  templateUrl: './allocate-type-modal.component.html',
  styleUrl: './allocate-type-modal.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AllocateTypeModalComponent  {
  allocateTypeEnum = allocateType;
  selectedAllocationType: allocateType | null = null;
  
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

  selectAllocationType(type: allocateType) {
    this.selectedAllocationType = type;
  }

  onConfirm() {
    if (this.selectedAllocationType) {
      this.dialogRef.close({
        allocationType: this.selectedAllocationType,
        id: this.data._id,
        jobId : this.data.jobId
      });
    }
  }

  onCancel() {
    this.dialogRef.close();
  }
}