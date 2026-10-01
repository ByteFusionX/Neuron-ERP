import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

export interface AuditLogEntry {
  _id: string;
  entityType: string;
  entityId: string;
  entityLabel?: string;
  action: string;
  summary: string;
  changes?: { label: string; from?: string; to?: string }[];
  actorName?: string;
  at: string;
}

export interface AuditLogQuery {
  page?: number;
  limit?: number;
  entityType?: string;
  action?: string;
  actor?: string;
  search?: string;
  from?: string;
  to?: string;
}

export interface AuditLogPage {
  data: AuditLogEntry[];
  total: number;
  page: number;
  limit: number;
  entityTypes: string[];
}

@Injectable({ providedIn: 'root' })
export class AuditLogService {
  private readonly api: string = environment.api;

  constructor(private http: HttpClient) {}

  /** History of one record in any module; newest first. */
  getHistory(entityType: string, entityId: string): Observable<AuditLogEntry[]> {
    return this.http.get<AuditLogEntry[]>(`${this.api}/audit-log/${entityType}/${entityId}`);
  }

  /** Cross-module log for the Settings page. */
  list(query: AuditLogQuery): Observable<AuditLogPage> {
    const params: Record<string, string> = {};
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') params[key] = String(value);
    });
    return this.http.get<AuditLogPage>(`${this.api}/audit-log`, { params });
  }
}
