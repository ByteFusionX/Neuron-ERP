import { Component } from '@angular/core';
import { SettingsSectionHeaderComponent } from '../settings-section-header.component';
import { NotesTermsSettingsComponent } from '../notes-terms-settings/notes-terms-settings.component';

@Component({
  selector: 'app-purchase-data',
  standalone: true,
  imports: [SettingsSectionHeaderComponent, NotesTermsSettingsComponent],
  template: `
    <div class="w-full min-h-full bg-white dark:bg-erp-surface-dark p-6 rounded-md">
      <app-settings-section-header sectionId="master-data" label="Purchase Data"
        description="Purchase/LPO text lists: terms & conditions, place of delivery and shipping terms."></app-settings-section-header>
      <app-notes-terms-settings [embedded]="true" listScope="purchase"></app-notes-terms-settings>
    </div>
  `,
})
export class PurchaseDataComponent {}
