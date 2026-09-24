import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { GetCategory } from 'src/app/shared/interfaces/employee.interface';
import { RoleFormDrawerComponent } from 'src/app/modules/hr/pages/role-form-drawer/role-form-drawer.component';

/**
 * Standalone route that hosts the role drawer, opened in its own window from the employee forms.
 * On save it hands the new role back to the opener and closes.
 */
@Component({
  selector: 'app-create-category',
  standalone: true,
  imports: [RoleFormDrawerComponent],
  template: `<app-role-form-drawer [open]="true" mode="create" (saved)="onSaved($event)" (closed)="onClosed()"></app-role-form-drawer>`,
})
export class CreateCategoryComponent {
  constructor(private router: Router) {}

  onSaved(category: GetCategory): void {
    if (window.opener) {
      window.opener.postMessage({ type: 'categoryCreated', data: category }, '*');
      window.close();
    } else {
      this.router.navigate(['/hr/roles-privileges']);
    }
  }

  onClosed(): void {
    if (window.opener) window.close();
    else this.router.navigate(['/hr/roles-privileges']);
  }
}
