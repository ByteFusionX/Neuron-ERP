import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { SelectDropdownComponent } from './select-dropdown.component';

@NgModule({
  declarations: [SelectDropdownComponent],
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  exports: [SelectDropdownComponent]
})
export class SelectDropdownModule {} 