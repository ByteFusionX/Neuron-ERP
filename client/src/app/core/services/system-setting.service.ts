import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

export interface AuditSettings {
  areas: Record<string, boolean>;
  /** null keeps history forever. */
  retentionDays: number | null;
}

export interface QuotationTemplateSettings {
  title: string;
  primaryColor: string;
  openingText: string;
  showOpening: boolean;
  showCommercialTerms: boolean;
  showTerms: boolean;
  showNotes: boolean;
  includeStampByDefault: boolean;
}

export interface DocumentSettings {
  quotation: QuotationTemplateSettings;
}

type Result<T> = { success: boolean; data: T };

@Injectable({ providedIn: 'root' })
export class SystemSettingService {
  private readonly api: string = environment.api;

  constructor(private http: HttpClient) {}

  getAudit(): Observable<Result<AuditSettings>> {
    return this.http.get<Result<AuditSettings>>(`${this.api}/system-setting/audit`);
  }

  saveAudit(body: AuditSettings): Observable<Result<AuditSettings>> {
    return this.http.put<Result<AuditSettings>>(`${this.api}/system-setting/audit`, body);
  }

  getDocuments(): Observable<Result<DocumentSettings>> {
    return this.http.get<Result<DocumentSettings>>(`${this.api}/system-setting/documents`);
  }

  saveDocuments(body: DocumentSettings): Observable<Result<DocumentSettings>> {
    return this.http.put<Result<DocumentSettings>>(`${this.api}/system-setting/documents`, body);
  }
}
