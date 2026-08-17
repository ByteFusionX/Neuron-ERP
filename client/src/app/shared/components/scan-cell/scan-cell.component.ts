import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import * as QRCode from 'qrcode';
import { Subscription } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { ScanEntry, ScanSessionService } from 'src/app/core/services/scan-session/scan-session.service';

const STORAGE_PREFIX = 'scan-session:';

@Component({
  selector: 'app-scan-cell',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './scan-cell.component.html',
  styleUrl: './scan-cell.component.css'
})
export class ScanCellComponent implements OnInit, OnDestroy {
  @Input({ required: true }) rowKey!: string;
  @Input() supplier?: string;
  @Input() product?: string;
  @Input() reference?: string;
  @Input() disabled: boolean = false;
  @Output() scanReceived = new EventEmitter<string>();

  sessionId: string | null = null;
  status: 'idle' | 'active' | 'closed' = 'idle';
  qrDataUrl: string | null = null;
  scans: ScanEntry[] = [];
  showQr = false;

  private scanAddedSub: Subscription | null = null;

  constructor(
    private scanSessionService: ScanSessionService,
    private toastr: ToastrService
  ) { }

  ngOnInit(): void {
    this.scanAddedSub = this.scanSessionService.onScanAdded().subscribe(({ sessionId, scan }) => {
      if (sessionId === this.sessionId) {
        this.scans = [...this.scans, scan].sort((a, b) => a.order - b.order);
        this.scanReceived.emit(scan.code);
      }
    });

    const storedSessionId = localStorage.getItem(this.storageKey);
    if (storedSessionId) {
      this.resumeSession(storedSessionId);
    }
  }

  private get storageKey(): string {
    return `${STORAGE_PREFIX}${this.rowKey}`;
  }

  private resumeSession(sessionId: string): void {
    this.scanSessionService.getSession(sessionId).subscribe({
      next: (session) => {
        if (session.status === 'active') {
          this.sessionId = sessionId;
          this.scans = session.scans || [];
          this.status = 'active';
          this.scanSessionService.joinRoom(sessionId);
        } else {
          localStorage.removeItem(this.storageKey);
        }
      },
      error: () => {
        localStorage.removeItem(this.storageKey);
      }
    });
  }

  startScan(): void {
    if (this.disabled) return;
    this.scanSessionService.createSession({
      supplier: this.supplier,
      product: this.product,
      reference: this.reference
    }).subscribe({
      next: (session) => {
        this.sessionId = session.sessionId;
        this.scans = [];
        this.status = 'active';
        this.showQr = true;
        localStorage.setItem(this.storageKey, session.sessionId);
        this.scanSessionService.joinRoom(session.sessionId);
        this.generateQr(session.sessionId);
      },
      error: () => {
        this.toastr.error('Failed to start scan session');
      }
    });
  }

  private generateQr(sessionId: string): void {
    // TEMP: hardcoded to LAN IP so the QR opens on a phone during local testing; revert to window.location.origin afterwards.
    const host = window.location.hostname === 'localhost' ? 'http://192.168.1.220:4200' : window.location.origin;
    const url = `${host}/zxing-scan?session=${sessionId}`;
    QRCode.toDataURL(url, { width: 220 }).then((dataUrl) => {
      this.qrDataUrl = dataUrl;
    }).catch(() => {
      this.toastr.error('Failed to generate QR code');
    });
  }

  toggleQr(): void {
    this.showQr = !this.showQr;
  }

  closeSession(): void {
    if (!this.sessionId) return;
    this.scanSessionService.closeSession(this.sessionId).subscribe({
      next: () => {
        this.status = 'closed';
        this.showQr = false;
        this.qrDataUrl = null;
        if (this.sessionId) {
          this.scanSessionService.leaveRoom(this.sessionId);
        }
        localStorage.removeItem(this.storageKey);
      },
      error: () => {
        this.toastr.error('Failed to close scan session');
      }
    });
  }

  newScan(): void {
    this.sessionId = null;
    this.scans = [];
    this.status = 'idle';
    this.qrDataUrl = null;
    this.startScan();
  }

  ngOnDestroy(): void {
    this.scanAddedSub?.unsubscribe();
    if (this.sessionId && this.status === 'active') {
      this.scanSessionService.leaveRoom(this.sessionId);
    }
  }
}
