import { Component, input, model, output } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { SfFieldComponent, SfInputComponent } from 'src/app/shared/components/smart-form';

@Component({
  selector: 'app-profile-password-form',
  templateUrl: './profile-password-form.component.html',
  styleUrls: ['../../profile-shared.css', './profile-password-form.component.css'],
  imports: [ReactiveFormsModule, SfFieldComponent, SfInputComponent],
})
export class ProfilePasswordFormComponent {
  form = input.required<FormGroup>()
  saving = input(false)
  open = model(false)
  save = output<void>()

  /** 0-4 score for the new-password meter. */
  get strength(): number {
    const value: string = this.form().controls['newPassword'].value
    if (!value) return 0
    let score = 0
    if (value.length >= 8) score++
    if (value.length >= 12) score++
    if (/[A-Za-z]/.test(value) && /\d/.test(value)) score++
    if (/[^A-Za-z0-9]/.test(value) || (/[a-z]/.test(value) && /[A-Z]/.test(value))) score++
    return score
  }

  submit() {
    this.form().markAllAsTouched()
    if (this.form().valid) this.save.emit()
  }

  cancel() {
    this.open.set(false)
    this.form().reset()
  }
}
