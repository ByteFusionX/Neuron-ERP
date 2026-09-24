import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

export interface NotificationEventSetting {
  enabled: boolean;
  email: boolean;
  /** Days before a reminder fires. null for events that are not time-based. */
  afterDays: number | null;
}

export interface NotificationSettings {
  events: Record<string, NotificationEventSetting>;
}

export interface AuditSettings {
  areas: Record<string, boolean>;
  /** null keeps history forever. */
  retentionDays: number | null;
}

type Result<T> = { success: boolean; data: T };

@Injectable({ providedIn: 'root' })
export class SystemSettingService {
  private readonly api: string = environment.api;

  constructor(private http: HttpClient) {}

  getNotifications(): Observable<Result<NotificationSettings>> {
    return this.http.get<Result<NotificationSettings>>(`${this.api}/system-setting/notifications`);
  }

  saveNotifications(body: NotificationSettings): Observable<Result<NotificationSettings>> {
    return this.http.put<Result<NotificationSettings>>(`${this.api}/system-setting/notifications`, body);
  }

  getAudit(): Observable<Result<AuditSettings>> {
    return this.http.get<Result<AuditSettings>>(`${this.api}/system-setting/audit`);
  }

  saveAudit(body: AuditSettings): Observable<Result<AuditSettings>> {
    return this.http.put<Result<AuditSettings>>(`${this.api}/system-setting/audit`, body);
  }
}
