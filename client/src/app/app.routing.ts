import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { LoginGuard } from './core/guards/login/login.guard';
import { AuthGuard } from './core/guards/auth/auth.guard';
import { RoleGuard } from './core/guards/role/role.guard';
import { AnnouncementsComponent } from './modules/home/pages/announcements/announcements.component';
import { ViewEmployeeComponent } from './modules/home/pages/employees/view-employee/view-employee.component';
import { EmployeesComponent } from './modules/home/pages/employees/employees.component';
import { DashboardComponent } from './modules/home/pages/dashboard/dashboard.component';
import { CustomersListComponent } from './modules/customers/pages/customers-list/customers-list.component';
import { CreateCustomerDialog } from './modules/customers/pages/create-customer/create-customer.component';
import { CustomerViewComponent } from './modules/customers/pages/customer-view/customer-view.component';
import { CustomerEditComponent } from './modules/customers/pages/customer-edit/customer-edit.component';
import { AssignedJobsListComponent } from './modules/assigned-jobs/pages/assigned-jobs-list/assigned-jobs-list.component';
import { UploadEstimationComponent } from './modules/assigned-jobs/pages/upload-estimation/upload-estimation.component';
import { CompletedJobsListComponent } from './modules/assigned-jobs/pages/completed-jobs-list/completed-jobs-list.component';
import { ReassignedJobsComponent } from './modules/assigned-jobs/pages/reassigned-jobs/reassigned-jobs.component';
import { QuotationViewComponent } from './modules/quotations/pages/quotation-view/quotation-view.component';
import { QuotationEditComponent } from './modules/quotations/pages/quotation-edit/quotation-edit.component';
import { CreateQuotatationComponent } from './modules/quotations/pages/create-quotatation/create-quotatation.component';
import { QuotationListComponent } from './modules/quotations/pages/quotation-list/quotation-list.component';
import { PendingDealsComponent } from './modules/deal-sheet/pending-deals/pending-deals.component';
import { ApprovedDealsComponent } from './modules/deal-sheet/approved-deals/approved-deals.component';
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
import { CreateGrnComponent } from './modules/purchase-order/pages/create-grn/create-grn.component';
import { ViewGrnComponent } from './modules/purchase-order/pages/view-grn/view-grn.component';
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
import { AllProductsComponent } from './modules/inventory/pages/all-products/all-products.component';
import { StockEntriesComponent } from './modules/inventory/pages/stock-entries/stock-entries.component';
import { CreateStockEntryComponent } from './modules/inventory/pages/stock-entries/modals/create-stock-entry/create-stock-entry.component';
import { DnRegisterComponent } from './modules/dispatch/pages/dn-register/dn-register.component';
import { CreateDnComponent } from './modules/dispatch/pages/create-dn/create-dn.component';
import { PendingDeliveryComponent } from './modules/dispatch/pages/pending-delivery/pending-delivery.component';
import { InvoiceLinkingComponent } from './modules/dispatch/pages/invoice-linking/invoice-linking.component';
import { InventoryDeductionComponent } from './modules/dispatch/pages/inventory-deduction/inventory-deduction.component';
import { DeliveryNoteViewComponent } from './modules/dispatch/pages/delivery-note-view/delivery-note-view.component';
import { InvoiceRegisterComponent } from './modules/invoice/pages/invoice-register/invoice-register.component';
import { CreateInvoiceComponent } from './modules/invoice/pages/create-invoice/create-invoice.component';


