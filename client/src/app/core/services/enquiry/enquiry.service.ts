import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { EnquiryReportDetails, EnquiryReportFilter, EnquiryTable, FeedbackTable, FilterEnquiry, MonthlyEnquiry, getEnquiry } from 'src/app/shared/interfaces/enquiry.interface';
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

  findSimilarEnquiries(client: string, title: string): Observable<{ _id: string; enquiryId: string; title: string; status: string }[]> {
    return this.http.get<{ _id: string; enquiryId: string; title: string; status: string }[]>(`${this.api}/enquiry/similar`, { params: { client, title } })
  }

  getEnquiryReport(filterData: EnquiryReportFilter): Observable<EnquiryReportDetails> {
    return this.http.post<EnquiryReportDetails>(`${this.api}/enquiry/report`, filterData)
  }

  getPresaleReport(filterData: Record<string, unknown>): Observable<PresaleReport> {
    return this.http.post<PresaleReport>(`${this.api}/enquiry/presales/report`, filterData)
  }

  assignPresale(formData: FormData, enquiryId: string): Observable<{ success: boolean }> {
    return this.http.patch<{ success: boolean }>(`${this.api}/enquiry/presales/${enquiryId}`, formData)
  }

  sendToPresale(enquiryId: string): Observable<{ success: boolean }> {
    return this.http.patch<{ success: boolean }>(`${this.api}/enquiry/${enquiryId}/send-to-presale`, {})
  }

  getPresaleTabCounts(access?: string, userId?: string): Observable<PresaleTabCounts> {
    return this.http.get<PresaleTabCounts>(`${this.api}/enquiry/presales/tab-counts?access=${access}&userId=${userId}`)
  }

  getEnquiry(filterData: FilterEnquiry): Observable<EnquiryTable> {
    return this.http.post<EnquiryTable>(`${this.api}/enquiry/get`, filterData)
  }

  getPresale(page: number, row: number, filter: string, access?: string, userId?: string, search?: string, sort?: { key: string | null; direction: string | null }): Observable<EnquiryTable> {
    let url = `${this.api}/enquiry/presales?filter=${filter}&page=${page}&row=${row}&access=${access}&userId=${userId}`;
    if (sort?.key && sort.direction) url += `&sortKey=${sort.key}&sortDir=${sort.direction}`;
    if (search?.trim()) url += `&search=${encodeURIComponent(search.trim())}`;
    return this.http.get<EnquiryTable>(url)
  }

  updateEnquiryStatus(selectedEnquiry: { id: string, status: string, lostReason?: string, competitorName?: string, competitorPriceGap?: string }): Observable<{ update: getEnquiry, quoteId: string | undefined }> {
    return this.http.put<{ update: getEnquiry, quoteId: string | undefined }>(`${this.api}/enquiry/update`, selectedEnquiry)
  }

  addFollowUp(enquiryId: string, data: { date: string; outcome: string; note?: string; nextFollowUpDate?: string | null }): Observable<{ success: boolean; enquiry: getEnquiry }> {
    return this.http.patch<{ success: boolean; enquiry: getEnquiry }>(`${this.api}/enquiry/${enquiryId}/follow-up`, data)
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

  removeEnquiryAttachment(enquiryId: string, fileName: string): Observable<any> {
    return this.http.delete<any>(`${this.api}/enquiry/${enquiryId}/attachments/${fileName}`);
  }

  updateEnquiryAttachments(enquiryId: string, formData: FormData): Observable<any> {
    return this.http.patch<any>(`${this.api}/enquiry/${enquiryId}/attachments`, formData)
  }

}

export interface PresaleTabCounts { new: number; assignedTab: number; rejected: number; completedTab: number; }

export interface PresaleReportRow { id: string; name: string; count: number; new: number; assigned: number; completed: number; rejected: number; }
export interface PresaleReportItem { id: string; enquiryId: string; title: string; customer: string; salesPerson: string; presale: string; status: string; days: number; }
export interface PresaleReport {
  kpi: { count: number; new: number; assigned: number; completed: number; rejected: number; completionRate: number; rejectionRate: number };
  breakdown: { presale: PresaleReportRow[]; department: PresaleReportRow[] };
  avgWaitDays: number | null;
  funnel: { key: string; label: string; count: number; pct: number }[];
  trend: { month: string; received: number; completed: number }[];
  rejectionReasons: { reason: string; count: number }[];
  attention: { new: PresaleReportItem[]; assigned: PresaleReportItem[]; rejected: PresaleReportItem[] };
  generatedAt: string;
}
