import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-action-button',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <!-- a single <ng-content> can only project into one place, so both variants render it via this template -->
    <ng-template #label><ng-content></ng-content></ng-template>
    <a *ngIf="link; else btn" [routerLink]="link" class="btn" [ngClass]="'btn-' + variant"><ng-container *ngTemplateOutlet="label"></ng-container></a>
    <ng-template #btn>
      <button [type]="type" [attr.form]="form || null" class="btn" [ngClass]="'btn-' + variant" [disabled]="disabled">
        <ng-container *ngTemplateOutlet="label"></ng-container>
      </button>
    </ng-template>
  `,
  styles: [`
    :host { display: inline-flex; }
    .btn {
      display: inline-flex; align-items: center; gap: 0.375rem; height: 2rem; padding: 0 0.75rem;
      font-size: 0.75rem; font-weight: 500; border-radius: 0.5rem; white-space: nowrap;
      border: 1px solid transparent; transition: background-color 120ms ease;
    }
    .btn:disabled { opacity: 0.6; cursor: default; }

    .btn-ghost { height: auto; padding: 0; font-size: 0.75rem; color: #6b7280; background: transparent; }
    .btn-ghost:hover:not(:disabled) { color: #7c3aed; }
    :host-context(html.dark) .btn-ghost { color: #a3a3a3; }

    .btn-tool { color: #374151; background: #fff; border-color: #e5e7eb; }
    .btn-tool:hover:not(:disabled) { background: #f9fafb; }
    :host-context(html.dark) .btn-tool { color: #d4d4d4; background: #111111; border-color: #262626; }
    :host-context(html.dark) .btn-tool:hover:not(:disabled) { background: #1a1a1a; }

    .btn-primary { color: #fff; background: #7c3aed; border-color: #7c3aed; }
    .btn-primary:hover:not(:disabled) { background: #6d28d9; }

    .btn-secondary { color: #374151; background: #fff; border-color: #e5e7eb; }
    .btn-secondary:hover:not(:disabled) { background: #f9fafb; }
    :host-context(html.dark) .btn-secondary { color: #d4d4d4; background: #1a1a1a; border-color: #262626; }
    :host-context(html.dark) .btn-secondary:hover:not(:disabled) { background: #262626; }
  `],
})
export class ActionButtonComponent {
  @Input() variant: 'primary' | 'secondary' | 'tool' | 'ghost' = 'secondary';
  @Input() type: 'button' | 'submit' = 'button';
  @Input() form = '';
  @Input() disabled = false;
  /** When set, renders a routerLink anchor instead of a button. */
  @Input() link: any[] | string | null = null;
}
