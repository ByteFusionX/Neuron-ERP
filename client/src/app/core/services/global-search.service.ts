import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { SKIP_ERROR_TOAST } from 'src/app/core/interceptors/error-interceptor/error.interceptor';

export type SearchModule =
  | 'supplier' | 'product' | 'customer' | 'enquiry' | 'quotation'
  | 'job' | 'purchaseOrder' | 'salesRfq' | 'employee';

/** One record found by the command palette's search. */
export interface SearchHit {
  module: SearchModule;
  id: string;
  title: string;
  subtitle: string;
  ref?: string;
  status?: string;
  score: number;
  data?: Record<string, any>;
}

// The palette shows its own empty/error state; no global error toast while typing.
const context = () => new HttpContext().set(SKIP_ERROR_TOAST, true);

/** Global search across modules, and the records linked to one result. */
@Injectable({ providedIn: 'root' })
export class GlobalSearchService {
  private api = `${environment.api}/search`;

  constructor(private http: HttpClient) {}

  search(q: string, modules?: SearchModule[]): Observable<{ success: boolean; data: SearchHit[] }> {
    const params: Record<string, string> = { q };
    if (modules?.length) params['modules'] = modules.join(',');
    return this.http.get<{ success: boolean; data: SearchHit[] }>(this.api, { params, context: context() });
  }

  related(module: SearchModule, id: string): Observable<{ success: boolean; data: Record<string, any> }> {
    return this.http.get<{ success: boolean; data: Record<string, any> }>(`${this.api}/related/${module}/${id}`, { context: context() });
  }
}
