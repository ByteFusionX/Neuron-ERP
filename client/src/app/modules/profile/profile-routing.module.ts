import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ProfileInfoComponent } from './pages/profile-info/profile-info.component';
import { EditCompanyDetailsComponent } from './pages/edit-company-details/edit-company-details.component';

const routes: Routes = [
  { path: '', component: ProfileInfoComponent },
  {path:'edit',component:EditCompanyDetailsComponent}
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class ProfileRoutingModule { }
