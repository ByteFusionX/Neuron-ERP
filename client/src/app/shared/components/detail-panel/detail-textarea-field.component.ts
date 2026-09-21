import { Component, ElementRef, EventEmitter, Input, Output, ViewChild, booleanAttribute } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DetailPanelIconComponent } from './detail-panel-icon.component';

/**
 * Click-to-edit multi-line text value for detail panels. Shows the full text (wrapped, newlines kept);
 * clicking swaps it for an auto-growing textarea. Ctrl/Cmd+Enter or blur saves, Escape cancels, Enter
 * inserts a newline. Emits `save` only when the text actually changed.
 *
 *   <app-detail-textarea-field [value]="row.subject" (save)="update(row, $event)"></app-detail-textarea-field>
 *
 * Standalone value editor, not a label/value row: wrap it in <app-detail-field> for the label.
 */
@Component({
  selector: 'app-detail-textarea-field',
  standalone: true,
  imports: [CommonModule, FormsModule, DetailPanelIconComponent],
  template: `
    <textarea *ngIf="editing; else display" #ta class="dtf-input" [(ngModel)]="draft" [rows]="minRows"
      [attr.aria-label]="'Edit ' + ariaLabel" (input)="autosize()" (blur)="commit()"
      (keydown.escape)="cancel($event)" (keydown.control.enter)="commit()" (keydown.meta.enter)="commit()"></textarea>
    <ng-template #display>
      <button *ngIf="editable; else readOnly" type="button" class="dtf-value group/dtf" (click)="start()"
        [attr.aria-label]="'Edit ' + ariaLabel">
        <span class="dtf-text">{{ value || '—' }}</span>
        <app-dp-icon name="note" size="w-3.5 h-3.5" class="mt-0.5 shrink-0 text-gray-400 dark:text-gray-500 opacity-0 group-hover/dtf:opacity-100"></app-dp-icon>
      </button>
      <ng-template #readOnly><span class="dtf-text">{{ value || '—' }}</span></ng-template>
    </ng-template>
  `,
  styles: [`
    :host { display: block; min-width: 0; width: 100%; }
    .dtf-text { flex: 1; min-width: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
    .dtf-value { display: flex; align-items: flex-start; gap: 0.5rem; width: calc(100% + 0.75rem); min-height: 1.875rem;
      margin: -0.25rem -0.375rem; padding: 0.25rem 0.375rem; border-radius: 0.375rem; text-align: left;
      transition: background-color 120ms ease; }
    .dtf-value:focus-visible { background: #f3f4f6; outline: none; }
    .dtf-input { display: block; width: 100%; padding: 0.375rem 0.5rem; font: inherit; line-height: 1.4; resize: vertical;
      border: 1px solid #7c3aed; border-radius: 0.375rem; outline: none; box-shadow: 0 0 0 3px rgb(124 58 237 / 0.15);
      background: #fff; overflow: hidden; }
    :host-context(html.dark) .dtf-value:focus-visible { background: #262626; }
    :host-context(html.dark) .dtf-input { background: #1a1a1a; color: #ededed; }
  `],
})
export class DetailTextareaFieldComponent {
  @Input() value: string | null | undefined = '';
  @Input({ transform: booleanAttribute }) editable = true;
  /** Rows shown before the text grows the box. */
  @Input() minRows = 3;
  /** Used for the accessible label ("Edit Description"). */
  @Input() ariaLabel = 'value';
  @Output() save = new EventEmitter<string>();

  @ViewChild('ta') set textarea(el: ElementRef<HTMLTextAreaElement> | undefined) {
    this.taEl = el?.nativeElement;
    if (this.taEl && this.justStarted) {
      this.justStarted = false;
      this.taEl.focus();
      this.taEl.setSelectionRange(this.taEl.value.length, this.taEl.value.length);
      this.autosize();
    }
  }

  editing = false;
  draft = '';
  private taEl?: HTMLTextAreaElement;
  private justStarted = false;

  start(): void {
    this.draft = this.value ?? '';
    this.justStarted = true;
    this.editing = true;
  }

  commit(): void {
    if (!this.editing) return;
    this.editing = false;
    const next = this.draft.trim();
    if (next !== (this.value ?? '').trim()) this.save.emit(next);
  }

  cancel(event: Event): void {
    event.stopPropagation();
    this.editing = false;
  }

  autosize(): void {
    const el = this.taEl;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 2 + 'px';
  }
}
