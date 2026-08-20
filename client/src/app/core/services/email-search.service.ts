import { Injectable } from '@angular/core';
import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { Observable, forkJoin, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { SKIP_ERROR_TOAST } from 'src/app/core/interceptors/error-interceptor/error.interceptor';

// Methods below flagged with context() are called only from components that already
// show their own error toast on failure, so requests opt out of the interceptor's global toast.
const context = () => new HttpContext().set(SKIP_ERROR_TOAST, true);

export interface PersonSearchResult {
  displayName: string;
  emailAddresses: Array<{
    address: string;
    name?: string;
  }>;
  id: string;
}

export interface EmailSuggestion {
  email: string;
  displayName: string;
}

export interface AddContactRequest {
  emailAddresses: Array<{
    address: string;
    name: string;
  }>;
}

@Injectable({
  providedIn: 'root'
})
export class EmailSearchService {
  private readonly CONTACTS_API_URL = 'https://graph.microsoft.com/v1.0/me/contacts';
  private readonly PEOPLE_API_URL = 'https://graph.microsoft.com/v1.0/me/people';

  constructor(private http: HttpClient) {}

  searchPersons(query: string): Observable<EmailSuggestion[]> {
    if (!query.trim()) {
      return of([]);
    }
    
    const params = new HttpParams().set('$search', query);
    
    return forkJoin({
      contacts: this.searchContacts(params),
      people: this.searchPeople(params)
    }).pipe(
      map(({ contacts, people }) => {
        const allSuggestions = [...contacts, ...people];
        return this.getDistinctEmails(allSuggestions);
      }),
      catchError(error => {
        console.error('Error searching persons:', error);
        return of([]);
      })
    );
  }

  private searchContacts(params: HttpParams): Observable<EmailSuggestion[]> {
    return this.http.get<any>(this.CONTACTS_API_URL, { params }).pipe(
      map(response => {
        const persons = response?.value || [];
        return persons
          .map((person: any) => {
            const primaryEmail = person.primaryEmailAddress;
            if (primaryEmail?.address) {
              return {
                email: primaryEmail.address,
                displayName: primaryEmail.name || primaryEmail.address
              };
            }
            return null;
          })
          .filter((suggestion: EmailSuggestion | null) => suggestion !== null);
      }),
      catchError(() => of([]))
    );
  }

  private searchPeople(params: HttpParams): Observable<EmailSuggestion[]> {
    return this.http.get<any>(this.PEOPLE_API_URL, { params }).pipe(
      map(response => {
        const people = response?.value || [];
        const suggestions: EmailSuggestion[] = [];
        
        people.forEach((person: any) => {
          const scoredEmails = person.scoredEmailAddresses || [];
          scoredEmails.forEach((emailObj: any) => {
            if (emailObj.address) {
              suggestions.push({
                email: emailObj.address,
                displayName: person.displayName || emailObj.address
              });
            }
          });
        });
        
        return suggestions;
      }),
      catchError(() => of([]))
    );
  }

  private getDistinctEmails(suggestions: EmailSuggestion[]): EmailSuggestion[] {
    const emailMap = new Map<string, EmailSuggestion>();
    
    suggestions.forEach(suggestion => {
      const email = suggestion.email.toLowerCase();
      if (!emailMap.has(email)) {
        emailMap.set(email, suggestion);
      }
    });
    
    return Array.from(emailMap.values());
  }

  addContact(email: string, displayName?: string): Observable<any> {
    const contact: AddContactRequest = {
      emailAddresses: [
        {
          address: email,
          name: displayName || email
        }
      ]
    };
    
    return this.http.post<any>(this.CONTACTS_API_URL, contact, { context: context() });
  }
} 