import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, retry } from 'rxjs';
import { announcementGetData } from 'src/app/shared/interfaces/announcement.interface';
import { environment } from 'src/environments/environment';

@Injectable({ providedIn: 'root' })
export class celebCheckService {
    constructor(private http: HttpClient) { }
    readonly apiUrl = environment.api

    getCelebrationData(): Observable<announcementGetData[]> {        
        return this.http.get<announcementGetData[]>(`${this.apiUrl}/celebrationCheck`)
    }

    markTodaysBirthdaysAsViewed(): void {
        const today = new Date();
        const formattedDate = today.toISOString().split('T')[0];
        localStorage.setItem('todaysBirthdaysViewed', formattedDate);
    }
    
    hasTodaysBirthdaysBeenViewed(): boolean {
        const today = new Date();
        const formattedDate = today.toISOString().split('T')[0];
        const storedDate = localStorage.getItem('todaysBirthdaysViewed');
        return storedDate === formattedDate;
    }

}