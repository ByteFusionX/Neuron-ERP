import { Component } from '@angular/core';
import { SettingsSectionHeaderComponent } from '../settings-section-header.component';
import { NotesTermsSettingsComponent } from '../notes-terms-settings/notes-terms-settings.component';

@Component({
  selector: 'app-notes-terms-data',
  standalone: true,
  imports: [SettingsSectionHeaderComponent, NotesTermsSettingsComponent],
  template: `
    <div class="w-full min-h-full bg-white dark:bg-erp-surface-dark p-6 rounded-md">
      <app-settings-section-header sectionId="master-data" label="Notes & Terms"
        description="Default customer notes and terms & conditions printed on quotations and sales documents."></app-settings-section-header>
      <app-notes-terms-settings [embedded]="true"></app-notes-terms-settings>
    </div>
  `,
})
export class NotesTermsDataComponent {}
