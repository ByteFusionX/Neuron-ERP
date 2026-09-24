import { ActivatedRoute } from '@angular/router';
import { Component, inject } from '@angular/core';
import { SettingsSectionHeaderComponent } from '../settings-section-header.component';
import { NgIcon } from '@ng-icons/core';

@Component({
  selector: 'app-settings-placeholder',
  standalone: true,
  imports: [NgIcon, SettingsSectionHeaderComponent],
  template: `
    <app-settings-section-header [sectionId]="sectionId"></app-settings-section-header>
    <div class="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 bg-white px-6 py-16 text-center dark:border-erp-border-dark dark:bg-erp-surface-dark">
      <ng-icon name="heroWrenchScrewdriver" class="h-8 w-8 text-gray-300 dark:text-gray-600"></ng-icon>
      <p class="mt-3 text-sm font-medium text-gray-700 dark:text-gray-300">Not available yet</p>
      <p class="mt-1 max-w-sm text-sm text-gray-500 dark:text-gray-400">This section is planned and will be configurable here once it's built.</p>
    </div>
  `,
})
export class SettingsPlaceholderComponent {
  sectionId = inject(ActivatedRoute).snapshot.data['section'];
}
