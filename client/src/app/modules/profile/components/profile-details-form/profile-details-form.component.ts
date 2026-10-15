import { Component, effect, input, output } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { SfFieldComponent, SfInputComponent } from 'src/app/shared/components/smart-form';
import { MyProfile } from 'src/app/shared/interfaces/employee.interface';

@Component({
  selector: 'app-profile-details-form',
  templateUrl: './profile-details-form.component.html',
  styleUrls: ['../../profile-shared.css'],
  imports: [ReactiveFormsModule, SfFieldComponent, SfInputComponent],
  providers: [DatePipe],
})
export class ProfileDetailsFormComponent {
  profile = input.required<MyProfile>()
  form = input.required<FormGroup>()
  saving = input(false)
  save = output<void>()

  // Read-only identity fields, shown through the same field component
  email = new FormControl('')
  dob = new FormControl('')
  employeeId = new FormControl('')

  constructor(datePipe: DatePipe) {
    effect(() => {
      const p = this.profile()
      this.email.setValue(p.email)
      this.dob.setValue(p.dob ? datePipe.transform(p.dob, 'dd MMM yyyy') : '-')
      this.employeeId.setValue(p.employeeId)
    })
  }

  submit() {
    this.form().markAllAsTouched()
    if (this.form().valid) this.save.emit()
  }
}
