import { Component, ElementRef, Input, ViewChild, booleanAttribute, forwardRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NG_VALUE_ACCESSOR } from '@angular/forms';
import { SfControl } from './sf-control';
import { SF_STYLES } from './sf.model';

@Component({
  selector: 'app-sf-textarea',
  standalone: true,
  imports: [CommonModule],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => SfTextareaComponent), multi: true }],
  template: `
    <div class="relative">
    <!-- Floating format bar: shows while the box is focused. Pointer-down is cancelled so the selection and focus survive the click. -->
    <div *ngIf="richText && focused && !disabled && !readonly" (pointerdown)="$event.preventDefault()" (mousedown)="$event.preventDefault()"
      class="absolute -top-8 right-0 z-20 flex items-center gap-0.5 rounded-lg border border-gray-200 bg-white p-0.5 shadow-md dark:border-gray-700 dark:bg-gray-900">
      <button type="button" tabindex="-1" (click)="wrap(ta, '**', '**'); markFormats(ta)" title="Bold (Ctrl+Shift+B)" aria-label="Bold" [attr.aria-pressed]="boldOn"
        [ngClass]="boldOn ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300' : 'text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800'"
        class="flex h-6 w-6 items-center justify-center rounded-md text-[13px] font-bold">B</button>
      <button type="button" tabindex="-1" (click)="wrap(ta, '{', '}'); markFormats(ta)" title="Highlight (Ctrl+Shift+H)" aria-label="Highlight" [attr.aria-pressed]="hlOn"
        [ngClass]="hlOn ? 'bg-violet-100 dark:bg-violet-900/50' : 'hover:bg-gray-100 dark:hover:bg-gray-800'"
        class="flex h-6 w-6 flex-col items-center justify-center rounded-md">
        <span class="text-[12px] font-semibold leading-none text-gray-700 dark:text-gray-200">H</span>
        <span class="mt-0.5 h-[3px] w-3.5 rounded-full bg-orange-500"></span>
      </button>
    </div>
    <textarea #ta class="sf-input block py-2 leading-5" (select)="markFormats(ta)" (keyup)="markFormats(ta)" (mouseup)="markFormats(ta)" [style.resize]="autoresize ? 'none' : 'vertical'" [style.padding]="richText ? '0.5rem 0.75rem' : null" [style.line-height]="richText ? '1.25rem' : null"
      [style.color]="richText ? 'transparent' : null" [style.caret-color]="richText ? '#7c3aed' : null" (scroll)="syncScroll(ta)" (click)="syncScroll(ta)"
      [id]="inputId" [rows]="rows" [value]="value ?? ''" [placeholder]="placeholder" [disabled]="disabled" [readOnly]="readonly"
      [attr.maxlength]="maxlength" (input)="duplicateNotice = ''; update(ta.value); resize(ta); fit(ta)" (focus)="focused = true; fit(ta); markFormats(ta)" (blur)="focused = false; touch(); collapse(ta)"
      (keydown)="onFormatKey($event, ta)"
      (keydown.enter)="onEnter($event, ta)"></textarea>
    <!-- Live preview drawn over the transparent textarea text: bold and orange show while typing; the ** and { } markers stay faint so offsets match. -->
    <div *ngIf="richText" aria-hidden="true" class="pointer-events-none absolute inset-0 overflow-hidden rounded-lg border border-transparent px-3 py-2 text-[0.8125rem] leading-5 text-gray-700 dark:text-gray-200">
      <div class="whitespace-pre-wrap break-words" [style.transform]="'translateY(' + -scroll + 'px)'"><ng-container *ngFor="let s of segments"><span [style.opacity]="s.marker ? 0.35 : null" [style.color]="s.hl && !s.marker ? '#f97316' : null" [style.text-shadow]="s.bold && !s.marker ? '0.45px 0 0 currentColor, -0.45px 0 0 currentColor' : null">{{ s.text }}</span></ng-container><span>&#8203;</span></div>
    </div>
    </div>
    <p *ngIf="duplicateNotice" class="mt-1 text-xs text-red-600 dark:text-red-400">{{ duplicateNotice }}</p>
    <p *ngIf="maxlength" class="mt-1 text-right text-[11px] tabular-nums"
      [ngClass]="(value?.length || 0) >= maxlength ? 'text-red-600 dark:text-red-400' : 'text-gray-400 dark:text-gray-500'">{{ value?.length || 0 }} / {{ maxlength }}</p>
  `,
  styles: [SF_STYLES],
})
export class SfTextareaComponent extends SfControl<string> {
  @Input() rows = 3;
  @Input() maxlength: number | null = null;
  @Input({ transform: booleanAttribute }) autoresize = false;
  @Input({ transform: booleanAttribute }) noEnter = false;
  @Input({ transform: booleanAttribute }) commaOnEnter = false;
  duplicateNotice = '';

