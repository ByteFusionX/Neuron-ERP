import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { ToastrService } from 'ngx-toastr';
import { SupplierService } from 'src/app/core/services/supplier.service';
import { Supplier } from 'src/app/shared/interfaces/suppliers.interface';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { IconsModule } from 'src/app/lib/icons/icons.module';
import { ButtonComponent } from 'src/app/shared/components/button/button.component';

@Component({
  selector: 'app-supplier-view',
  standalone: true,
  imports: [CommonModule, IconsModule, ButtonComponent],
  templateUrl: './supplier-view.component.html',
})
export class SupplierViewComponent {
  private supplierService = inject(SupplierService);
  private notificationService = inject(ToastrService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private dialog = inject(MatDialog);

  supplier: Supplier | null = null;
  isLoading = true;
  isApproving = false;
  isRejecting = false;

  constructor() {
    this.loadSupplier();
  }

  loadSupplier() {
    const supplierId = this.route.snapshot.paramMap.get('id');
    if (!supplierId) {
      this.notificationService.error('Invalid supplier ID');
      this.router.navigate(['/suppliers']);
      return;
    }

    this.supplierService.getSupplierById(supplierId).subscribe({
      next: (response) => {
        this.supplier = response.data;
        this.isLoading = false;
      },
      error: (error) => {
        this.notificationService.error('Failed to load supplier details');
        console.error('Error loading supplier:', error);
        this.isLoading = false;
        this.router.navigate(['/suppliers']);
      }
    });
  }

  onApprove() {
    if (!this.supplier) return;

    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        title: 'Approve Supplier',
        description: 'Are you sure you want to approve this supplier?',
        icon: 'heroCheckCircle',
        IconColor: 'green'
      }
    });

    // dialogRef.afterClosed().subscribe((confirmed: boolean) => {
    //   if (confirmed) {
    //     this.isApproving = true;
    //     this.supplierService.updateSupplierStatus(this.supplier.id).subscribe({
    //       next: () => {
    //         this.notificationService.success('Supplier approved successfully');
    //         this.router.navigate(['/suppliers']);
    //       },
    //       error: (error) => {
    //         this.notificationService.error(error.error.message || 'Failed to approve supplier');
    //         this.isApproving = false;
    //       }
    //     });
    //   }
    // });
  }

  onReject() {
    if (!this.supplier) return;

    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        title: 'Reject Supplier',
        description: 'Are you sure you want to reject this supplier?',
        icon: 'heroXCircle',
        IconColor: 'red'
      }
    });

    // dialogRef.afterClosed().subscribe((confirmed: boolean) => {
    //   if (confirmed) {
    //     this.isRejecting = true;
    //     this.supplierService.rejectSupplier(this.supplier.id).subscribe({
    //       next: () => {
    //         this.notificationService.success('Supplier rejected successfully');
    //         this.router.navigate(['/suppliers']);
    //       },
    //       error: (error) => {
    //         this.notificationService.error(error.error.message || 'Failed to reject supplier');
    //         this.isRejecting = false;
    //       }
    //     });
    //   }
    // });
  }

  onEdit() {
    if (!this.supplier) return;
    this.router.navigate(['/suppliers', this.supplier.id, 'edit']);
  }

  onBack() {
    this.router.navigate(['/suppliers']);
  }
} 