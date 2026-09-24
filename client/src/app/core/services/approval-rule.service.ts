import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

export type ApprovalRuleType = 'discount' | 'margin' | 'paymentTerms' | 'creditException' | 'deal';

export interface ApprovalRule {
  _id?: string;
  type: ApprovalRuleType;
  enabled: boolean;
  threshold: number | null;
  approverRole: { _id: string; categoryName: string } | string | null;
}

@Injectable({ providedIn: 'root' })
export class ApprovalRuleService {
  private readonly api: string = environment.api;

  constructor(private http: HttpClient) {}

  getRules(): Observable<{ success: boolean; data: ApprovalRule[] }> {
    return this.http.get<{ success: boolean; data: ApprovalRule[] }>(`${this.api}/approval-rule`);
  }

  saveRule(type: ApprovalRuleType, body: { enabled: boolean; threshold: number | null; approverRole: string | null }): Observable<{ success: boolean; data: ApprovalRule }> {
    return this.http.put<{ success: boolean; data: ApprovalRule }>(`${this.api}/approval-rule/${type}`, body);
  }
}
