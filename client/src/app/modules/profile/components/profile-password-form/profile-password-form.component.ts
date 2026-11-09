import { Component, input, model, output } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { SfFieldComponent, SfInputComponent } from 'src/app/shared/components/smart-form';

@Component({
  selector: 'app-profile-password-form',
  templateUrl: './profile-password-form.component.html',
  styleUrls: ['../../profile-shared.css', './profile-password-form.component.css'],
  imports: [ReactiveFormsModule, SfFieldComponent, SfInputComponent, DatePipe],
})
export class ProfilePasswordFormComponent {
  form = input.required<FormGroup>()
  saving = input(false)
  changedAt = input<string | Date | null | undefined>(null)
  open = model(false)
  save = output<void>()

  private get value(): string {
    return this.form().controls['newPassword'].value ?? ''
  }

  /** 0-4 score for the new-password meter. */
  get strength(): number {
    const value = this.value
    if (!value) return 0
    let score = 0
    if (value.length >= 8) score++
    if (value.length >= 12) score++
    if (/[A-Za-z]/.test(value) && /\d/.test(value)) score++
    if (/[^A-Za-z0-9]/.test(value) || (/[a-z]/.test(value) && /[A-Z]/.test(value))) score++
    return score
  }

  get strengthColor(): string {
    const s = this.strength
    return s <= 1 ? 'var(--pf-danger)' : s === 2 ? 'var(--pf-warn)' : 'var(--pf-ok)'
  }

  get strengthLabel(): string {
    return ['', 'Weak', 'Fair', 'Good', 'Strong'][this.strength]
  }

  get rules(): { ok: boolean; label: string }[] {
    const v = this.value
    const confirm = this.form().controls['confirmPassword'].value
    return [
      { ok: v.length >= 8, label: 'At least 8 characters' },
      { ok: /[A-Za-z]/.test(v) && /\d/.test(v), label: 'A letter and a number' },
      { ok: /[^A-Za-z0-9]/.test(v) || (/[a-z]/.test(v) && /[A-Z]/.test(v)), label: 'Symbol or mixed case (stronger)' },
      { ok: !!v && v === confirm, label: 'Passwords match' },
    ]
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
