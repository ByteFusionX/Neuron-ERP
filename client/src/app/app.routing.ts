import { NgModule, inject } from '@angular/core';
import { Router, RouterModule, Routes } from '@angular/router';
import { LoginGuard } from './core/guards/login/login.guard';
import { AuthGuard } from './core/guards/auth/auth.guard';
import { RoleGuard } from './core/guards/role/role.guard';
import { AnnouncementsComponent } from './modules/announcements/announcements.component';
import { ViewEmployeeComponent } from './modules/employees/view-employee/view-employee.component';
import { EmployeesComponent } from './modules/employees/employees.component';
import { HomeLandingComponent } from './modules/home/pages/home-landing/home-landing.component';
import { CustomersListComponent } from './modules/customers/pages/customers-list/customers-list.component';
import { AssignedJobsListComponent } from './modules/assigned-jobs/pages/assigned-jobs-list/assigned-jobs-list.component';
import { UploadEstimationComponent } from './modules/assigned-jobs/pages/upload-estimation/upload-estimation.component';
import { QuotationViewComponent } from './modules/quotations/pages/quotation-view/quotation-view.component';
import { QuotationListComponent } from './modules/quotations/pages/quotation-list/quotation-list.component';
import { DealSheetListComponent } from './modules/deal-sheet/pages/deal-sheet-list/deal-sheet-list.component';
import { ViewDealsheetComponent } from './modules/deal-sheet/view-dealsheet/view-dealsheet.component';
import { JobListComponent } from './modules/job-sheet/pages/job-list/job-list.component';
import { ProfileInfoComponent } from './modules/profile/pages/profile-info/profile-info.component';
import { PendingSuppliersComponent } from './modules/suppliers/pages/pending-suppliers/pending-suppliers.component';
import { CreateSupplierComponent } from './modules/suppliers/pages/create-supplier/create-supplier.component';
import { SupplierViewComponent } from './modules/suppliers/pages/supplier-view/supplier-view.component';
import { PendingPurchaseComponent } from './modules/purchase/pages/pendings-purchase/pendings-purchase.component';
import { ApprovedPurchaseComponent } from './modules/purchase/pages/approved-purchase/approved.component';
import { CreatePurchaseComponent } from './modules/purchase/pages/create-purchase/create-purchase.component';
import { SupplierDiscountComponent } from './modules/purchase/pages/supplier-discount/supplier-discount.component';
import { ComparisonSheetComponent } from './modules/purchase/pages/comparison-sheet/comparison-sheet.component';
import { ViewPurchaseComponent } from './modules/purchase/pages/view-purchase/view-purchase.component';
import { OpenToWorckComponent } from './modules/job-sheet/pages/open-to-work/open-to-work.component';
import { ComparisonSummaryComponent } from './modules/purchase/pages/comparison-summary/comparison-summary.component';
import { InitiateLpoComponent } from './modules/purchase-order/pages/initiate-lpo/initiate-lpo.component';
import { IssueLpoComponent } from './modules/purchase-order/pages/issue-lpo/issue-lpo.component';
import { LpoListComponent } from './modules/purchase-order/pages/lpo-list/lpo-list.component';
import { LpoApprovalComponent } from './modules/purchase-order/pages/lpo-approval/lpo-approval.component';
import { ViewLpoComponent } from './modules/purchase-order/pages/view-lpo/view-lpo.component';
import { CreateGrnComponent } from './modules/grn/pages/create-grn/create-grn.component';
import { ViewGrnComponent } from './modules/grn/pages/view-grn/view-grn.component';
import { GrnListComponent } from './modules/grn/pages/grn-list/grn-list.component';
import { GrnStockHoldsComponent } from './modules/grn/pages/stock-holds/stock-holds.component';
import { MrApprovalRequestsComponent } from './modules/technical/mr-approval-requests/mr-approval-requests.component';
import { ViewMaterialRequestComponent } from './modules/technical/view-material-request/view-material-request.component';
import { ProjectsComponent } from './modules/technical/projects/projects.component';
import { AddProjectComponent } from './modules/technical/projects/add-project/add-project.component';
import { OpenToWorkProjectComponent } from './modules/technical/open-to-work/open-to-work-project.component';
import { ActivityPlanComponent } from './modules/technical/projects/add-project/activity-plan/activity-plan.component';
import { MaterialRequestModalComponent } from './modules/technical/projects/add-project/material-request-modal/material-request-modal.component';
import { TasksComponent } from './modules/technical/projects/add-project/tasks/tasks.component';
import { IssuesListComponent } from './modules/technical/projects/add-project/issues/list/issues-list.component';
import { ProjectUpdatesComponent } from './modules/technical/projects/add-project/project-updates/project-updates.component';
import { ViewProjectUpdateComponent } from './modules/technical/projects/add-project/project-updates/view-project-update/view-project-update.component';
import { ClaimsComponent } from './modules/claims/claims.component';
import { BillingSummaryComponent } from './modules/technical/projects/add-project/billing-summary/billing-summary.component';
import { RequestForApprovalsComponent } from './modules/claims/request-for-approvals/request-for-approvals.component';
import { AllProductsComponent } from './modules/products/all-products.component';
import { StockEntriesComponent } from './modules/stocks/pages/stock-entries/stock-entries.component';
import { StockHoldsComponent } from './modules/stocks/pages/stock-holds/stock-holds.component';
import { CreateStockComponent } from './modules/stocks/modals/create-stock/create-stock.component';
import { DnRegisterComponent } from './modules/dispatch/pages/dn-register/dn-register.component';
import { CreateDnComponent } from './modules/dispatch/pages/create-dn/create-dn.component';
import { PendingDeliveryComponent } from './modules/dispatch/pages/pending-delivery/pending-delivery.component';
import { InvoiceLinkingComponent } from './modules/dispatch/pages/invoice-linking/invoice-linking.component';
import { InventoryDeductionComponent } from './modules/dispatch/pages/inventory-deduction/inventory-deduction.component';
import { DeliveryNoteViewComponent } from './modules/dispatch/pages/delivery-note-view/delivery-note-view.component';
import { InvoiceRegisterComponent } from './modules/invoice/pages/invoice-register/invoice-register.component';
import { CreateInvoiceComponent } from './modules/invoice/pages/create-invoice/create-invoice.component';
import { InvoiceDnLinkingComponent } from './modules/invoice/pages/invoice-dn-linking/invoice-dn-linking.component';
import { CancelledInvoicesComponent } from './modules/invoice/pages/cancelled-invoices/cancelled-invoices.component';

