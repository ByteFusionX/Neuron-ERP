import { Routes } from '@angular/router';
import { SupplierViewComponent } from './pages/supplier-view/supplier-view.component';

export const SUPPLIERS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/suppliers/suppliers.component').then(m => m.SuppliersComponent)
  },
  {
    path: 'create',
    loadComponent: () => import('./pages/supplier-create/supplier-create.component').then(m => m.SupplierCreateComponent)
  },
  {
    path: ':id',
    component: SupplierViewComponent
  },
  {
    path: ':id/edit',
    loadComponent: () => import('./pages/supplier-edit/supplier-edit.component').then(m => m.SupplierEditComponent)
  }
]; 