import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';
import { Subscription } from 'rxjs';
import { ScanSessionService } from 'src/app/core/services/scan-session/scan-session.service';

@Component({
  selector: 'app-zxing-scan',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './zxing-scan.component.html',
  styleUrl: './zxing-scan.component.css'
})
export class ZxingScanComponent implements OnInit, OnDestroy {
  sessionId: string | null = null;
  status: 'loading' | 'ready' | 'invalid' | 'closed' | 'camera-error' = 'loading';
  lastCode: string | null = null;
  scanCount = 0;
  errorMessage = '';

  private reader = new BrowserMultiFormatReader();
  private controls: IScannerControls | null = null;
  private scanErrorSub: Subscription | null = null;
  private lastDecodedCode: string | null = null;
  private lastDecodedAt = 0;
  private readonly dedupeWindowMs = 2000;

  constructor(
    private route: ActivatedRoute,
    private scanSessionService: ScanSessionService
  ) { }

  ngOnInit(): void {
    this.sessionId = this.route.snapshot.queryParamMap.get('session');

    if (!this.sessionId) {
      this.status = 'invalid';
      this.errorMessage = 'No scan session was provided in the URL.';
      return;
    }

    this.scanSessionService.getSession(this.sessionId).subscribe({
      next: (session) => {
        if (session.status !== 'active') {
          this.status = 'closed';
          this.errorMessage = 'This scan session has already been closed.';
          return;
        }
        this.scanCount = session.scans?.length || 0;
        this.status = 'ready';
        this.startCamera();
      },
      error: () => {
        this.status = 'invalid';
        this.errorMessage = 'This scan session does not exist or has expired.';
      }
    });

    this.scanErrorSub = this.scanSessionService.onScanError().subscribe(({ sessionId, message }) => {
      if (sessionId === this.sessionId) {
        this.status = 'closed';
        this.errorMessage = message;
        this.controls?.stop();
      }
    });
  }

  private async startCamera(): Promise<void> {
    try {
      const devices = await BrowserMultiFormatReader.listVideoInputDevices();
      const deviceId = devices.find(d => /back|rear|environment/i.test(d.label))?.deviceId ?? devices[0]?.deviceId;

      this.controls = await this.reader.decodeFromVideoDevice(
        deviceId,
        'scan-video',
        (result) => {
          if (!result) return;
          this.handleDecoded(result.getText());
        }
      );
    } catch (error) {
      this.status = 'camera-error';
      this.errorMessage = 'Could not access the camera. Please grant camera permission.';
    }
  }

  private handleDecoded(code: string): void {
    const now = Date.now();
    if (code === this.lastDecodedCode && (now - this.lastDecodedAt) < this.dedupeWindowMs) {
      return;
    }
    this.lastDecodedCode = code;
    this.lastDecodedAt = now;

    if (!this.sessionId) return;

    this.scanSessionService.emitScanCode(this.sessionId, code);
    this.lastCode = code;
    this.scanCount++;
  }

  ngOnDestroy(): void {
    this.controls?.stop();
    this.scanErrorSub?.unsubscribe();
  }
}
