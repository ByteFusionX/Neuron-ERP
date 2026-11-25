import { Injectable, inject } from '@angular/core';
import { ToastrService } from 'ngx-toastr';
import { HttpClient, HttpEventType } from '@angular/common/http';
import { Observable } from 'rxjs';
import { saveAs } from 'file-saver';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class FileService {
  private api = `${environment.api}/file`;

  private toastr = inject(ToastrService);

  constructor(private http: HttpClient) { }

  /** Types the browser can show in a tab; anything else (Excel, Word, zip...) is saved instead. */
  private static readonly PREVIEW_MIME: Record<string, string> = {
    pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
    webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', txt: 'text/plain', csv: 'text/plain',
  };

  /**
   * Opens a stored file straight away: PDFs, images and text in a new tab, other types download
   * under their original name. The tab is opened before the fetch so popup blockers allow it.
   */
  openFile(fileName: string, originalName?: string): void {
    if (!fileName) return;
    const name = originalName || fileName;
    const ext = (fileName.split('.').pop() || name.split('.').pop() || '').toLowerCase();
    const mime = FileService.PREVIEW_MIME[ext];
    const tab = mime ? window.open('', '_blank') : null;
    this.http.get(`${this.api}/${encodeURIComponent(fileName)}`, { responseType: 'blob' }).subscribe({
      next: (blob) => {
        if (!mime) { saveAs(blob, name); return; }
        // S3 often serves octet-stream, which makes the browser download instead of preview.
        const url = URL.createObjectURL(new Blob([blob], { type: mime }));
        if (tab) tab.location.href = url; else window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      },
      error: (error) => {
        tab?.close();
        if (error?.status === 404) this.toastr.warning('Sorry, the requested file was not found on the server.');
        else this.toastr.error('An error occurred while opening the file.');
      },
    });
  }

  /**
   * Downloads a file from the server
   * @param fileName - Name of the file to download
   * @param originalName - Original name of the file (optional)
   * @returns Observable with download progress and completion
   */
  // NOTE: some callers already show their own error toast; global interceptor toast may duplicate there — needs per-call-site handling, not done here.
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
