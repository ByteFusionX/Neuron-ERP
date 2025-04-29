import { CommonModule } from '@angular/common';
import { Component , Input} from '@angular/core';
import { AbstractControl } from '@angular/forms';

@Component({
  selector: 'app-form-field',
  imports: [CommonModule],
  templateUrl: './form-field.component.html',
  styleUrl: './form-field.component.css',
})
export class FormFieldComponent {
  @Input() label = '';
  @Input() control: AbstractControl | null = null;
  @Input() isSubmitted = false;
  @Input() type = 'text';
  @Input() placeholder = '';
  @Input() id = '';

  ngOnInit() {
    if (!this.id) {
      this.id = this.label.toLowerCase().replace(/\s+/g, '-');
    }
  }

  onInputChange(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    if (this.control) {
      this.control.setValue(value);
      this.control.markAsTouched();
    }
  }
}