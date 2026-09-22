import { Component, EventEmitter, Input, Output } from '@angular/core';
import { NgIf } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { SfOption, SmartFormModule } from 'src/app/shared/components/smart-form';

/** Inline employee combobox + Cancel/Confirm row, used for the Share and Transfer detail-panel tabs. */
@Component({
  selector: 'app-customer-picker-panel',
  standalone: true,
  imports: [NgIf, ReactiveFormsModule, SmartFormModule, ActionButtonComponent],
  template: `
    <div class="rounded-lg border border-violet-200 bg-violet-50/50 p-3 dark:border-violet-900 dark:bg-violet-950/20">
      <app-sf-field [label]="label">
        <app-sf-combobox [formControl]="control" [multiple]="multiple" [options]="options"
          [placeholder]="loading ? 'Loading employees…' : placeholder"></app-sf-combobox>
      </app-sf-field>
      <p *ngIf="hint" class="mt-2 text-xs text-amber-700 dark:text-amber-400">{{ hint }}</p>
      <div class="mt-3 flex justify-end gap-2">
        <app-action-button variant="secondary" (click)="cancel.emit()">Cancel</app-action-button>
        <app-action-button variant="primary" [disabled]="saving || !hasValue()" (click)="confirm.emit()">
          {{ saving ? savingLabel : confirmLabel }}
        </app-action-button>
      </div>
    </div>
  `,
})
export class CustomerPickerPanelComponent {
  @Input({ required: true }) label = '';
  @Input({ required: true }) control!: FormControl<any>;
  @Input() options: SfOption[] = [];
  @Input() multiple = false;
  @Input() loading = false;
  @Input() saving = false;
  @Input() placeholder = 'Select an employee';
  @Input() confirmLabel = 'Confirm';
  @Input() savingLabel = 'Saving…';
  @Input() hint = '';
  @Output() cancel = new EventEmitter<void>();
  @Output() confirm = new EventEmitter<void>();

  hasValue(): boolean {
    const v = this.control.value;
    return Array.isArray(v) ? v.length > 0 : !!v;
  }
}
