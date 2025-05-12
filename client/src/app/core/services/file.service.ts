import { Injectable } from '@angular/core';
import { HttpClient, HttpEventType } from '@angular/common/http';
import { Observable } from 'rxjs';
import { saveAs } from 'file-saver';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class FileService {
  private api = `${environment.api}/file`;

  constructor(private http: HttpClient) { }

  /**
   * Downloads a file from the server
   * @param fileName - Name of the file to download
   * @param originalName - Original name of the file (optional)
   * @returns Observable with download progress and completion
   */
  downloadFile(fileName: string, originalName?: string): Observable<any> {
    return this.http.get(
      `${this.api}/download?file=${encodeURIComponent(fileName)}`,
      { 
        responseType: 'blob', 
        observe: 'events', 
        reportProgress: true 
      }
    );
  }

  /**
   * Handles file download with progress tracking
   * @param fileName - Name of the file to download
   * @param originalName - Original name of the file
   * @param onProgress - Callback function for progress updates
   * @param onError - Callback function for error handling
   */
  downloadFileWithProgress(
    fileName: string, 
    originalName: string,
    onProgress?: (progress: number) => void,
    onError?: (error: any) => void
  ): void {
    this.downloadFile(fileName).subscribe({
      next: (event) => {
        if (event.type === HttpEventType.DownloadProgress) {
          const progress = Math.round(100 * event.loaded / (event.total || event.loaded));
          if (onProgress) {
            onProgress(progress);
          }
        } else if (event.type === HttpEventType.Response) {
          const fileContent: Blob = new Blob([event.body]);
          saveAs(fileContent, originalName || fileName);
          if (onProgress) {
            onProgress(100);
          }
        }
      },
      error: (error) => {
        if (onError) {
          onError(error);
        }
      }
    });
  }
}