  /** Enter continues the list with a "*   " bullet; Enter on an empty bullet ends it. */
  @Input({ transform: booleanAttribute }) bullets = false;

  /** Shows a Bold / Highlight bar and Ctrl+Shift+B / Ctrl+Shift+H; they wrap the selection in the `**bold**` and `{highlight}` markers. */
  @Input({ transform: booleanAttribute }) richText = false;
  focused = false;
  scroll = 0;
  boldOn = false;
  hlOn = false;
  @ViewChild('ta') private taRef?: ElementRef<HTMLTextAreaElement>;

  /** Lights the Bold / Highlight buttons when the selection (or caret) sits inside, or covers, a ** ** / { } pair. */
  markFormats(ta: HTMLTextAreaElement): void {
    const v = ta.value;
    const a = ta.selectionStart ?? 0, b = ta.selectionEnd ?? 0;
    // Bold and highlight are scanned separately so one nested in the other is still seen.
    const inside = (open: string, close: string): boolean => {
      for (let i = v.indexOf(open); i >= 0; ) {
        const end = v.indexOf(close, i + open.length);
        if (end < 0) return false;
        if (a >= i && b <= end + close.length && (a !== b || (a > i && a < end + close.length))) return true;
        i = v.indexOf(open, end + close.length);
      }
      return false;
    };
    const bold = inside('**', '**'), hl = inside('{', '}');
    this.boldOn = bold;
    this.hlOn = hl;
  }

  /** Text written from outside (e.g. Brand / Part no lines) changes the height and scroll; resync so the caret lines up with the drawn text. */
  protected override valueWritten(): void {
    queueMicrotask(() => {
      const ta = this.taRef?.nativeElement;
      if (!ta) return;
      if (this.focused) this.fit(ta);
      this.scroll = ta.scrollTop;
      this.cdr.markForCheck();
    });
  }

  private segKey: string | null = null;
  private segCache: { text: string; bold: boolean; hl: boolean; marker: boolean }[] = [];

  /** Splits the text into styled runs for the preview layer; markers keep their characters so positions line up. */
  get segments() {
    const v = this.value ?? '';
    if (v === this.segKey) return this.segCache;
    const out: { text: string; bold: boolean; hl: boolean; marker: boolean }[] = [];
    let bold = false, hl = false, buf = '';
    const flush = () => { if (buf) out.push({ text: buf, bold, hl, marker: false }); buf = ''; };
    for (let i = 0; i < v.length; i++) {
      if (v.startsWith('**', i) && (bold || v.indexOf('**', i + 2) > -1)) {
        flush(); out.push({ text: '**', bold, hl, marker: true }); bold = !bold; i++;
      } else if (v[i] === '{' && !hl && v.indexOf('}', i) > -1) {
        flush(); out.push({ text: '{', bold, hl, marker: true }); hl = true;
      } else if (v[i] === '}' && hl) {
        flush(); out.push({ text: '}', bold, hl, marker: true }); hl = false;
      } else buf += v[i];
    }
    flush();
    this.segKey = v;
    return (this.segCache = out);
  }

  syncScroll(ta: HTMLTextAreaElement): void { this.scroll = ta.scrollTop; }

  onFormatKey(event: KeyboardEvent, ta: HTMLTextAreaElement): void {
    if (!this.richText || !(event.ctrlKey || event.metaKey) || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === 'b' && event.shiftKey) {
      event.preventDefault();
      this.wrap(ta, '**', '**');
    } else if (key === 'h' && event.shiftKey) {
      event.preventDefault();
      this.wrap(ta, '{', '}');
    }
  }

