import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { DeliveryNoteService } from 'src/app/core/services/delivery-note/delivery-note.service';
import { ToastrService } from 'ngx-toastr';
import { ButtonComponent } from 'src/app/shared/components/button/button.component';
import { IconsModule } from 'src/app/lib/icons/icons.module';

@Component({
  selector: 'app-pending-delivery-detail',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    ButtonComponent,
    IconsModule
  ],
  templateUrl: './pending-delivery-detail.component.html',
  styleUrl: './pending-delivery-detail.component.css'
})
export class PendingDeliveryDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private dnService = inject(DeliveryNoteService);
  private toaster = inject(ToastrService);

  isLoading = signal<boolean>(true);
  jobInfo: any = null;
  items: any[] = [];

  ngOnInit(): void {
    const jobId = this.route.snapshot.paramMap.get('jobId');
    if (!jobId) {
      this.toaster.error('Invalid Job ID');
      this.router.navigate(['/dispatch/pending-delivery-reports']);
      return;
    }

    this.dnService.getPendingDeliveryDetails(jobId).subscribe({
      next: (res) => {
        this.jobInfo = res.job;
        this.items = res.items || [];
        this.isLoading.set(false);
      },
      error: (error) => {
        this.toaster.error('Failed to load pending delivery details');
        console.error('Error loading pending delivery details:', error);
        this.isLoading.set(false);
        this.router.navigate(['/dispatch/pending-delivery-reports']);
      }
    });
  }

  onBack(): void {
    this.router.navigate(['/dispatch/pending-delivery-reports']);
  }

  onViewDn(dnId: string): void {
    this.router.navigate(['/dispatch/delivery-note-register/view', dnId]);
  }
}

