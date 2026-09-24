import { Component, OnInit, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NgIf } from '@angular/common';
import { SettingsNavService } from './settings-nav.service';

@Component({
  selector: 'app-settings-shell',
  standalone: true,
  imports: [NgIf, RouterOutlet],
  template: `
    <div class="h-full bg-gray-50 dark:bg-erp-surface-dark-alt">
      <div class="p-6">
        <router-outlet></router-outlet>
      </div>
    </div>
  `,
})
export class SettingsShellComponent implements OnInit {
  nav = inject(SettingsNavService);

  ngOnInit(): void {
    this.nav.init();
  }
}
