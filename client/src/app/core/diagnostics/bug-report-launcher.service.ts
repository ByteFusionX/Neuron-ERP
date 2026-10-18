import { Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { ToastrService } from 'ngx-toastr';
import { ReportBugComponent } from 'src/app/shared/components/report-bug/report-bug.component';
import { BugReportScreenshotService } from './bug-report-screenshot.service';

/** Opens the bug report form; shared by the navbar button and the Ctrl+Shift+B shortcut. */
@Injectable({ providedIn: 'root' })
export class BugReportLauncherService {
  private busy = false;

  constructor(
    private dialog: MatDialog,
    private toastr: ToastrService,
    private screenshots: BugReportScreenshotService,
  ) {}

  async open(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.screenshots.clear();
    const wait = this.toastr.info(
      'Preparing the bug report. This takes a few seconds, please wait for the form to open.',
      'Please wait',
      { disableTimeOut: true, tapToDismiss: false, closeButton: false },
    );
    try {
      // Capture before the dialog exists so the screenshot shows the page, not the form.
      await this.screenshots.captureScreenshot();
    } catch {
      this.toastr.warning('Automatic screenshot failed. You can add one manually in the form.');
    }
    const ref = this.dialog.open(ReportBugComponent, {
      disableClose: true,
      maxHeight: '90vh',
      width: '600px',
    });
    ref.afterOpened().subscribe(() => this.toastr.clear(wait.toastId));
    this.busy = false;
  }
}
