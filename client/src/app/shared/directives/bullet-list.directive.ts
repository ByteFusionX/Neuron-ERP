import { Directive, HostListener, ElementRef } from '@angular/core';

const BULLET_PREFIX = '*   ';
const BULLET_LINE_REGEX = /^\*\s+(.*)$/;

@Directive({ selector: '[appBulletList]' })
export class appBulletList {
  constructor(private el: ElementRef<HTMLTextAreaElement>) {}

  @HostListener('keydown.enter', ['$event'])
  onEnter(event: Event): void {
    const textarea = this.el.nativeElement;
    const value = textarea.value;
    const start = textarea.selectionStart ?? value.length;
    const end = textarea.selectionEnd ?? value.length;

    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const currentLine = value.substring(lineStart, start);
    const bulletMatch = currentLine.match(BULLET_LINE_REGEX);

    event.preventDefault();

    let newValue: string;
    let newCursorPos: number;

    if (bulletMatch && bulletMatch[1].trim() === '') {
      // Enter on an empty bullet line: drop the bullet marker, stay on the same line
      newValue = value.substring(0, lineStart) + value.substring(start);
      newCursorPos = lineStart;
    } else if (currentLine.trim() === '') {
      // Empty, non-bulleted line: behave like a normal newline
      newValue = value.substring(0, start) + '\n' + value.substring(end);
      newCursorPos = start + 1;
    } else {
      // Line has content (bulleted or not): continue as a new bullet point
      const insert = '\n' + BULLET_PREFIX;
      newValue = value.substring(0, start) + insert + value.substring(end);
      newCursorPos = start + insert.length;
    }

    textarea.value = newValue;
    textarea.selectionStart = textarea.selectionEnd = newCursorPos;
    textarea.dispatchEvent(new Event('input'));
  }
}