export const routes: Routes = [
  { path: '', redirectTo: 'home', pathMatch: 'full' },
  {
    path: 'home',
    canActivate: [AuthGuard],
    loadComponent: () => import('./modules/home/home.component').then((c) => c.HomeComponent),
    children: [
      { path: '', component: HomeLandingComponent },
      { path: 'projects/:id', loadComponent: () => import('./modules/home/pages/project-detail/project-detail.component').then((c) => c.ProjectDetailComponent) },
    ],
  },
  {
    path: 'dashboard',
    canActivate: [AuthGuard],
    loadComponent: () => import('./modules/dashboard/dashboard.component').then((c) => c.DashboardComponent),
  },
  {
    path: 'announcements',
    canActivate: [AuthGuard, RoleGuard],
    component: AnnouncementsComponent,
  },
  {
    path: 'hr',
    canActivate: [AuthGuard],
    loadComponent: () => import('./modules/hr/hr.component').then((c) => c.HrComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'employees' },
      { path: 'departments', canActivate: [RoleGuard], loadComponent: () => import('./modules/hr/pages/hr-departments/hr-departments.component').then((c) => c.HrDepartmentsComponent) },
      { path: 'departments/overview', redirectTo: 'departments' },
      { path: 'roles-privileges', canActivate: [RoleGuard], loadComponent: () => import('./modules/hr/pages/hr-roles-privileges/hr-roles-privileges.component').then((c) => c.HrRolesPrivilegesComponent) },
      { path: 'employees', canActivate: [RoleGuard], component: EmployeesComponent },
      { path: 'employees/view/:employeeId', canActivate: [RoleGuard], component: ViewEmployeeComponent },
      { path: 'employees/category/create', canActivate: [RoleGuard], loadComponent: () => import('./modules/employees/create-category/create-category.component').then((c) => c.CreateCategoryComponent) },
    ],
  },
  { path: 'employees', redirectTo: 'hr/employees', pathMatch: 'full' },
  {
    path: 'customers',
    canActivate: [AuthGuard],
    loadComponent: () => import('./modules/customers/customers.component').then((c) => c.CustomersComponent),
    children: [
      { path: '', canActivate: [RoleGuard], component: CustomersListComponent },
    ]
  },
  {
    path: 'enquiry',
    canActivate: [AuthGuard, RoleGuard],
    loadComponent: () => import('./modules/enquirys/enquiry.component').then((c) => c.EnquiryComponent),
    children: [
      { path: '', loadComponent: () => import('./modules/enquirys/pages/enquiry-list/enquiry-list.component').then((c) => c.EnquiryListComponent) },
      { path: 'report', loadComponent: () => import('./modules/enquirys/pages/enquiry-report/enquiry-report.component').then((c) => c.EnquiryReportComponent) }
    ]
  },
  {
    path: 'assigned-jobs',
    canActivate: [AuthGuard, RoleGuard],
    loadComponent: () => import('./modules/assigned-jobs/assigned-jobs.component').then((c) => c.AssignedJobsComponent),
    children: [
      { path: '', component: AssignedJobsListComponent },
      { path: 'report', loadComponent: () => import('./modules/assigned-jobs/pages/presale-report/presale-report.component').then((c) => c.PresaleReportComponent) },
      { path: 'upload-estimations', component: UploadEstimationComponent },
      { path: 'edit-estimations', component: UploadEstimationComponent },
      { path: 'completed', redirectTo: () => inject(Router).parseUrl('/assigned-jobs?tab=completed') },
      { path: 'reassigned', redirectTo: () => inject(Router).parseUrl('/assigned-jobs?tab=assigned') }
    ]
  },
  {
    path: 'quotations',
    canActivate: [AuthGuard],
    loadComponent: () => import('./modules/quotations/quotations.component').then((c) => c.QuotationsComponent),
    children: [
      { path: '', canActivate: [RoleGuard], component: QuotationListComponent },
      {
        path: 'report', canActivate: [RoleGuard],
        loadComponent: () => import('./modules/quotations/pages/quotation-report/quotation-report.component').then((c) => c.QuotationReportComponent),
      },
      { path: 'view/:id', canActivate: [RoleGuard], component: QuotationViewComponent }
    ]
  },
  {
    path: 'deal-sheet',
    canActivate: [AuthGuard],
    loadComponent: () => import('./modules/deal-sheet/deal-sheet.component').then((c) => c.DealSheetComponent),
    children: [
      { path: '', redirectTo: 'dealsheets', pathMatch: 'full' },
      { path: 'dealsheets', canActivate: [RoleGuard], component: DealSheetListComponent, data: { view: 'all' } },
      { path: 'pendings', canActivate: [RoleGuard], component: DealSheetListComponent, data: { view: 'pending' } },
      { path: 'approved', canActivate: [RoleGuard], component: DealSheetListComponent, data: { view: 'approved' } },
      { path: 'rejecteds', canActivate: [RoleGuard], component: DealSheetListComponent, data: { view: 'rejected' } },
      { path: 'revokeds', canActivate: [RoleGuard], component: DealSheetListComponent, data: { view: 'revoked' } },
      { path: 'view/:id', canActivate: [RoleGuard], component: ViewDealsheetComponent },
    ]
  },
  {
    path: 'job-sheet',
    canActivate: [AuthGuard, RoleGuard],
    loadComponent: () => import('./modules/job-sheet/job-sheet.component').then((c) => c.JobSheetComponent),
    children: [
      { path: '', redirectTo: 'pending', pathMatch: 'full' },
      { path: 'pending', canActivate: [RoleGuard], component: JobListComponent },
      { path: 'open-to-work', canActivate: [RoleGuard], component: OpenToWorckComponent },
      { path: 'in-progress', canActivate: [RoleGuard], component: OpenToWorckComponent },
      { path: 'completed', canActivate: [RoleGuard], component: JobListComponent },
    ]
  },
  {
    path: 'profile',
    canActivate: [AuthGuard],
    loadComponent: () => import('./modules/profile/profile.component').then((c) => c.ProfileComponent),
    children: [
      { path: '', component: ProfileInfoComponent }
    ]
  },
  {
    path: 'settings',
    canActivate: [AuthGuard],
    loadComponent: () => import('./modules/settings/settings-shell.component').then((c) => c.SettingsShellComponent),
    children: [
      // Empty on purpose: the shell redirects to the first section the user can see.
      { path: '', pathMatch: 'full', children: [] },
      {
        path: 'general',
        data: { section: 'general' },
        loadComponent: () => import('./modules/settings/pages/general-settings/general-settings.component').then((c) => c.GeneralSettingsComponent),
      },
      {
        path: 'notes-terms',
        pathMatch: 'full',
        redirectTo: 'master-data',
      },
      {
        path: 'master-data',
        data: { section: 'master-data' },
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'customer' },
          { path: 'customer', loadComponent: () => import('./modules/settings/pages/master-data/customer-data.component').then((c) => c.CustomerDataComponent) },
          { path: 'product', loadComponent: () => import('./modules/settings/pages/master-data/product-data.component').then((c) => c.ProductDataComponent) },
          { path: 'purchase', loadComponent: () => import('./modules/settings/pages/master-data/purchase-data.component').then((c) => c.PurchaseDataComponent) },
          { path: 'sales-documents', loadComponent: () => import('./modules/settings/pages/master-data/sales-documents.component').then((c) => c.SalesDocumentsComponent) },
          { path: 'notes-terms', loadComponent: () => import('./modules/settings/pages/master-data/notes-terms-data.component').then((c) => c.NotesTermsDataComponent) },
          { path: 'responsibilities', loadComponent: () => import('./modules/settings/pages/master-data/responsibilities.component').then((c) => c.ResponsibilitiesComponent) },
        ],
      },
      {
        path: 'approval-rules',
        data: { section: 'approval-rules' },
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'rules' },
          { path: 'rules', loadComponent: () => import('./modules/settings/pages/approval-rules/approval-rules.component').then((c) => c.ApprovalRulesComponent) },
          { path: 'workflow', loadComponent: () => import('./modules/settings/pages/approval-rules/approval-workflow.component').then((c) => c.ApprovalWorkflowComponent) },
          { path: 'limits', loadComponent: () => import('./modules/settings/pages/approval-rules/approval-limits.component').then((c) => c.ApprovalLimitsComponent) },
        ],
      },
      {
        path: 'numbering',
        data: { section: 'numbering' },
        loadComponent: () => import('./modules/settings/pages/numbering/numbering.component').then((c) => c.NumberingComponent),
      },
      {
        path: 'notifications',
        data: { section: 'notifications' },
        loadComponent: () => import('./modules/settings/pages/notifications/notification-settings.component').then((c) => c.NotificationSettingsComponent),
      },
      {
        path: 'audit',
        data: { section: 'audit' },
        loadComponent: () => import('./modules/settings/pages/audit/audit-settings.component').then((c) => c.AuditSettingsComponent),
      },
    ]
  },
  {
    path: 'feedback-requests',
    canActivate: [AuthGuard],
    loadComponent: () => import('./modules/feedback-requests/feedback-requests.component').then((c) => c.FeedbackRequestsComponent)
  },
  {
    path: 'bug-reports',
    canActivate: [AuthGuard],
    loadComponent: () => import('./modules/bug-reports/bug-reports.component').then((c) => c.BugReportsComponent)
  },
  {
    path: 'login',
    canActivate: [LoginGuard],
    loadComponent: () => import('./modules/login/pages/login-page/login-page.component').then((c) => c.LoginPageComponent)
  },
  {
    path: 'recycle',
    canActivate: [AuthGuard],
    loadComponent: () => import('./modules/recycle/recycle.component').then((c) => c.RecycleComponent)
  },
  {
    path: 'finance',
    canActivate: [AuthGuard],
    loadComponent: () => import('./modules/finance/finance.component').then((c) => c.FinanceComponent),
    children: [
      { path: '', pathMatch: 'full', loadComponent: () => import('./modules/finance/pages/finance-home/finance-home.component').then((c) => c.FinanceHomeComponent) },
    ]
  },
  {
    path: 'suppliers',
    canActivate: [AuthGuard],
    loadComponent: () => import('./modules/suppliers/suppliers.component').then((c) => c.SuppliersComponent),
    children: [
      { path: 'pendings', component: PendingSuppliersComponent },
      { path: 'approved', component: PendingSuppliersComponent },
      { path: 'create', component: CreateSupplierComponent },
      { path: 'edit/:id', component: CreateSupplierComponent },
      { path: ':id', component: SupplierViewComponent }
    ]
  },
  {
    path: 'purchase',
    canActivate: [AuthGuard, RoleGuard],
    loadComponent: () => import('./modules/purchase/purchase.component').then((c) => c.PurchaseComponent),
    children: [
      { path: 'pendings', component: PendingPurchaseComponent },
      { path: 'approves', component: ApprovedPurchaseComponent },
      { path: 'create', component: CreatePurchaseComponent },
      { path: 'supplier-discount/:purchaseId', component: SupplierDiscountComponent },
      { path: 'comparison-sheet/:purchaseId', component: ComparisonSheetComponent },
      { path: 'view-purchase/:id', component: ViewPurchaseComponent },
      { path: 'comparison-summary/:purchaseId', component: ComparisonSummaryComponent },
      { path: 'initiate-lpo/:id', component: InitiateLpoComponent },
      { path: 'issue-lpo/:id', component: IssueLpoComponent },
      { path: 'issue-lpo/:id/edit/:lpoId', component: IssueLpoComponent },
      { path: 'issue-lpo/:id/reissue/:lpoId', component: IssueLpoComponent },
      { path: 'edit/:id', component: CreatePurchaseComponent }
    ]
  },
  {
    path: 'purchase-order',
    canActivate: [AuthGuard, RoleGuard],
    loadComponent: () => import('./modules/purchase-order/purchase-order.component').then((c) => c.PurchaseOrderComponent),
    children: [
      { path: 'pending-approval', component: LpoApprovalComponent },
      { path: 'approved', component: LpoApprovalComponent },
      { path: 'view-lpo/:id', component: ViewLpoComponent }
    ]
  },
  {
    path: 'grn',
    canActivate: [AuthGuard, RoleGuard],
    loadComponent: () => import('./modules/grn/grn.component').then((c) => c.GrnComponent),
    children: [
      { path: 'create-grn', component: CreateGrnComponent },
      { path: 'create-grn/:lpoId', component: CreateGrnComponent },
      { path: 'view-grn/:id', component: ViewGrnComponent },
      { path: 'grn-list', component: GrnListComponent },
      { path: 'stock-holds', component: GrnStockHoldsComponent }
    ]
  },
  {
    path: 'technical',
    canActivate: [AuthGuard, RoleGuard],
    loadComponent: () => import('./modules/technical/technical.component').then((c) => c.TechnicalComponent),
    children: [
      { path: 'project', component: ProjectsComponent },
      { path: 'amc', component: ProjectsComponent },
      { path: 'project/add', component: AddProjectComponent, canDeactivate: [(component: AddProjectComponent) => component.canDeactivate()] },
      { path: 'project/edit/:id', component: AddProjectComponent, canDeactivate: [(component: AddProjectComponent) => component.canDeactivate()] },
      { path: 'project/activity-plan/:id', component: ActivityPlanComponent },
      { path: 'project/material-request/:id', component: MaterialRequestModalComponent },
      { path: 'project/updates/:id', component: ProjectUpdatesComponent },
      { path: 'project/updates/:technicalId/:updateId', component: ViewProjectUpdateComponent },
      { path: 'project/tasks/:id', component: TasksComponent },
      { path: 'project/issues/:id', component: IssuesListComponent },
      { path: 'project/claims/:id', component: ClaimsComponent },
      { path: 'project/billing-summary/:id', component: BillingSummaryComponent },
      { path: 'open-to-work-project', component: OpenToWorkProjectComponent },
      { path: 'mr-approval-requests', component: MrApprovalRequestsComponent },
      { path: 'mr-approval-requests/view/:id', component: ViewMaterialRequestComponent }
    ]
  },
  {
    path: 'claims',
    canActivate: [AuthGuard, RoleGuard],
    // loadComponent: () => import('./modules/claims/claims.component').then((c) => c.ClaimsComponent),
    children: [
      { path: 'my-claims', component: ClaimsComponent },
      { path: 'approval-requests', component: RequestForApprovalsComponent }
    ]
  },
  {
    path: 'products',
    canActivate: [AuthGuard],
    children: [
      { path: '', component: AllProductsComponent }
    ]
  },
  {
    path: 'stocks',
    pathMatch: 'full',
    redirectTo: 'stock/stock-entries'
  },
  {
    path: 'stock',
    canActivate: [AuthGuard],
    loadComponent: () => import('./modules/stocks/stocks.component').then((c) => c.StocksComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'stock-entries' },
      { path: 'stock-entries', component: StockEntriesComponent },
      { path: 'stock-holds', component: StockHoldsComponent },
      { path: 'create', component: CreateStockComponent }
    ]
  },
  {
    path: 'dispatch',
    canActivate: [AuthGuard, RoleGuard],
    loadComponent: () => import('./modules/dispatch/dispatch.component').then((c) => c.DispatchComponent),
    children: [
      { path: 'delivery-note-register', component: DnRegisterComponent },
      { path: 'delivery-note-register/create', component: CreateDnComponent },
      { path: 'delivery-note-register/view/:id', component: DeliveryNoteViewComponent },
      { path: 'pending-delivery-reports', component: PendingDeliveryComponent },
      { path: 'invoice-linking-report', component: InvoiceLinkingComponent },
      { path: 'inventory-deduction-report', component: InventoryDeductionComponent },
    ]
  },
  {
    path: 'invoice',
    canActivate: [AuthGuard, RoleGuard],
    loadComponent: () => import('./modules/invoice/invoice.component').then((c) => c.InvoiceComponent),
    children: [
      { path: 'invoice-register', component: InvoiceRegisterComponent },
      { path: 'invoice-register/create', component: CreateInvoiceComponent },
      { path: 'invoice-register/edit/:id', component: CreateInvoiceComponent },
      { path: 'invoice-register/reissue/:id', component: CreateInvoiceComponent },
      { path: 'invoice-register/view/:id', loadComponent: () => import('./modules/invoice/pages/invoice-view/invoice-view.component').then(m => m.InvoiceViewComponent) },
      { path: 'invoice-dn-linking', component: InvoiceDnLinkingComponent },
      { path: 'cancelled-invoices', component: CancelledInvoicesComponent },
      { path: 'reissued', loadComponent: () => import('./modules/invoice/pages/cancelled-reissued-report/cancelled-reissued-report.component').then(c => c.CancelledReissuedReportComponent) },
    ]
  },
  {
    path: 'zxing-scan',
    loadComponent: () => import('./modules/scan/pages/zxing-scan/zxing-scan.component').then((c) => c.ZxingScanComponent)
  },
  { path: '**', redirectTo: '', pathMatch: 'full' }
];
