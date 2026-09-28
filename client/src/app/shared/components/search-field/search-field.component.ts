import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IconsModule } from 'src/app/lib/icons/icons.module';

@Component({
  selector: 'app-search-field',
  standalone: true,
  imports: [CommonModule, FormsModule, IconsModule],
  templateUrl: './search-field.component.html',
})
export class SearchFieldComponent {
  @Input() value: string = '';
  @Input() placeholder: string = 'Search...';
  @Input() size: 'sm' | 'md' = 'sm';
  @Output() valueChange = new EventEmitter<string>();

  onInput(value: string): void {
    this.value = value;
    this.valueChange.emit(this.value);
  }

  clear(): void {
    this.value = '';
    this.valueChange.emit(this.value);
  }
}
