import { AfterViewInit, Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute } from '@angular/router';
import { NgSwitch, NgSwitchCase } from '@angular/common';
import { BehaviorSubject, Subscription } from 'rxjs';
import { EnquiryService } from 'src/app/core/services/enquiry/enquiry.service';
import { Estimations, feedback, getEnquiry } from 'src/app/shared/interfaces/enquiry.interface';
import { saveAs } from 'file-saver';
import { ToastrService } from 'ngx-toastr';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { HttpEventType } from '@angular/common/http';
import { ViewFeedbackComponent } from '../view-feedback/view-feedback.component';
import { ViewEstimationComponent } from '../view-estimation/view-estimation.component';
import { DataGridComponent } from 'src/app/shared/components/data-grid/data-grid.component';
import { DataGridBreadcrumb, DataGridColumn, DataGridDetailTab, DataGridQuery, DataGridRowAction, DataGridRowActionEvent } from 'src/app/shared/components/data-grid/data-grid.model';
import { DetailOverviewComponent } from 'src/app/shared/components/detail-panel/detail-overview.component';
import { DetailCommentsComponent } from 'src/app/shared/components/detail-panel/detail-comments.component';
import { DetailDocumentsComponent } from 'src/app/shared/components/detail-panel/detail-documents.component';
import { DetailComment, DetailDocument, DetailOverviewSection } from 'src/app/shared/components/detail-panel/detail-panel.model';

