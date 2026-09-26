import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';
import { environment } from 'src/environments/environment';

export type MasterListName = 'paymentTerms' | 'tax' | 'unit' | 'source' | 'industry';

export interface MasterListItem {
  _id: string;
  list: MasterListName;
  label: string;
  value: number | null;
  isActive: boolean;
}

export interface NumberingSeries {
  key: string;
  label: string;
  format: string;
  example: string;
  lastNumber: number;
  nextNumber: number;
}

@Injectable({ providedIn: 'root' })
export class MasterListService {
  private readonly api: string = environment.api;

  constructor(private http: HttpClient) {}

  getItems(list: MasterListName): Observable<{ success: boolean; data: MasterListItem[] }> {
    return this.http.get<{ success: boolean; data: MasterListItem[] }>(`${this.api}/master-list/${list}`);
  }

  /**
   * Active items of a list as select options. `current` keeps a saved value selectable even if
   * it was since deactivated or removed; `fallback` is used while the list is still empty.
   * `useValue` makes the option value the numeric `value` (e.g. tax %) instead of the label.
   */
  getOptions(list: MasterListName, opts: { current?: string | number | null; fallback?: string[]; useValue?: boolean } = {}): Observable<{ label: string; value: any }[]> {
    return this.getItems(list).pipe(
      map((res) => {
        const items = (res.data ?? []).filter((i) => i.isActive);
        let options: { label: string; value: any }[] = items.length
          ? items.map((i) => ({ label: i.label, value: opts.useValue ? i.value : i.label }))
          : (opts.fallback ?? []).map((l) => ({ label: l, value: l }));
        const cur = opts.current;
        if (cur !== null && cur !== undefined && cur !== '' && !options.some((o) => o.value === cur)) {
          options = [{ label: String(cur), value: cur }, ...options];
        }
        return options;
      }),
      catchError(() => of((opts.fallback ?? []).map((l) => ({ label: l, value: l }))))
    );
  }

  createItem(list: MasterListName, body: { label: string; value: number | null }): Observable<{ success: boolean; data: MasterListItem }> {
    return this.http.post<{ success: boolean; data: MasterListItem }>(`${this.api}/master-list/${list}`, body);
  }

  updateItem(list: MasterListName, id: string, body: Partial<Pick<MasterListItem, 'label' | 'value' | 'isActive'>>): Observable<{ success: boolean; data: MasterListItem }> {
    return this.http.put<{ success: boolean; data: MasterListItem }>(`${this.api}/master-list/${list}/${id}`, body);
  }

  deleteItem(list: MasterListName, id: string): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`${this.api}/master-list/${list}/${id}`);
  }

  getNumbering(): Observable<{ success: boolean; data: NumberingSeries[] }> {
    return this.http.get<{ success: boolean; data: NumberingSeries[] }>(`${this.api}/numbering`);
  }

  setNextNumber(key: string, nextNumber: number): Observable<{ success: boolean; data: { key: string; lastNumber: number; nextNumber: number } }> {
    return this.http.put<{ success: boolean; data: { key: string; lastNumber: number; nextNumber: number } }>(`${this.api}/numbering/${key}`, { nextNumber });
  }
}
