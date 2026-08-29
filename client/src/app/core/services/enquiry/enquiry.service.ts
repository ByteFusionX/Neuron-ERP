import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { EnquiryTable, FeedbackTable, FilterEnquiry, MonthlyEnquiry, getEnquiry } from 'src/app/shared/interfaces/enquiry.interface';
import { environment } from 'src/environments/environment';
import { SKIP_ERROR_TOAST } from 'src/app/core/interceptors/error-interceptor/error.interceptor';

// Methods below flagged with context() are called only from components that already
// show their own error toast on failure, so requests opt out of the interceptor's global toast.
const context = () => new HttpContext().set(SKIP_ERROR_TOAST, true);

@Injectable({
  providedIn: 'root'
})
export class EnquiryService {

  readonly api: string = environment.api
  quoteSubject = new BehaviorSubject<getEnquiry | undefined>(undefined)
  enquiryData$ = this.quoteSubject.asObservable()

  depSubject = new BehaviorSubject<string | null>(null)
  departmentData$ = this.depSubject.asObservable()
  constructor(private http: HttpClient) { }

  createEnquiry(formData: FormData): Observable<getEnquiry> {
    return this.http.post<getEnquiry>(`${this.api}/enquiry/create`, formData)
  }

  assignPresale(formData: FormData, enquiryId: string): Observable<{ success: boolean }> {
    return this.http.patch<{ success: boolean }>(`${this.api}/enquiry/presales/${enquiryId}`, formData)
  }

  getEnquiry(filterData: FilterEnquiry): Observable<EnquiryTable> {
    return this.http.post<EnquiryTable>(`${this.api}/enquiry/get`, filterData)
  }

  getPresale(page: number, row: number, filter: string, access?: string, userId?: string): Observable<EnquiryTable> {
    return this.http.get<EnquiryTable>(`${this.api}/enquiry/presales?filter=${filter}&page=${page}&row=${row}&access=${access}&userId=${userId}`)
  }

  updateEnquiryStatus(selectedEnquiry: { id: string, status: string }): Observable<{ update: getEnquiry, quoteId: string | undefined }> {
    return this.http.put<{ update: getEnquiry, quoteId: string | undefined }>(`${this.api}/enquiry/update`, selectedEnquiry)
  }

  rejectJob(enqId: any, comment: string, role: string): Observable<{ success: boolean }> {
    return this.http.put<{ success: boolean }>(`${this.api}/enquiry/presales/reject`, { enqId, comment, role })
  }

  emitToQuote(enquiry: getEnquiry | undefined) {
    this.quoteSubject.next(enquiry)
  }

  monthlyEnquiries(access?: string, userId?: string): Observable<MonthlyEnquiry[]> {
    return this.http.get<MonthlyEnquiry[]>(`${this.api}/enquiry/monthly?access=${access}&userId=${userId}`)
  }

  selectedDepartment(departmentId: string) {
    this.depSubject.next(departmentId)
  }

  uploadEstimations(postBody: any): Observable<{ success: boolean }> {
    return this.http.post<{ success: boolean }>(`${this.api}/enquiry/upload-estimation`, postBody)
  }

  downloadFile(fileName: string): Observable<any> {
    return this.http.get(`${this.api}/file/download?file=${encodeURIComponent(fileName)}`,
      { responseType: 'blob', observe: 'events', reportProgress: true })
  }

  getFile(fileName: string): Observable<any> {
    return this.http.get(`${this.api}/file/${fileName}`, { responseType: 'blob' })
  }

  deleteFile(fileName: string, enquiryId: string) {
    return this.http.delete(`${this.api}/file`, { params: { file: fileName, enquiryId: enquiryId } });
  }

  clearAllPresaleFiles(enquiryId: string) {
    return this.http.delete(`${this.api}/file/clearAll?enquiryId=${enquiryId}`)
  }

  clearEstimations(enquiryId: string) {
    return this.http.delete(`${this.api}/enquiry/presales/estimation/${enquiryId}`)
  }

  sendFeedbackRequest(feedbackBody: { enquiryId: string, employeeId: string, comment: string }) {
    return this.http.patch(`${this.api}/enquiry/feedback-request`, feedbackBody)
  }

  getFeedbackRequests(page: number, row: number, employeeId?: string): Observable<FeedbackTable> {
    return this.http.get<FeedbackTable>(`${this.api}/enquiry/feedback-request/${employeeId}?page=${page}&row=${row}`)
  }

  giveFeedback(feedbackBody: { enquiryId: string, feedback: string, feedbackId: string }) {
    return this.http.patch(`${this.api}/enquiry/give-feedback`, feedbackBody)
  }

  sendRevision(revisionComment: string, enquiryId: string) {
    return this.http.patch(`${this.api}/enquiry/revision/${enquiryId}`, { revisionComment })
  }

  quoteRevision(revisionComment: string, enquiryId: string, quoteId: string) {
    return this.http.patch(`${this.api}/enquiry/quoteRevision/${enquiryId}`, { revisionComment, quoteId })
  }

  presalesCounts(access?: string, userId?: string): Observable<{ pending: number, completed: number }> {
    return this.http.get<{ pending: number, completed: number }>(`${this.api}/enquiry/presales/count?access=${access}&userId=${userId}`)
  }

  markJobAsViewed(jobId: string): Observable<any> {
    return this.http.post(`${this.api}/enquiry/markAsSeenedJob`, { jobId })
  }
  
  markReassignJobAsViewed(jobId: string): Observable<any> {
    return this.http.post(`${this.api}/enquiry/markAsSeenedReassingedJob`, { jobId })
  }

  markAsSeenEstimation(enquiryId: string): Observable<any> {
    return this.http.post(`${this.api}/enquiry/markAsSeenEstimation`, { enquiryId })
  }

  markFeedbackResponseAsViewed(enqId: any, feedbackId: any): Observable<any> {
    return this.http.patch(`${this.api}/enquiry/markAsSeenFeebackResponse`, { enqId, feedbackId })
  }

  markFeedbackAsViewed(enqIds: string): Observable<any> {
    return this.http.post(`${this.api}/enquiry/markAsSeenFeeback`, { enqIds })
  }

  deleteEnquiry(data: { dataId: string, employeeId: string }): Observable<any> {
    return this.http.post<any>(`${this.api}/enquiry/delete`, data, { context: context() });
  }

  reassignjob(data: { enquiryId: string, employeeId: string }): Observable<any> {
    return this.http.put<any>(`${this.api}/enquiry/reassignjob`, data)
  }

  updateEnquiryAttachments(enquiryId: string, formData: FormData): Observable<any> {
    return this.http.patch<any>(`${this.api}/enquiry/${enquiryId}/attachments`, formData)
  }

}