export const routes: Routes = [
  { path: '', redirectTo: 'home', pathMatch: 'full' },
  {
    path: 'home',
    canActivate: [AuthGuard],
    loadComponent: () => import('./modules/home/home.component').then((c) => c.HomeComponent),
    children: [
      { path: '', component: DashboardComponent },
      { path: 'employees', canActivate: [RoleGuard], component: EmployeesComponent },
      { path: 'employees/view/:employeeId', canActivate: [RoleGuard], component: ViewEmployeeComponent },
      { path: 'announcements', canActivate: [RoleGuard], component: AnnouncementsComponent },
    ],
  },
  {
    path: 'customers',
    canActivate: [AuthGuard],
    loadComponent: () => import('./modules/customers/customers.component').then((c) => c.CustomersComponent),
    children: [
      { path: '', canActivate: [RoleGuard], component: CustomersListComponent },
      { path: 'create', canActivate: [RoleGuard], component: CreateCustomerDialog },
      { path: 'view/:customerId', canActivate: [RoleGuard], component: CustomerViewComponent },
      { path: 'edit', canActivate: [RoleGuard], component: CustomerEditComponent }
    ]
  },
  {
    path: 'enquiry',
    canActivate: [AuthGuard, RoleGuard],
    loadComponent: () => import('./modules/enquirys/enquiry.component').then((c) => c.EnquiryComponent)
  },
  {
    path: 'assigned-jobs',
    canActivate: [AuthGuard, RoleGuard],
    loadComponent: () => import('./modules/assigned-jobs/assigned-jobs.component').then((c) => c.AssignedJobsComponent),
    children: [
      { path: '', component: AssignedJobsListComponent },
      { path: 'upload-estimations', component: UploadEstimationComponent },
      { path: 'edit-estimations', component: UploadEstimationComponent },
      { path: 'completed', component: CompletedJobsListComponent },
      { path: 'reassigned', component: ReassignedJobsComponent }
    ]
  },
  {
    path: 'quotations',
    canActivate: [AuthGuard],
    loadComponent: () => import('./modules/quotations/quotations.component').then((c) => c.QuotationsComponent),
    children: [
      { path: '', canActivate: [RoleGuard], component: QuotationListComponent },
      { path: 'report', canActivate: [RoleGuard], component: QuotationListComponent },
      { path: 'create', canActivate: [RoleGuard], component: CreateQuotatationComponent },
      { path: 'edit', canActivate: [RoleGuard], component: QuotationEditComponent },
      { path: 'view', canActivate: [RoleGuard], component: QuotationViewComponent }
    ]
  },
  {
    path: 'deal-sheet',
    canActivate: [AuthGuard],
    loadComponent: () => import('./modules/deal-sheet/deal-sheet.component').then((c) => c.DealSheetComponent),
    children: [
      { path: '', redirectTo: 'pendings', pathMatch: 'full' },
      { path: 'pendings', canActivate: [RoleGuard], component: PendingDealsComponent },
      { path: 'approved', canActivate: [RoleGuard], component: ApprovedDealsComponent },
    ]
  },
  {
    path: 'job-sheet',
    canActivate: [AuthGuard, RoleGuard],
    loadComponent: () => import('./modules/job-sheet/job-sheet.component').then((c) => c.JobSheetComponent),
    children: [
      { path: '', redirectTo: 'pendings', pathMatch: 'full' },
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
    loadComponent: () => import('./modules/settings/settings.component').then((c) => c.SettingsComponnet)
  },
  {
    path: 'feedback-requests',
    canActivate: [AuthGuard],
    loadComponent: () => import('./modules/feedback-requests/feedback-requests.component').then((c) => c.FeedbackRequestsComponent)
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
    canActivate: [AuthGuard],
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
    canActivate: [AuthGuard],
    loadComponent: () => import('./modules/purchase-order/purchase-order.component').then((c) => c.PurchaseOrderComponent),
    children: [
      { path: 'pending-approval', component: LpoApprovalComponent },
      { path: 'approved', component: LpoApprovalComponent },
      { path: 'view-lpo/:id', component: ViewLpoComponent },
      { path: 'create-grn/:lpoId', component: CreateGrnComponent },
      { path: 'view-grn/:id', component: ViewGrnComponent }
    ]
  },
  {
    path: 'technical',
    canActivate: [AuthGuard],
    loadComponent: () => import('./modules/technical/technical.component').then((c) => c.TechnicalComponent),
    children: [
      { path: 'project', component: ProjectsComponent },
      { path: 'amc', component: ProjectsComponent },
      { path: 'project/add', component: AddProjectComponent, canDeactivate: [(component: AddProjectComponent) => component.canDeactivate()] },
      { path: 'project/edit/:id', component: AddProjectComponent, canDeactivate: [(component: AddProjectComponent) => component.canDeactivate()] },
      { path: 'project/activity-plan/:id', component: ActivityPlanComponent},
      { path: 'project/material-request/:id', component: MaterialRequestModalComponent},
      { path: 'project/updates/:id', component: ProjectUpdatesComponent},
      { path: 'project/updates/:technicalId/:updateId', component: ViewProjectUpdateComponent},
      { path: 'project/tasks/:id', component: TasksComponent},
      { path: 'project/issues/:id', component: IssuesListComponent},
      { path: 'project/claims/:id', component: ClaimsComponent},
      { path: 'project/billing-summary/:id', component: BillingSummaryComponent},
      { path: 'open-to-work-project', component: OpenToWorkProjectComponent },
      { path: 'mr-approval-requests', component: MrApprovalRequestsComponent },
      { path: 'mr-approval-requests/view/:id', component: ViewMaterialRequestComponent }
    ]
  },
  {
    path: 'claims',
    // loadComponent: () => import('./modules/claims/claims.component').then((c) => c.ClaimsComponent),
    children: [
      { path: 'my-claims', component: ClaimsComponent },
      { path: 'approval-requests', component: RequestForApprovalsComponent }
    ]
  },
  {
    path: 'inventory',
    canActivate: [AuthGuard],
    loadComponent: () => import('./modules/inventory/inventory.component').then((c) => c.InventoryComponent),
    children: [
      { path: 'products', component: AllProductsComponent },
      { path: 'stock-entries', component: StockEntriesComponent },
      { path: 'stock-entries/create', component: CreateStockEntryComponent }
    ]
  },
  {
    path: 'dispatch',
    canActivate: [AuthGuard],
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
    canActivate: [AuthGuard],
    loadComponent: () => import('./modules/invoice/invoice.component').then((c) => c.InvoiceComponent),
    children: [
      { path: 'invoice-register', component: InvoiceRegisterComponent },
      { path: 'invoice-register/create', component: CreateInvoiceComponent },
    ]
  },
  { path: '**', redirectTo: '', pathMatch: 'full' }
];
