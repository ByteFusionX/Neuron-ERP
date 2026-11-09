import { Component, OnInit, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { MsalService } from '@azure/msal-angular';
import { ToastrService } from 'ngx-toastr';
import { EmployeeService, EmployeeSession } from 'src/app/core/services/employee/employee.service';
import { NotificationService } from 'src/app/core/services/notification.service';
import { ConfirmDialogService } from 'src/app/shared/components/confirm-dialog/confirm-dialog.service';
import { clearSessionStorage } from 'src/app/shared/utils/clear-session.util';

@Component({
  selector: 'app-profile-sessions',
  templateUrl: './profile-sessions.component.html',
  styleUrls: ['../../profile-shared.css'],
  imports: [DatePipe],
})
export class ProfileSessionsComponent implements OnInit {
  private employeeService = inject(EmployeeService)
  private confirm = inject(ConfirmDialogService)
  private toastr = inject(ToastrService)
  private router = inject(Router)
  private msal = inject(MsalService)
  private notifications = inject(NotificationService)

  sessions: EmployeeSession[] = []
  loading = true
  failed = false
  busyId: string | null = null

  ngOnInit() {
    this.load()
  }

  load() {
    this.loading = true
    this.failed = false
    this.employeeService.getSessions().subscribe({
      next: (rows) => { this.sessions = rows; this.loading = false },
      error: () => { this.failed = true; this.loading = false },
    })
  }

  async revoke(session: EmployeeSession) {
    const { confirmed } = await this.confirm.open({
      tone: 'warning',
      title: session.current ? 'Sign out of this device?' : 'Sign out this device?',
      message: session.current
        ? 'You will be signed out here and returned to the login page.'
        : `${session.browser} on ${session.os} will be signed out. It can stay usable for up to 15 minutes until its current access expires.`,
      confirmLabel: 'Sign out',
    })
    if (!confirmed) return
    this.busyId = session.id
    this.employeeService.revokeSession(session.id).subscribe({
      next: () => {
        this.busyId = null
        if (session.current) this.endLocalSession()
        else { this.sessions = this.sessions.filter((s) => s.id !== session.id); this.toastr.success('Device signed out') }
      },
      error: () => { this.busyId = null; this.toastr.error('Could not sign the device out') },
    })
  }

  async revokeAll() {
    const { confirmed } = await this.confirm.open({
      tone: 'warning',
      title: 'Sign out of all devices?',
      message: 'Every device, including this one, will be signed out. You will need to sign in again.',
      confirmLabel: 'Sign out everywhere',
    })
    if (!confirmed) return
    this.busyId = 'all'
    this.employeeService.logoutEverywhere().subscribe({
      next: () => { this.busyId = null; this.endLocalSession() },
      error: () => { this.busyId = null; this.toastr.error('Could not sign out of all devices') },
    })
  }

  // Same local clean-up as the nav-bar sign-out; the server session is already revoked.
  private endLocalSession() {
    const account = this.msal.instance.getActiveAccount() ?? this.msal.instance.getAllAccounts()[0]
    this.notifications.endSession()
    clearSessionStorage()
    this.employeeService.employeeSubject.next(undefined)
    this.router.navigate(['/login'])
    // Keep the Microsoft session so the saved account stays in the browser.
    if (account) this.msal.instance.setActiveAccount(null)
  }
}
