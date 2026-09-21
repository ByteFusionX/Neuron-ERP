import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Initials avatar for a person or record.
 *
 *   <app-detail-avatar [name]="comment.by" size="sm"></app-detail-avatar>
 */
@Component({
  selector: 'app-detail-avatar',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span class="grid shrink-0 place-content-center font-semibold bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300"
      [ngClass]="size === 'md' ? 'h-11 w-11 rounded-lg text-sm' : 'h-7 w-7 rounded-full text-[10px]'">{{ initials }}</span>
  `,
  styles: [':host{display:inline-flex}'],
})
export class DetailAvatarComponent {
  @Input() name = '';
  /** Pre-computed initials; wins over `name` when set. */
  @Input() text = '';
  /** `sm` is a round chip for comment threads; `md` is the square header avatar. */
  @Input() size: 'sm' | 'md' = 'sm';

  get initials(): string {
    if (this.text) return this.text;
    return this.name.split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  }
}
