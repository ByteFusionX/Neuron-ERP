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

  getExpandedMenus(): { [key: string]: boolean } {
    const raw = localStorage.getItem(this.key('expandedMenus'));
    return raw ? JSON.parse(raw) : {};
  }

  setExpandedMenus(expandedMenus: { [key: string]: boolean }): void {
    localStorage.setItem(this.key('expandedMenus'), JSON.stringify(expandedMenus));
  }
}
