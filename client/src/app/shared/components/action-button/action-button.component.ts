import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-action-button',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <!-- a single <ng-content> can only project into one place, so both variants render it via this template -->
    <ng-template #label>
      <svg *ngIf="icon" class="btn-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" [ngSwitch]="icon">
        <path *ngSwitchCase="'plus'" d="M8 3v10M3 8h10" />
        <path *ngSwitchCase="'edit'" d="M11 2.5l2.5 2.5L5.5 13H3v-2.5L11 2.5z" />
        <path *ngSwitchCase="'download'" d="M8 2.5v8M4.5 7.5L8 11l3.5-3.5M2.5 13.5h11" />
        <path *ngSwitchCase="'upload'" d="M8 10.5v-8M4.5 6L8 2.5 11.5 6M2.5 13.5h11" />
        <g *ngSwitchCase="'withdraw'"><circle cx="8" cy="8" r="5.5" /><path d="M5.5 5.5l5 5M10.5 5.5l-5 5" /></g>
        <g *ngSwitchCase="'view'"><path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" /><circle cx="8" cy="8" r="2" /></g>
      </svg>
      <ng-content></ng-content>
    </ng-template>
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

    .btn-icon { width: 0.875rem; height: 0.875rem; flex-shrink: 0; }

    /* Optional, tab-specific footer actions: outlined, never filled. */
    .btn-outline { color: #374151; background: transparent; border-color: #d1d5db; }
    .btn-outline:hover:not(:disabled) { background: #f9fafb; }
    :host-context(html.dark) .btn-outline { color: #d4d4d4; border-color: #3f3f46; }
    :host-context(html.dark) .btn-outline:hover:not(:disabled) { background: #1a1a1a; }

    /* Reversing actions such as revoking an approval. */
    .btn-warning { color: #fff; background: #f97316; border-color: #f97316; }
    .btn-warning:hover:not(:disabled) { background: #ea580c; border-color: #ea580c; }

    .btn-secondary { color: #374151; background: #fff; border-color: #e5e7eb; }
    .btn-secondary:hover:not(:disabled) { background: #f9fafb; }
    :host-context(html.dark) .btn-secondary { color: #d4d4d4; background: #1a1a1a; border-color: #262626; }
    :host-context(html.dark) .btn-secondary:hover:not(:disabled) { background: #262626; }
  `],
})
export class ActionButtonComponent {
  @Input() variant: 'primary' | 'secondary' | 'tool' | 'ghost' | 'outline' | 'warning' = 'secondary';
  /** Optional leading icon. */
  @Input() icon: 'plus' | 'edit' | 'view' | 'download' | 'upload' | 'withdraw' | null = null;
  @Input() type: 'button' | 'submit' = 'button';
  @Input() form = '';
  @Input() disabled = false;
  /** When set, renders a routerLink anchor instead of a button. */
  @Input() link: any[] | string | null = null;
}