  /** Toggles a marker pair around the selection (or drops an empty pair at the caret). */
  wrap(ta: HTMLTextAreaElement, open: string, close: string): void {
    ta.focus();
    const value = ta.value;
    let start = ta.selectionStart ?? 0;
    let end = ta.selectionEnd ?? 0;

    // Selection includes the markers, or sits just inside them: remove them.
    const inner = value.substring(start, end);
    if (inner.length >= open.length + close.length && inner.startsWith(open) && inner.endsWith(close)) {
      this.replace(ta, start, end, inner.slice(open.length, inner.length - close.length), start, end - open.length - close.length);
      return;
    }
    if (value.substring(start - open.length, start) === open && value.substring(end, end + close.length) === close) {
      this.replace(ta, start - open.length, end + close.length, inner, start - open.length, end - open.length);
      return;
    }

    // Bare caret inside a word: wrap the whole word.
    if (start === end) {
      while (start > 0 && /\S/.test(value[start - 1])) start--;
      while (end < value.length && /\S/.test(value[end])) end++;
    }
    const text = value.substring(start, end);
    if (!text) {
      this.replace(ta, start, end, open + close, start + open.length, start + open.length);
      return;
    }
    this.replace(ta, start, end, open + text + close, start + open.length, start + open.length + text.length);
  }

  private replace(ta: HTMLTextAreaElement, from: number, to: number, text: string, selStart: number, selEnd: number): void {
    ta.setSelectionRange(from, to);
    // insertText keeps the browser's undo stack, so Ctrl+Z undoes a format click.
    const done = document.execCommand?.('insertText', false, text);
    if (!done) {
      ta.setRangeText(text, from, to, 'end');
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }
    ta.setSelectionRange(selStart, selEnd);
  }

  onEnter(event: Event, ta: HTMLTextAreaElement): void {
    if (this.commaOnEnter) {
      this.onCommaEnter(event, ta);
      return;
    }
    if (this.noEnter) event.preventDefault();
    if (this.bullets) this.onBulletEnter(event, ta);
  }

  private onCommaEnter(event: Event, ta: HTMLTextAreaElement): void {
    event.preventDefault();
    const value = ta.value;
    const start = ta.selectionStart ?? value.length;
    const end = ta.selectionEnd ?? value.length;
    const before = value.substring(0, start).trimEnd();
    const after = value.substring(end).trimStart();

    if (!before || /[,;]\s*$/.test(before)) return;

    // The scan just typed is the last token before the cursor; reject it if it is already in the list.
    const sep = Math.max(before.lastIndexOf(','), before.lastIndexOf(';'), before.lastIndexOf('\n'));
    const scanned = before.substring(sep + 1).trim();
    const others = `${before.substring(0, sep + 1)},${after}`
      .split(/[\n,;]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
    if (scanned && others.includes(scanned.toLowerCase())) {
      const kept = before.substring(0, sep + 1).replace(/\s+$/, '');
      const keptText = kept ? (/[,;]$/.test(kept) ? `${kept} ` : `${kept}, `) : '';
      const nextVal = `${keptText}${after}`;
      ta.value = nextVal;
      ta.selectionStart = ta.selectionEnd = keptText.length;
      this.duplicateNotice = `"${scanned}" is already added`;
      this.update(nextVal);
      this.fit(ta);
      return;
    }
    this.duplicateNotice = '';

    const next = `${before}, ${after}`;
    const position = before.length + 2;
    ta.value = next;
    ta.selectionStart = ta.selectionEnd = position;
    this.update(next);
    this.fit(ta);
  }

  onBulletEnter(event: Event, ta: HTMLTextAreaElement): void {
    event.preventDefault();
    const value = ta.value;
    const start = ta.selectionStart ?? value.length;
    const end = ta.selectionEnd ?? value.length;
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const line = value.substring(lineStart, start);
    const bullet = line.match(/^\*\s+(.*)$/);
    let next: string;
    let pos: number;
    if (bullet && bullet[1].trim() === '') {
      next = value.substring(0, lineStart) + value.substring(start);
      pos = lineStart;
    } else if (line.trim() === '') {
      next = value.substring(0, start) + '\n' + value.substring(end);
      pos = start + 1;
    } else {
      const insert = '\n*   ';
      next = value.substring(0, start) + insert + value.substring(end);
      pos = start + insert.length;
    }
    ta.value = next;
    ta.selectionStart = ta.selectionEnd = pos;
    this.update(next);
  }

  /** Clicking in grows the box to show every line; leaving it returns to `rows`. */
  @Input({ transform: booleanAttribute }) expandOnFocus = false;

  fit(ta: HTMLTextAreaElement): void {
    if (!this.expandOnFocus) return;
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight + 2}px`;
  }

  collapse(ta: HTMLTextAreaElement): void {
    if (this.expandOnFocus) ta.style.height = '';
  }

  resize(ta: HTMLTextAreaElement): void {
    if (!this.autoresize) return;
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight + 2}px`;
  }
}
