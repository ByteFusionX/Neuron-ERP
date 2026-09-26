import { settingsEditAccess } from '../../settings-edit-access';
import { SettingsSectionHeaderComponent } from '../settings-section-header.component';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { NgIf, NgFor, NgClass } from '@angular/common';
import { NgIcon } from '@ng-icons/core';
import { Subscription, filter, take } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { ProfileService } from 'src/app/core/services/profile/profile.service';
import { Privileges, Target } from 'src/app/shared/interfaces/employee.interface';
import { getCompanyDetails } from 'src/app/shared/interfaces/company.interface';
import { EditCompanyDetailsComponent } from '../../../profile/pages/edit-company-details/edit-company-details.component';
import { SetTargetComponent } from 'src/app/shared/components/set-target/set-target.component';
import { NumberFormatterPipe } from '../../../../shared/pipes/numFormatter.pipe';
import { SkeltonLoadingComponent } from '../../../../shared/components/skelton-loading/skelton-loading.component';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';

@Component({
  selector: 'app-general-settings',
  standalone: true,
  templateUrl: './general-settings.component.html',
  styleUrls: ['./general-settings.component.css'],
  imports: [SettingsSectionHeaderComponent, NgIf, NgFor, NgClass, NgIcon, NumberFormatterPipe, SkeltonLoadingComponent, ActionButtonComponent],
})
export class GeneralSettingsComponent implements OnInit, OnDestroy {
  privileges!: Privileges | undefined;
  readonly canEditProfile = settingsEditAccess('companyProfileEdit');

  companyDetails: getCompanyDetails | null = null;
  isCompanyDetailsLoading: boolean = true;

  openCreateForm: boolean = false;
  isTargetLoading: boolean = true;
  isTargetEmpty: boolean = false;

  targets: Target[] = [];
  readonly currentYear = new Date().getFullYear().toString();
  readonly targetMetrics: { key: 'salesRevenue' | 'grossProfit'; label: string }[] = [
    { key: 'salesRevenue', label: 'Sales Revenue' },
    { key: 'grossProfit', label: 'Gross Profit' },
  ];

  private subscriptions = new Subscription();

  constructor(
    private _profileService: ProfileService,
    public dialog: MatDialog,
    private _employeeService: EmployeeService,
    private _toast: ToastrService,
  ) {}

  ngOnInit(): void {
    this.subscriptions.add(
      this._employeeService.employeeData$.pipe(filter((e) => !!e), take(1)).subscribe((employee) => {
        this.privileges = employee?.category?.privileges;

        this.subscriptions.add(
          this._profileService.getCompanyDetails().subscribe({
            next: (data) => {
              this.companyDetails = data;
              this.isCompanyDetailsLoading = false;
            },
            error: () => {
              this.isCompanyDetailsLoading = false;
            }
          })
        );

        if (this.privileges?.portalManagement?.companyTarget) {
          this.subscriptions.add(
            this._profileService.getCompanyTargets().subscribe({
              next: (data) => {
                this.setTargets(data?.targets ?? []);
                this.isTargetLoading = false;
              },
              error: () => {
                this.isTargetLoading = false;
              }
            })
          );
        }
      })
    );
  }

  openCompanyDetails() {
    const dialogRef = this.dialog.open(EditCompanyDetailsComponent);
    // The logo uploads immediately inside the dialog and the save returns only an update
    // result, so refetch after any close instead of trusting the dialog's return value.
    dialogRef.afterClosed().subscribe(() => {
      this.subscriptions.add(
        this._profileService.getCompanyDetails().subscribe((data) => {
          if (data) this.companyDetails = data;
        })
      );
    });
  }

  get companyInitials(): string {
    const words = (this.companyDetails?.name ?? '').split(/\s+/).filter(Boolean);
    return words.slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '—';
  }

  addCompanyTarget() {
    const dialogRef = this.dialog.open(SetTargetComponent);
    dialogRef.afterClosed().subscribe((data: Target) => {
      if (data) {
        this._profileService.setCompanyTarget(data).subscribe({
          next: (res) => this.setTargets(res),
          error: (error) => {
            this._toast.warning(error.error.message);
          }
        });
      }
    });
  }

  editTarget(id: string) {
    const target = this.targets.find(target => target._id == id);
    const dialogRef = this.dialog.open(SetTargetComponent, {
      data: target
    });
    dialogRef.afterClosed().subscribe((data: Target) => {
      if (data) {
        this._profileService.updateCompanyTarget(id, data).subscribe({
          next: (res) => this.setTargets(res),
          error: (error) => {
            this._toast.warning(error.error.message);
          }
        });
      }
    });
  }

  zonePercent(value: number, target: number): number {
    if (!target || target <= 0) return 0;
    return Math.min(100, Math.max(0, (value / target) * 100));
  }

  private setTargets(data: Target[]) {
    this.targets = [...(data ?? [])].sort((a, b) => Number(b.year) - Number(a.year));
    this.isTargetEmpty = this.targets.length === 0;
  }

  ngOnDestroy() {
    this.subscriptions.unsubscribe();
  }
}
