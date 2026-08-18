import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { MatDialogRef } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { firstValueFrom } from 'rxjs';
import { environment } from 'src/environments/environment';
import { ButtonComponent } from '../button/button.component';
import { IconsModule } from 'src/app/lib/icons/icons.module';
import { ModalLayoutComponent } from '../modal-layout/modal-layout.component';
import { DiagnosticsBufferService } from 'src/app/core/diagnostics/diagnostics-buffer.service';
import { ActionTrailService } from 'src/app/core/diagnostics/action-trail.service';
import { BugReportStateSnapshotService } from 'src/app/core/diagnostics/bug-report-state-snapshot.service';
import { BugReportScreenshotService, BugReportScreenshot } from 'src/app/core/diagnostics/bug-report-screenshot.service';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { getEmployee } from 'src/app/shared/interfaces/employee.interface';

const DEFAULT_REPORTING_TO_EMPLOYEE_ID = 'NT-1101';

export interface BugReportPayload {
  description: string;
  screenshotKeys: string[];
  route: string;
  consoleLog: ReturnType<DiagnosticsBufferService['getEntries']>;
  networkErrors: ReturnType<DiagnosticsBufferService['getNetworkErrors']>;
  actionTrail: ReturnType<ActionTrailService['getTrail']>;
  stateSnapshot: Record<string, unknown>;
  userAgent: string;
  viewport: string;
  reportingTo: string | null;
}

/**
 * "Report Bug" modal (Phase 1, Step 7). Only the description is required
 * from the user; everything else is auto-attached from the diagnostics
 * services built in Steps 2-5, and shown collapsed by default for
 * transparency rather than editability.
 *
 * BugReportScreenshotService is a root singleton; the caller (e.g.
 * NavBarComponent.onReportBug) is responsible for calling `clear()`
 * before opening this dialog so a new session starts with an empty
 * screenshot array.
 */
@Component({
  selector: 'app-report-bug',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ButtonComponent, IconsModule, ModalLayoutComponent],
  templateUrl: './report-bug.component.html',
  styleUrl: './report-bug.component.css',
})
export class ReportBugComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly toastr = inject(ToastrService);
  private readonly http = inject(HttpClient);
  private readonly api = environment.api;
  private readonly diagnosticsBuffer = inject(DiagnosticsBufferService);
  private readonly actionTrail = inject(ActionTrailService);
  private readonly stateSnapshot = inject(BugReportStateSnapshotService);
  private readonly employeeService = inject(EmployeeService);
  readonly screenshotService = inject(BugReportScreenshotService);

  reportForm: FormGroup = this.fb.group({
    description: ['', [Validators.required]],
    reportingTo: [null],
  });

  isCapturing = false;
  isSubmitting = false;
  showTechnicalDetails = false;

  // Gates the skeleton placeholder: the modal itself opens instantly, but the initial
  // auto-screenshot capture is heavy, so the real form only swaps in once it settles.
  isInitializing = true;

  consoleErrorCount = 0;
  networkErrorCount = 0;
  route = '';
  employees: getEmployee[] = [];

  constructor(public dialogRef: MatDialogRef<ReportBugComponent>) {}

  ngOnInit(): void {
    this.route = this.router.url;
    this.refreshCounts();
    this.loadEmployees();
    this.captureAutoScreenshot().finally(() => { this.isInitializing = false; });
  }

  private loadEmployees(): void {
    this.employeeService.getAllEmployees().subscribe({
      next: (employees) => {
        this.employees = employees;
        const defaultAssignee = employees.find((e) => e.employeeId === DEFAULT_REPORTING_TO_EMPLOYEE_ID);
        if (defaultAssignee?._id) {
          this.reportForm.patchValue({ reportingTo: defaultAssignee._id });
        }
      },
      error: () => {
        this.employees = [];
      },
    });
  }

  get screenshots(): BugReportScreenshot[] {
    return this.screenshotService.getScreenshots();
  }

  private refreshCounts(): void {
    this.consoleErrorCount = this.diagnosticsBuffer.getEntries().length;
    this.networkErrorCount = this.diagnosticsBuffer.getNetworkErrors().length;
  }

  private async captureAutoScreenshot(): Promise<void> {
    this.isCapturing = true;
    try {
      await this.screenshotService.captureScreenshot();
    } catch {
      this.toastr.warning('Automatic screenshot failed. You can add one manually below.');
    } finally {
      this.isCapturing = false;
    }
  }

  async onAddScreenshot(): Promise<void> {
    this.isCapturing = true;
    try {
      await this.screenshotService.captureScreenshot();
    } catch {
      this.toastr.warning('Automatic screenshot failed. You can add one manually below.');
    } finally {
      this.isCapturing = false;
    }
  }

  async onManualUpload(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    await this.screenshotService.addManualScreenshot(file);
    input.value = '';
  }

  onRemoveScreenshot(id: string): void {
    this.screenshotService.removeScreenshot(id);
  }

  toggleTechnicalDetails(): void {
    this.showTechnicalDetails = !this.showTechnicalDetails;
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  async onSubmit(): Promise<void> {
    if (this.reportForm.invalid) {
      this.reportForm.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;
    try {
      const screenshotKeys = await this.uploadScreenshots();

      const payload: BugReportPayload = {
        description: this.reportForm.value.description,
        screenshotKeys,
        route: this.route,
        consoleLog: this.diagnosticsBuffer.getEntries(),
        networkErrors: this.diagnosticsBuffer.getNetworkErrors(),
        actionTrail: this.actionTrail.getTrail(),
        stateSnapshot: this.stateSnapshot.snapshot(),
        userAgent: navigator.userAgent,
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        reportingTo: this.reportForm.value.reportingTo || null,
      };

      const saved = await firstValueFrom(this.http.post(`${this.api}/bug-reports`, payload));
      this.toastr.success('Bug report submitted. Our AI will analyze and try to fix it — this can take a few minutes, check the Bug Reports page for progress.', undefined, { timeOut: 6000 });
      this.dialogRef.close(saved);
    } catch {
      this.toastr.error('Failed to submit bug report. Please try again.');
    } finally {
      this.isSubmitting = false;
    }
  }

  private async uploadScreenshots(): Promise<string[]> {
    const screenshots = this.screenshotService.getScreenshots();
    const keys: string[] = [];

    for (const shot of screenshots) {
      const blob = await (await fetch(shot.dataUrl)).blob();
      const { uploadUrl, key } = await firstValueFrom(
        this.http.post<{ uploadUrl: string; key: string }>(`${this.api}/bug-reports/upload-url`, {
          contentType: blob.type || 'image/png',
        })
      );
      await firstValueFrom(this.http.put(uploadUrl, blob, { headers: { 'Content-Type': blob.type || 'image/png' } }));
      keys.push(key);
    }

    return keys;
  }
}
