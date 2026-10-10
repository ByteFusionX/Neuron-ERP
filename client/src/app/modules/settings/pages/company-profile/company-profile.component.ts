import { Component } from '@angular/core';
import { SettingsSectionHeaderComponent } from '../settings-section-header.component';

@Component({
  selector: 'app-company-profile',
  standalone: true,
  imports: [SettingsSectionHeaderComponent],
  template: `
    <div class="w-full h-full bg-white dark:bg-erp-surface-dark p-6 rounded-md">
      <app-settings-section-header sectionId="company-profile"></app-settings-section-header>

      <!-- Company profile content is intentionally hidden while the page is being rebuilt. -->
      <div class="mt-10 flex min-h-[360px] items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 text-center dark:border-erp-border-dark dark:bg-erp-surface-dark-alt">
        <h2 class="text-2xl font-semibold text-gray-900 dark:text-gray-100">Soon</h2>
      </div>
    </div>
  `,
})
export class CompanyProfileComponent {}
