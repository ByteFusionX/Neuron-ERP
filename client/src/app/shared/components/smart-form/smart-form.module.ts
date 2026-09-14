import { NgModule } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { SfCheckboxGroupComponent } from './sf-checkbox-group.component';
import { SfCheckboxComponent } from './sf-checkbox.component';
import { SfComboboxComponent } from './sf-combobox.component';
import { SfCurrencyComponent } from './sf-currency.component';
import { SfDateComponent } from './sf-date.component';
import { SfDraftDirective } from './sf-draft.directive';
import { SfDrawerComponent } from './sf-drawer.component';
import { SfFieldComponent } from './sf-field.component';
import { SfFileComponent } from './sf-file.component';
import { SfInputComponent } from './sf-input.component';
import { SfNumberComponent } from './sf-number.component';
import { SfRadioGroupComponent } from './sf-radio-group.component';
import { SfSectionComponent } from './sf-section.component';
import { SfSelectComponent } from './sf-select.component';
import { SfSliderComponent } from './sf-slider.component';
import { SfSwitchComponent } from './sf-switch.component';
import { SfTagsComponent } from './sf-tags.component';
import { SfTextareaComponent } from './sf-textarea.component';

const SMART_FORM = [
  SfDrawerComponent, SfSectionComponent, SfFieldComponent, SfDraftDirective,
  SfInputComponent, SfTextareaComponent, SfNumberComponent, SfCurrencyComponent, SfDateComponent,
  SfSelectComponent, SfComboboxComponent, SfCheckboxComponent, SfCheckboxGroupComponent, SfSwitchComponent,
  SfRadioGroupComponent, SfSliderComponent, SfTagsComponent, SfFileComponent,
];

/** Every control is standalone; import this module to get all of them plus ReactiveFormsModule. */
@NgModule({
  imports: SMART_FORM,
  exports: [ReactiveFormsModule, ...SMART_FORM],
})
export class SmartFormModule {}
