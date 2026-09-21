import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DetailPanelIconComponent } from './detail-panel-icon.component';

/**
 * The panel's square icon button. Exists so consumers outside <app-detail-panel>'s view encapsulation
 * (module templates, tab bodies) get the same affordance without redeclaring `.dp-icon-btn`.
 * Bind (click) on the host — the inner button's click bubbles.
 */
@Component({
  selector: 'app-dp-icon-button',
  standalone: true,
  imports: [CommonModule, DetailPanelIconComponent],
  template: `
    <button type="button" class="dpib" [attr.aria-label]="label" [attr.title]="label" [disabled]="disabled">
      <app-dp-icon [name]="icon" [size]="size"></app-dp-icon>
    </button>
  `,
  styles: [`
    :host { display: inline-flex; }
    .dpib { display: inline-flex; align-items: center; justify-content: center; width: 1.875rem; height: 1.875rem;
      border-radius: 0.5rem; color: #6b7280; transition: background-color 120ms ease, color 120ms ease; }
    .dpib:hover:not(:disabled) { background: #f3f4f6; color: #111827; }
    .dpib:disabled { opacity: 0.45; cursor: default; }
    :host-context(html.dark) .dpib { color: #a1a1a1; }
    :host-context(html.dark) .dpib:hover:not(:disabled) { background: #262626; color: #ededed; }
  `],
})
export class DetailIconButtonComponent {
  @Input() icon = '';
  @Input() label = '';
  @Input() size = 'w-4 h-4';
  @Input() disabled = false;
}
