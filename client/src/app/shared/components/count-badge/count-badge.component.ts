import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-count-badge',
  standalone: true,
  template: `
    @if (count > 0) {
      <span
        class="absolute -top-1 -right-1 z-10 bg-orange-500 text-white text-[11px] leading-none font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center border-2 border-white dark:border-erp-surface-dark shadow"
        aria-hidden="true">
        {{ count > max ? max + '+' : count }}
      </span>
    }
  `,
})
export class CountBadgeComponent {
  @Input() count: number = 0;
  @Input() max = 99;
}
