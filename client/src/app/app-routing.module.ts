import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AuthGuard } from './core/guards/auth/auth.guard';
import { RoleGuard } from './core/guards/role/role.guard';
import { LoginGuard } from './core/guards/login/login.guard';

const routes: Routes = [
  { path: '', canActivate: [AuthGuard], loadChildren: () => import('./modules/home/home.module').then((m) => m.HomeModule) },
  { path: 'customers', canActivate: [AuthGuard], loadChildren: () => import('./modules/customers/customers.module').then((m) => m.CustomersModule) },
  { path: 'enquiry', canActivate: [AuthGuard, RoleGuard], loadChildren: () => import('./modules/enquirys/enquiry.module').then((m) => m.EnquiryModule) },
  { path: 'assigned-jobs', canActivate: [AuthGuard, RoleGuard], loadChildren: () => import('./modules/assigned-jobs/assigned-jobs.module').then((m) => m.AssignedJobsModule) },
  { path: 'quotations', canActivate: [AuthGuard], loadChildren: () => import('./modules/quotations/quotations.module').then((m) => m.QuotationsModule) },
  { path: 'deal-sheet', canActivate: [AuthGuard], loadChildren: () => import('./modules/deal-sheet/deal-sheet.module').then((m) => m.DealSheetModule) },
  { path: 'job-sheet', canActivate: [AuthGuard, RoleGuard], loadChildren: () => import('./modules/job-sheet/job-sheet.module').then((m) => m.JobSheetModule) },
  { path: 'profile', canActivate: [AuthGuard], loadChildren: () => import('./modules/profile/profile.module').then((m) => m.ProfileModule) },
  { path: 'settings', canActivate: [AuthGuard], loadChildren: () => import('./modules/settings/settings.module').then((m) => m.SettingsModule) },
  { path: 'feedback-requests', canActivate: [AuthGuard], loadChildren: () => import('./modules/feedback-requests/feedback-requests.module').then((m) => m.FeedbackRequestsModule) },
  { path: 'login', canActivate: [LoginGuard], loadChildren: () => import('./modules/login/login.module').then((m) => m.LoginModule) },
  { path: 'recycle', canActivate: [AuthGuard], loadChildren: () => import('./modules/recycle/recycle.module').then((m) => m.RecycleModule) },
  { path: 'suppliers/pendings', loadComponent: () => import('./shared/components/table/table.component').then((m) => m.TableComponent) },
  { path: '**', redirectTo: '', pathMatch: 'full' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }