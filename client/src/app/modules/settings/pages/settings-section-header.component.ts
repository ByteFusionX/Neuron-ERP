import { Component, Input } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { findSettingsSection } from '../settings-sections';

@Component({
  selector: 'app-settings-section-header',
  standalone: true,
  imports: [NgIcon],
  template: `
    <div class="flex items-start gap-3 mb-6 pb-4 border-b border-gray-200 dark:border-gray-700">
      <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-50 dark:bg-violet-500/10 shrink-0">
        <ng-icon [name]="icon ?? section?.icon ?? ''" class="text-violet-600 dark:text-violet-400 text-xl"></ng-icon>
      </div>
      <div>
        <h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100">{{ label ?? section?.label }}</h2>
        <p class="text-sm text-gray-500 dark:text-gray-400">{{ description ?? section?.description }}</p>
      </div>
    </div>
  `,
})
export class SettingsSectionHeaderComponent {
  section?: ReturnType<typeof findSettingsSection>;

  @Input() label?: string;
  @Input() description?: string;
  @Input() icon?: string;

  @Input() set sectionId(id: string) {
    this.section = findSettingsSection(id);
  }
}
