import { Component, OnInit, inject } from '@angular/core';
import { NgIf, NgFor, NgTemplateOutlet } from '@angular/common';
import { ProfileService } from 'src/app/core/services/profile/profile.service';

/** Read-only view: headcount per internal department + org chart of the selected one. */
@Component({
  selector: 'app-department-overview',
  standalone: true,
  imports: [NgIf, NgFor, NgTemplateOutlet],
  template: `
    <div class="p-4">
      <h1 class="text-xl font-semibold mb-4">Department Overview</h1>
      <div class="grid gap-4 md:grid-cols-2">
        <div class="overflow-x-auto">
          <table class="w-full text-sm border-collapse">
            <thead>
              <tr class="text-left border-b">
                <th class="py-2 pr-2">Department</th>
                <th class="py-2 pr-2">Parent</th>
                <th class="py-2 pr-2">Head</th>
                <th class="py-2 text-right">Headcount</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let d of departments" class="border-b cursor-pointer hover:bg-black/5"
                  [class.font-semibold]="d._id === selected?._id" (click)="select(d._id)">
                <td class="py-2 pr-2">{{ d.departmentName }}</td>
                <td class="py-2 pr-2">{{ parentName(d) }}</td>
                <td class="py-2 pr-2">{{ d.departmentHead ? d.departmentHead.firstName + ' ' + d.departmentHead.lastName : '—' }}</td>
                <td class="py-2 text-right">{{ d.headcount }}</td>
              </tr>
              <tr *ngIf="!loading && !departments.length"><td colspan="4" class="py-3">No departments.</td></tr>
            </tbody>
          </table>
          <p *ngIf="loading" class="py-2">Loading…</p>
        </div>

        <div>
          <p *ngIf="!selected" class="text-sm opacity-70">Select a department to see its org chart.</p>
          <div *ngIf="selected">
            <h2 class="font-semibold mb-2">{{ selected.departmentName }} — {{ selected.headcount }} employees</h2>
            <p *ngIf="!selected.orgChart.length" class="text-sm opacity-70">No employees.</p>
            <ul class="ml-0 list-none">
              <ng-container *ngTemplateOutlet="node; context: { $implicit: selected.orgChart }"></ng-container>
            </ul>
          </div>
        </div>
      </div>
    </div>

    <ng-template #node let-nodes>
      <li *ngFor="let n of nodes" class="my-1">
        <span>{{ n.firstName }} {{ n.lastName }}</span>
        <span class="opacity-60 text-xs"> · {{ n.designation }} ({{ n.employeeId }})</span>
        <ul *ngIf="n.reports?.length" class="ml-5 border-l pl-3 list-none">
          <ng-container *ngTemplateOutlet="node; context: { $implicit: n.reports }"></ng-container>
        </ul>
      </li>
    </ng-template>
  `,
})
export class DepartmentOverviewComponent implements OnInit {
  private profileService = inject(ProfileService);

  departments: any[] = [];
  selected: any = null;
  loading = true;

  ngOnInit(): void {
    this.profileService.getInternalDepartmentHeadcount().subscribe({
      next: (data) => { this.departments = data; this.loading = false; },
      error: () => { this.loading = false; },
    });
  }

  parentName(d: any): string {
    const p = this.departments.find((x) => x._id === d.parentDepartment);
    return p ? p.departmentName : '—';
  }

  select(id: string): void {
    this.profileService.getInternalDepartmentOrgChart(id).subscribe((d) => (this.selected = d));
  }
}
