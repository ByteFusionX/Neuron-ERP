import { Injectable } from '@angular/core';
import { EmployeeService } from './employee/employee.service';

@Injectable({
  providedIn: 'root',
})
export class SidebarPreferencesService {
  constructor(private employeeService: EmployeeService) {}

  private currentEmployeeId(): string {
    return this.employeeService.employeeToken()?.id ?? 'anonymous';
  }

  ownerKey(): string {
    return this.currentEmployeeId();
  }

  private key(suffix: string): string {
    return `sidebar_${suffix}_${this.currentEmployeeId()}`;
  }

  getShowFullBar(): boolean {
    const raw = localStorage.getItem(this.key('showFullBar'));
    return raw !== null ? JSON.parse(raw) : true;
  }

  setShowFullBar(showFullBar: boolean): void {
    localStorage.setItem(this.key('showFullBar'), JSON.stringify(showFullBar));
  }

  getSidebarWidth(): number | null {
    const raw = localStorage.getItem(this.key('width'));
    const width = raw !== null ? Number(raw) : NaN;
    return Number.isFinite(width) ? width : null;
  }

  setSidebarWidth(width: number): void {
    localStorage.setItem(this.key('width'), String(width));
  }

  getSidebarHidden(): boolean {
    return localStorage.getItem(this.key('hidden')) === 'true';
  }

  setSidebarHidden(hidden: boolean): void {
    localStorage.setItem(this.key('hidden'), String(hidden));
  }

  getExpandedMenus(): { [key: string]: boolean } {
    const raw = localStorage.getItem(this.key('expandedMenus'));
    return raw ? JSON.parse(raw) : {};
  }

  setExpandedMenus(expandedMenus: { [key: string]: boolean }): void {
    localStorage.setItem(this.key('expandedMenus'), JSON.stringify(expandedMenus));
  }

  getCollapsedGroups(): { [key: string]: boolean } {
    const raw = localStorage.getItem(this.key('collapsedGroups'));
    return raw ? JSON.parse(raw) : {};
  }

  setCollapsedGroups(collapsedGroups: { [key: string]: boolean }): void {
    localStorage.setItem(this.key('collapsedGroups'), JSON.stringify(collapsedGroups));
  }
}
