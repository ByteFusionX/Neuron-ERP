import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AuthGuard } from './core/guards/auth/auth.guard';
import { RoleGuard } from './core/guards/role/role.guard';
import { LoginGuard } from './core/guards/login/login.guard';
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
import { EditCompanyDetailsComponent } from './modules/profile/pages/edit-company-details/edit-company-details.component';
import { LoginPageComponent } from './modules/login/pages/login-page/login-page.component';

export const routes: Routes = [
  { path: '', redirectTo: 'home', pathMatch: 'full' },
  {
    path: 'home',
    canActivate: [AuthGuard],
    loadComponent: () => import('./modules/home/home.component').then((m) => m.HomeComponent),
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
    loadComponent: () => import('./modules/customers/customers.component').then((m) => m.CustomersComponent),
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
    loadComponent: () => import('./modules/enquirys/enquiry.component').then((m) => m.EnquiryComponent)
  },
  {
    path: 'assigned-jobs',
    canActivate: [AuthGuard, RoleGuard],
    loadComponent: () => import('./modules/assigned-jobs/assigned-jobs.component').then((m) => m.AssignedJobsComponent),
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
    loadComponent: () => import('./modules/quotations/quotations.component').then((m) => m.QuotationsComponent),
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
    loadComponent: () => import('./modules/deal-sheet/deal-sheet.component').then((m) => m.DealSheetComponent),
    children: [
      { path: '', redirectTo: 'pendings', pathMatch: 'full' },
      { path: 'pendings', canActivate: [RoleGuard], component: PendingDealsComponent },
      { path: 'approved', canActivate: [RoleGuard], component: ApprovedDealsComponent },
    ]
  },
  {
    path: 'job-sheet',
    canActivate: [AuthGuard, RoleGuard],
    loadComponent: () => import('./modules/job-sheet/job-sheet.component').then((m) => m.JobSheetComponent),
    children: [
      { path: '', canActivate: [RoleGuard], component: JobListComponent },
    ]
  },
  {
    path: 'profile',
    canActivate: [AuthGuard],
    loadComponent: () => import('./modules/profile/profile.component').then((m) => m.ProfileComponent),
    children: [
      { path: '', component: ProfileInfoComponent }
    ]
  },
  {
    path: 'settings',
    canActivate: [AuthGuard],
    loadComponent: () => import('./modules/settings/settings.component').then((m) => m.SettingsComponnet)
  },
  {
    path: 'feedback-requests',
    canActivate: [AuthGuard],
    loadComponent: () => import('./modules/feedback-requests/feedback-requests.component').then((m) => m.FeedbackRequestsComponent)
  },
  {
    path: 'login',
    canActivate: [LoginGuard],
    loadComponent: () => import('./modules/login/login.component').then((m) => m.LoginComponent),
    children: [
      { path: '', component: LoginPageComponent }
    ]
  },
  {
    path: 'recycle',
    canActivate: [AuthGuard],
    loadComponent: () => import('./modules/recycle/recycle.component').then((m) => m.RecycleComponent)
  },
  {
    path: 'suppliers/pendings',
    loadComponent: () => import('./shared/components/table/table.component').then((m) => m.TableComponent)
  },
  { path: '**', redirectTo: '', pathMatch: 'full' }
];
