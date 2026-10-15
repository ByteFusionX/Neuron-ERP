import { Component, OnInit, inject } from '@angular/core';
import { FormBuilder, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { ToastrService } from 'ngx-toastr';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { MyProfile } from 'src/app/shared/interfaces/employee.interface';
import { SkeltonLoadingComponent } from '../../../../shared/components/skelton-loading/skelton-loading.component';
import { ConfirmDialogService } from 'src/app/shared/components/confirm-dialog/confirm-dialog.service';
import { ProfileHeaderComponent } from '../../components/profile-header/profile-header.component';
import { ProfileDetailsFormComponent } from '../../components/profile-details-form/profile-details-form.component';
import { ProfileEmploymentComponent } from '../../components/profile-employment/profile-employment.component';
import { ProfileTargetsComponent } from '../../components/profile-targets/profile-targets.component';
import { ProfileAccessComponent, AccessRow } from '../../components/profile-access/profile-access.component';
import { ProfilePreferencesFormComponent } from '../../components/profile-preferences-form/profile-preferences-form.component';
import { ProfilePasswordFormComponent } from '../../components/profile-password-form/profile-password-form.component';

const passwordsMatch = (group: AbstractControl): ValidationErrors | null => {
  const next = group.get('newPassword')?.value;
  const confirm = group.get('confirmPassword')?.value;
  return next && confirm && next !== confirm ? { mismatch: true } : null;
};

const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const PHOTO_MAX_BYTES = 2 * 1024 * 1024;

@Component({
    selector: 'app-profile-info',
    templateUrl: './profile-info.component.html',
    styleUrls: ['../../profile-shared.css', './profile-info.component.css'],
    imports: [SkeltonLoadingComponent, DatePipe, ProfileHeaderComponent, ProfileDetailsFormComponent, ProfileEmploymentComponent, ProfileTargetsComponent, ProfileAccessComponent, ProfilePreferencesFormComponent, ProfilePasswordFormComponent]
})
export class ProfileInfoComponent implements OnInit {

  private fb = inject(FormBuilder)
  private _employeeService = inject(EmployeeService)
  private toastr = inject(ToastrService)
  private confirm = inject(ConfirmDialogService)

  profile?: MyProfile
  loadFailed = false

  accessRows: AccessRow[] = []
  extraRows: AccessRow[] = []

  savingDetails = false
  savingPrefs = false
  savingPassword = false
  uploadingPhoto = false
  showPasswordForm = false

  readonly tabs = [
    { id: 'overview', label: 'Overview', icon: 'M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.5 20.1a7.5 7.5 0 0 1 15 0A17.9 17.9 0 0 1 12 21.75c-2.68 0-5.22-.58-7.5-1.65Z' },
    { id: 'access', label: 'Access', icon: 'M9 12.75 11.25 15 15 9.75m-3-7.04A11.96 11.96 0 0 1 3.6 6 12 12 0 0 0 3 9.75c0 5.59 3.82 10.29 9 11.62 5.18-1.33 9-6.03 9-11.62 0-1.31-.21-2.57-.6-3.75h-.15c-3.2 0-6.1-1.25-8.25-3.29Z' },
    { id: 'preferences', label: 'Preferences', icon: 'M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75' },
    { id: 'security', label: 'Security', icon: 'M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z' },
  ] as const
  activeTab = 'overview'

  detailsForm = this.fb.nonNullable.group({
    firstName: ['', [Validators.required, Validators.maxLength(50)]],
    lastName: ['', [Validators.required, Validators.maxLength(50)]],
    contactNo: ['', [Validators.required, Validators.pattern(/^[\d\s()+-]{6,20}$/)]],
  })

  prefsForm = this.fb.group({
    defaultLandingPage: this.fb.control<string | null>(null),
    dateFormat: this.fb.control<string | null>(null),
    timezone: this.fb.control<string | null>(null),
  })

  passwordForm = this.fb.nonNullable.group({
    oldPassword: ['', Validators.required],
    newPassword: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(128), Validators.pattern(/^(?=.*[A-Za-z])(?=.*\d).+$/)]],
    confirmPassword: ['', Validators.required],
  }, { validators: passwordsMatch })

  ngOnInit() {
    this.load()
  }

  get initials(): string {
    const p = this.profile
    return p ? `${p.firstName?.[0] ?? ''}${p.lastName?.[0] ?? ''}`.toUpperCase() : ''
  }

  /** "2y 4m" since joining, or null when the joining date is missing. */
  get tenure(): string | null {
    const joined = this.profile?.employment.dateOfJoining
    if (!joined) return null
    const start = new Date(joined)
    const now = new Date()
    let months = (now.getFullYear() - start.getFullYear()) * 12 + now.getMonth() - start.getMonth()
    if (now.getDate() < start.getDate()) months--
    if (months < 0) return null
    const years = Math.floor(months / 12)
    const rest = months % 12
    return years ? `${years}y ${rest}m` : `${rest}m`
  }

  get responsibilities(): string[] {
    const e = this.profile?.employment
    if (!e) return []
    return [e.isTechnician && 'Technician', e.isDriver && 'Driver', e.isProjectManager && 'Project Manager']
      .filter((r): r is string => !!r)
  }

  get isAdmin(): boolean {
    const role = this.profile?.role?.toLowerCase()
    return role === 'admin' || role === 'superadmin'
  }

  /** Which self-visible profile details are filled in, for the completeness ring. */
  get completeness(): { percent: number; missing: string[] } {
    const p = this.profile
    if (!p) return { percent: 0, missing: [] }
    const checks: [boolean, string][] = [ 
      [!!p.photo, 'Photo'],
      [!!p.contactNo, 'Phone number'],
      [!!p.dob, 'Date of birth'],
      [!!p.employment.department, 'Department'],
      [!!p.employment.reportingTo, 'Reporting manager'],
      [!!(p.preferences?.timezone || p.preferences?.dateFormat), 'Preferences'],
    ]
    const missing = checks.filter(([ok]) => !ok).map(([, label]) => label)
    return { percent: Math.round(((checks.length - missing.length) / checks.length) * 100), missing }
  }

  load() {
    this.loadFailed = false
    this._employeeService.getMyProfile().subscribe({
      next: (profile) => {
        this.profile = profile
        this.detailsForm.reset({
          firstName: profile.firstName,
          lastName: profile.lastName,
          contactNo: String(profile.contactNo ?? ''),
        })
        this.prefsForm.reset({
          defaultLandingPage: profile.preferences?.defaultLandingPage ?? null,
          dateFormat: profile.preferences?.dateFormat ?? null,
          timezone: profile.preferences?.timezone ?? null,
        })
        this.accessRows = this.summarize(profile.access.privileges)
        this.extraRows = profile.access.extraPrivilegesExpired ? [] : this.summarize(profile.access.extraPrivileges)
      },
      error: () => { this.loadFailed = true },
    })
  }

  /** Flattens a privileges object into "module: granted actions", skipping anything not granted. */
  private summarize(privileges: Record<string, any> | undefined): AccessRow[] {
    const rows: AccessRow[] = []
    for (const [module, value] of Object.entries(privileges ?? {})) {
      const grants: string[] = []
      if (typeof value === 'boolean') {
        if (value) grants.push('Allowed')
      } else if (value && typeof value === 'object') {
        for (const [action, flag] of Object.entries(value)) {
          if (flag === true) grants.push(this.label(action))
          else if (typeof flag === 'string' && flag && flag !== 'none') {
            grants.push(`${this.label(action)}: ${flag}`)
          }
        }
      }
      if (grants.length) rows.push({ module: this.label(module), grants })
    }
    return rows
  }

  private label(key: string): string {
    return key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).trim()
  }

  saveDetails() {
    if (this.detailsForm.invalid || this.savingDetails) return
    this.savingDetails = true
    this._employeeService.updateMyProfile(this.detailsForm.getRawValue()).subscribe({
      next: (res) => {
        this.savingDetails = false
        if (this.profile) Object.assign(this.profile, res)
        this.detailsForm.markAsPristine()
        this._employeeService.getEmployeeData()
        this.toastr.success('Profile updated')
      },
      error: (err) => {
        this.savingDetails = false
        this.toastr.error(err?.error?.message || 'Could not update your profile')
      },
    })
  }

  savePreferences() {
    if (this.savingPrefs) return
    this.savingPrefs = true
    const v = this.prefsForm.getRawValue()
    this._employeeService.updateMyProfile({ preferences: { defaultLandingPage: v.defaultLandingPage ?? '', dateFormat: v.dateFormat ?? '', timezone: v.timezone ?? '' } }).subscribe({
      next: (res) => {
        this.savingPrefs = false
        if (this.profile) this.profile.preferences = res.preferences
        this.prefsForm.markAsPristine()
        this.toastr.success('Preferences saved')
      },
      error: (err) => {
        this.savingPrefs = false
        this.toastr.error(err?.error?.message || 'Could not save preferences')
      },
    })
  }

  changePassword() {
    if (this.passwordForm.invalid || this.savingPassword) return
    const { oldPassword, newPassword } = this.passwordForm.getRawValue()
    this.savingPassword = true
    this._employeeService.changeMyPassword({ oldPassword, newPassword }).subscribe({
      next: () => {
        this.savingPassword = false
        this.showPasswordForm = false
        this.passwordForm.reset()
        if (this.profile) this.profile.security.passwordChangedAt = new Date().toISOString()
        this.toastr.success('Password changed')
      },
      error: (err) => {
        this.savingPassword = false
        this.toastr.error(err?.error?.message || 'Could not change your password')
      },
    })
  }

  onPhotoSelected(event: Event) {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    if (!PHOTO_TYPES.includes(file.type)) {
      this.toastr.error('Photo must be a JPG, PNG or WebP image')
      return
    }
    if (file.size > PHOTO_MAX_BYTES) {
      this.toastr.error('Photo must be 2 MB or smaller')
      return
    }
    this.uploadingPhoto = true
    this._employeeService.uploadMyPhoto(file).subscribe({
      next: (res) => {
        this.uploadingPhoto = false
        if (this.profile) this.profile.photo = res.photo
        this.toastr.success('Photo updated')
      },
      error: (err) => {
        this.uploadingPhoto = false
        this.toastr.error(err?.error?.message || 'Could not upload the photo')
      },
    })
  }

  async onPhotoRemoved() {
    const { confirmed } = await this.confirm.open({
      tone: 'warning',
      title: 'Remove profile photo?',
      message: 'Your photo will be removed and your initials shown instead.',
      confirmLabel: 'Remove',
    })
    if (!confirmed) return
    this.uploadingPhoto = true
    this._employeeService.removeMyPhoto().subscribe({
      next: () => {
        this.uploadingPhoto = false
        if (this.profile) this.profile.photo = null as any
        this.toastr.success('Photo removed')
      },
      error: (err) => {
        this.uploadingPhoto = false
        this.toastr.error(err?.error?.message || 'Could not remove the photo')
      },
    })
  }
}