@Component({
  selector: 'app-completed-jobs-list',
  templateUrl: './completed-jobs-list.component.html',
  imports: [NgSwitch, NgSwitchCase, DataGridComponent, DetailOverviewComponent, DetailCommentsComponent, DetailDocumentsComponent, ViewEstimationComponent]
})
export class CompletedJobsListComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('grid') grid!: DataGridComponent<any>;

  rows: any[] = [];
  columns: DataGridColumn<any>[] = [];
  rowActions: DataGridRowAction<any>[] = [];
  detailTabs: DataGridDetailTab[] = [
    { id: 'overview', label: 'Details', icon: 'info' },
    { id: 'comments', label: 'Comments', icon: 'chat' },
    { id: 'documents', label: 'Documents', icon: 'files' },
  ];
  breadcrumbs: DataGridBreadcrumb[] = [{ label: 'Home', link: '/' }];
  detailLoading = false;

  isLoading: boolean = true;
  subscriptions = new Subscription();

  page: number = 1;
  row: number = 10;
  total: number = 0;
  searchQuery: string = '';

  constructor(
    private _enquiryService: EnquiryService,
    private _dialog: MatDialog,
    private toast: ToastrService,
    private _employeeService: EmployeeService,
    private _route: ActivatedRoute) { }

  ngOnInit(): void {
    this.buildColumns();
    this.buildRowActions();
    this._route.queryParams.subscribe((params) => {
      this.initialPage = params['page'] ? parseInt(params['page'], 10) : 1;
    });
    this.getJobsData();
  }

  /** Deep-links `?page=` into the grid's own client-side pager, same pattern as quotation-list. */
  ngAfterViewInit(): void {
    if (this.grid && this.initialPage > 1) this.grid.page = this.initialPage;
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  private initialPage = 1;

  private buildColumns(): void {
    this.columns = [
      { key: 'enqId', label: 'Enquiry ID', valueGetter: (r) => r.enquiryId, cellClass: () => 'text-violet-500' },
      { key: 'customerName', label: 'Customer Name', valueGetter: (r) => r.client?.[0]?.companyName },
      { key: 'description', label: 'Description', valueGetter: (r) => r.title },
      { key: 'assignedBy', label: 'Ass. By', valueGetter: (r) => `${r.salesPerson?.[0]?.firstName ?? ''} ${r.salesPerson?.[0]?.lastName ?? ''}`.trim() },
      { key: 'department', label: 'Depart.', valueGetter: (r) => r.department?.[0]?.departmentName },
    ];
  }

  private buildRowActions(): void {
    this.rowActions = [
      {
        id: 'viewEstimation', label: 'View Estimation', icon: 'eye', quick: true,
        hidden: (r) => !r.preSale?.estimations,
      },
      {
        id: 'viewFeedback', label: 'View Feedback', icon: 'eye', quick: true,
        hidden: (r) => !r.preSale?.feedback,
      },
    ];
  }

  onRowAction(event: DataGridRowActionEvent<any>): void {
    const { action, row } = event;
    switch (action.id) {
      case 'viewEstimation': this.onViewEstimation(row.preSale?.estimations, row._id); break;
      case 'viewFeedback': this.viewFeedback(row); break;
    }
  }

  getJobsData() {
    let access;
    let userId;
    this._employeeService.employeeData$.subscribe((employee) => {
      access = employee?.category.privileges.assignedJob.viewReport
      userId = employee?._id
    })

    this.isLoading = true;
    this.subscriptions.add(
      this._enquiryService.getPresale(this.page, this.row, 'completed', access, userId, this.searchQuery).subscribe({
        next: (data) => {
          this.rows = data.enquiry;
          this.total = data.total;
          this.isLoading = false;
        },
        error: () => {
          this.isLoading = false;
        }
      })
    )
  }

  onQueryChange(query: DataGridQuery): void {
    this.page = query.page;
    this.row = query.pageSize;
    this.searchQuery = query.search;
    this.getJobsData();
  }

  onRowOpen(row: any): void {
    this.detailLoading = true;
    setTimeout(() => (this.detailLoading = false), 250);
  }

  rowTitle = (r: any) => r.enquiryId ?? '';
  rowSubtitle = (r: any) => r.client?.[0]?.companyName ?? '';

  overviewSections(row: any): DetailOverviewSection[] {
    return [
      {
        title: 'General',
        columns: '2',
        fields: [
          { type: 'field', label: 'Enquiry Id', value: row.enquiryId, numeric: true },
          { type: 'field', label: 'Customer', value: row.client?.[0]?.companyName },
          { type: 'field', label: 'Description', value: row.title },
          { type: 'field', label: 'Assigned By', value: `${row.salesPerson?.[0]?.firstName ?? ''} ${row.salesPerson?.[0]?.lastName ?? ''}`.trim() },
          { type: 'field', label: 'Department', value: row.department?.[0]?.departmentName },
        ],
      },
    ];
  }

  commentsFor(row: any): DetailComment[] {
    const list: DetailComment[] = [];
    const assignedByName = row.salesPerson?.[0] ? `${row.salesPerson[0].firstName} ${row.salesPerson[0].lastName}` : 'Sales Person';
    if (row.preSale?.comment) {
      list.push({ text: row.preSale.comment, by: assignedByName, date: row.date });
    }
    (row.preSale?.revisionComment || []).forEach((c: string) => {
      list.push({ text: c, by: 'Revision', date: row.date });
    });
    return list;
  }

  // ---- Documents tab: presale files -----------------------------------------------------

  presaleDocuments(row: any): DetailDocument[] {
    return (row.preSale?.presaleFiles || []).map((file: any) => ({
      id: file.fileName,
      name: file.originalname,
      kind: this.fileKind(file),
    }));
  }

  fileKind(file: any): string {
    const name: string = file?.originalname || file?.fileName || '';
    const ext = name.split('.').pop();
    return ext ? ext.toUpperCase().slice(0, 4) : 'FILE';
  }

  private findPresaleFile(row: any, doc: DetailDocument): any {
    return row.preSale?.presaleFiles?.find((f: any) => f.fileName === doc.id);
  }

  onDocPreview(row: any, doc: DetailDocument): void {
    const file = this.findPresaleFile(row, doc);
    if (file) { this.previewFile(file); }
  }

  onDocDownload(row: any, doc: DetailDocument): void {
    const file = this.findPresaleFile(row, doc);
    if (file) { this.onDownloadClicks(file); }
  }

  previewFile(file: any): void {
    this._enquiryService.getFile(file.fileName).subscribe({
      next: (blob: Blob) => {
        const url = window.URL.createObjectURL(blob);
        window.open(url, '_blank');
        setTimeout(() => window.URL.revokeObjectURL(url), 60000);
      },
      error: (error) => {
        if (error.status === 404) {
          this.toast.warning('Sorry, the requested file was not found on the server.');
        } else {
          this.toast.error('An error occurred while opening the file.');
        }
      }
    });
  }

  onDownloadClicks(file: any) {
    this.subscriptions.add(
      this._enquiryService.downloadFile(file.fileName)
        .subscribe({
          next: (event) => {
            if (event.type === HttpEventType.Response) {
              const fileContent: Blob = new Blob([event['body']])
              saveAs(fileContent, file.originalname)
            }
          },
          error: (error) => {
            if (error.status == 404) {
              this.toast.warning('Sorry, The requested file was not found on the server. Please ensure that the file exists and try again.')
            }
          }
        })
    )
  }

  estimationTarget: { estimation: Estimations; enqId: string } | null = null;

  onViewEstimation(estimation: Estimations, enqId: string) {
    this.estimationTarget = { estimation, enqId };
  }

  viewFeedback(row: any) {
    this._dialog.open(ViewFeedbackComponent, {
      data: { feedback: row.preSale.feedback, enqId: row._id },
      width: '400px'
    })
  }
}
