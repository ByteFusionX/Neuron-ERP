import { Component, OnInit, inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { } from '@angular/common';
import { SettingsNavService } from './settings-nav.service';

@Component({
  selector: 'app-settings-shell',
  standalone: true,
  imports: [RouterOutlet],
  template: `
    <div class="h-full bg-gray-50 dark:bg-erp-surface-dark-alt">
      <!-- The audit page brings its own p-5 and fills the whole area, so the shell adds no padding there. -->
      <div class="h-full" [class.p-6]="!fullBleed">
        <router-outlet></router-outlet>
      </div>
    </div>
  `,
})
export class SettingsShellComponent implements OnInit {
  nav = inject(SettingsNavService);
  private router = inject(Router);

  get fullBleed(): boolean {
    return this.router.url.split(/[?#]/)[0].endsWith('/settings/audit');
  }

  ngOnInit(): void {
    this.nav.init();
  }
}
