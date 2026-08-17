import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Socket } from 'ngx-socket-io';
import { environment } from 'src/environments/environment';

export interface ScanEntry {
  code: string;
  order: number;
  scannedAt: string;
}

export interface ScanSession {
  _id: string;
  sessionId: string;
  supplier?: string;
  product?: string;
  reference?: string;
  createdBy: string;
  scans: ScanEntry[];
  status: 'active' | 'closed';
  createdAt: string;
}

@Injectable({
  providedIn: 'root'
})
export class ScanSessionService {
  private baseUrl = `${environment.api}/scan-session`;

  constructor(private http: HttpClient, private socket: Socket) { }

  createSession(payload: { supplier?: string; product?: string; reference?: string }): Observable<ScanSession> {
    return this.http.post<ScanSession>(`${this.baseUrl}`, payload);
  }

  getSession(sessionId: string): Observable<ScanSession> {
    return this.http.get<ScanSession>(`${this.baseUrl}/${sessionId}`);
  }

  appendScan(sessionId: string, code: string): Observable<ScanEntry> {
    return this.http.post<ScanEntry>(`${this.baseUrl}/${sessionId}/scan`, { code });
  }

  closeSession(sessionId: string): Observable<ScanSession> {
    return this.http.post<ScanSession>(`${this.baseUrl}/${sessionId}/close`, {});
  }

  joinRoom(sessionId: string): void {
    this.socket.emit('joinScanSession', sessionId);
  }

  emitScanCode(sessionId: string, code: string): void {
    this.socket.emit('scanCode', { sessionId, code });
  }

  onScanError(): Observable<{ sessionId: string; message: string }> {
    return this.socket.fromEvent('scanError');
  }

  leaveRoom(sessionId: string): void {
    this.socket.emit('leaveScanSession', sessionId);
  }

  onScanAdded(): Observable<{ sessionId: string; scan: ScanEntry }> {
    return this.socket.fromEvent('scanAdded');
  }

  onSessionClosed(): Observable<{ sessionId: string }> {
    return this.socket.fromEvent('scanSessionClosed');
  }
}
