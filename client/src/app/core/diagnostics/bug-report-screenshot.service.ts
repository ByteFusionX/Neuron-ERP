import { Injectable } from '@angular/core';
import html2canvas from 'html2canvas';

export type BugReportScreenshotSource = 'auto' | 'manual';

export interface BugReportScreenshot {
  id: string;
  dataUrl: string;
  source: BugReportScreenshotSource;
}

/**
 * Manages the array of screenshots attached to a bug report (Phase 1,
 * Step 6): the automatic html2canvas capture taken when the report modal
 * opens, any additional auto-captures, and manually uploaded files — the
 * fallback for components the Phase 0 spike couldn't validate (e.g. the
 * QR scan/camera module). Screenshots live only in this service's memory
 * for the lifetime of the open report modal; nothing is persisted here.
 * This is a root singleton (this Angular Material version's
 * MatDialogConfig has no per-dialog `providers` hook), so callers MUST
 * call `clear()` before opening the report modal to avoid carrying
 * screenshots over from a previous session.
 */
@Injectable({ providedIn: 'root' })
export class BugReportScreenshotService {
  private screenshots: BugReportScreenshot[] = [];

  getScreenshots(): BugReportScreenshot[] {
    return [...this.screenshots];
  }

  async captureScreenshot(): Promise<BugReportScreenshot> {
    const canvas = await html2canvas(document.body, { logging: false });
    const screenshot: BugReportScreenshot = {
      id: crypto.randomUUID(),
      dataUrl: canvas.toDataURL('image/png'),
      source: 'auto',
    };
    this.screenshots.push(screenshot);
    return screenshot;
  }

  async addManualScreenshot(file: File): Promise<BugReportScreenshot> {
    const dataUrl = await readFileAsDataUrl(file);
    const screenshot: BugReportScreenshot = {
      id: crypto.randomUUID(),
      dataUrl,
      source: 'manual',
    };
    this.screenshots.push(screenshot);
    return screenshot;
  }

  removeScreenshot(id: string): void {
    this.screenshots = this.screenshots.filter((s) => s.id !== id);
  }

  clear(): void {
    this.screenshots = [];
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
