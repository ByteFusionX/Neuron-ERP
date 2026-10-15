import { Component, effect, input, output } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { SfComboboxComponent, SfFieldComponent, SfOption, SfSelectComponent } from 'src/app/shared/components/smart-form';

const toOptions = (values: string[]): SfOption<string>[] => values.map(v => ({ value: v, label: v }));

@Component({
  selector: 'app-profile-preferences-form',
  templateUrl: './profile-preferences-form.component.html',
  styleUrls: ['../../profile-shared.css'],
  imports: [ReactiveFormsModule, SfFieldComponent, SfSelectComponent, SfComboboxComponent],
})
export class ProfilePreferencesFormComponent {
  form = input.required<FormGroup>()
  saving = input(false)
  save = output<void>()
  /** Read-only while preference updates are unavailable. */
  readOnly = input(true)

  constructor() {
    effect(() => {
      const form = this.form()
      if (this.readOnly()) form.disable({ emitEvent: false })
      else form.enable({ emitEvent: false })
    })
  }

  readonly landingPages: SfOption<string>[] = [
    { value: '/home', label: 'Home' },
    { value: '/dashboard', label: 'Dashboard' },
  ]
  readonly dateFormats = toOptions(['dd-MM-yyyy', 'MM-dd-yyyy', 'yyyy-MM-dd', 'dd MMM yyyy'])
  readonly timezones = toOptions((Intl as any).supportedValuesOf?.('timeZone') ?? [])
}
