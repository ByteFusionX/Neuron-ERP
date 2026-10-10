import { Injectable, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { SETTINGS_SECTIONS, SettingsAccess, SettingsSection, findSettingsSection } from './settings-sections';

export interface SettingsNavGroup {
  label: string;
  sections: SettingsSection[];
}

@Injectable({ providedIn: 'root' })
export class SettingsNavService {
  private router = inject(Router);
  private employeeService = inject(EmployeeService);

  loading = true;
  search = '';
  visibleSections: SettingsSection[] = [];
  groups: SettingsNavGroup[] = [];
  activeSection?: SettingsSection;

  private started = false;

  init(): void {
    if (this.started) return;
    this.started = true;

    if (this.employeeService.employeeToken()) {
      this.employeeService.getEmployeeData();
    }

    this.employeeService.employeeData$.pipe(filter((e) => !!e)).subscribe((employee) => {
      const access: SettingsAccess = {
        privileges: employee?.category?.privileges,
        isSuperAdmin: employee?.category?.role === 'superAdmin',
      };
      this.visibleSections = SETTINGS_SECTIONS.filter((s) => s.canView(access));
      this.loading = false;
      this.applySearch();
      this.syncActiveSection();
    });

    this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe(() => this.syncActiveSection());
  }

  applySearch(): void {
    const term = this.search.trim().toLowerCase();
    const matches = term
      ? this.visibleSections.filter((s) =>
          [s.label, s.description, ...(s.keywords ?? [])].some((text) => text.toLowerCase().includes(term))
        )
      : this.visibleSections;

    const byGroup = new Map<string, SettingsSection[]>();
    for (const section of matches) {
      byGroup.set(section.group, [...(byGroup.get(section.group) ?? []), section]);
    }
    this.groups = [...byGroup].map(([label, sections]) => ({ label, sections }));
  }

  syncActiveSection(): void {
    const path = this.router.url.split('?')[0];
    if (!path.startsWith('/settings')) {
      return;
    }

    const segment = path.split('/')[2];
    // Standalone pages under /settings (e.g. category/create, category/edit/:id) are not sections.
    if (segment === 'category') {
      this.activeSection = undefined;
      return;
    }
    this.activeSection = findSettingsSection(segment);

    if (this.loading) return;

    const allowed = this.activeSection && this.visibleSections.includes(this.activeSection);
    if (!allowed) {
      const fallback = this.visibleSections[0];
      this.router.navigate(fallback ? ['/settings', fallback.id] : ['/home'], { replaceUrl: true });
    }
  }
}
