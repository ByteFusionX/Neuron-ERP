import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActionButtonComponent } from '../action-button/action-button.component';

/**
 * One-line input + submit button. Emits the trimmed text and clears itself; the button stays
 * disabled while the box is empty. Used for a sidebar comment box and an audit-note box alike.
 *
 *   <app-detail-comment-composer placeholder="Comment…" buttonLabel="Send" (submitted)="addComment($event)"></app-detail-comment-composer>
 */
@Component({
  selector: 'app-detail-comment-composer',
  standalone: true,
  imports: [CommonModule, FormsModule, ActionButtonComponent],
  template: `
    <form class="flex gap-2" (ngSubmit)="submit()">
      <input [(ngModel)]="text" name="text" [placeholder]="placeholder" autocomplete="off" class="dpc-input min-w-0 flex-1" />
      <app-action-button [variant]="variant" type="submit" [disabled]="!text.trim()">{{ buttonLabel }}</app-action-button>
    </form>
  `,
  styles: [`
    :host { display: block; }
    .dpc-input { height: 2rem; border-radius: 0.5rem; border: 1px solid #e5e7eb; padding: 0 0.625rem;
      font-size: 0.8125rem; color: #111827; background: #fff; }
    .dpc-input:focus { outline: none; border-color: #7c3aed; box-shadow: 0 0 0 3px rgb(124 58 237 / 0.15); }
    :host-context(html.dark) .dpc-input { border-color: #2e2e2e; background: #141414; color: #ededed; }
  `],
})
export class DetailCommentComposerComponent {
  @Input() placeholder = 'Write a comment…';
  @Input() buttonLabel = 'Send';
  @Input() variant: 'primary' | 'secondary' = 'primary';
  @Output() submitted = new EventEmitter<string>();

  text = '';

  submit(): void {
    const t = this.text.trim();
    if (!t) return;
    this.submitted.emit(t);
    this.text = '';
  }
}
