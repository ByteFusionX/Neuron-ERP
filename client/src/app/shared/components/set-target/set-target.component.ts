import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { Target } from '../../interfaces/employee.interface';
import { NgIconComponent } from '@ng-icons/core';
import { rangeValidator } from '../../validators/target-rage.validator';


@Component({
    selector: 'app-set-target',
    templateUrl: './set-target.component.html',
    styleUrls: ['./set-target.component.css'],
    imports: [CommonModule, FormsModule, NgIconComponent, ReactiveFormsModule]
})

export class SetTargetComponent {
  submitted: boolean = false;

  targetForm = this._fb.group({
    year: ['', [Validators.required]],
    salesRevenue: this._fb.group({
      targetValue: ['', Validators.required],
      criticalRange: ['', Validators.required],
      moderateRange: ['', Validators.required],
    }),
    grossProfit: this._fb.group({
      targetValue: ['', Validators.required],
      criticalRange: ['', Validators.required],
      moderateRange: ['', Validators.required],
    })
  }, { validators: rangeValidator() });

  constructor(
    private dialogRef: MatDialogRef<SetTargetComponent>,
    @Inject(MAT_DIALOG_DATA) public data: Target,
    private _fb: FormBuilder
  ) { }

  ngOnInit() {

    if (this.data) {
      this.targetForm.patchValue({
        year: this.data.year.toString(),
        salesRevenue: {
          targetValue: this.data.salesRevenue.targetValue.toString(),
          criticalRange: this.data.salesRevenue.criticalRange.toString(),
          moderateRange: this.data.salesRevenue.moderateRange.toString(),
        },
        grossProfit: {
          targetValue: this.data.grossProfit.targetValue.toString(),
          criticalRange: this.data.grossProfit.criticalRange.toString(),
          moderateRange: this.data.grossProfit.moderateRange.toString(),
        },
      })
    }
  }

  submit() {
    this.submitted = true
    if (this.targetForm.valid) {
      this.dialogRef.close(this.targetForm.value);
    }
  }

  cancel() {
    this.dialogRef.close();
  }
}
