import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { NgIconsModule } from '@ng-icons/core';
import { TechnicalService, ProjectUpdate } from 'src/app/core/services/technical.service';
import { MailFormComponent, MailFormData } from 'src/app/shared/components/mail-form/mail-form.component';
import { ButtonComponent } from 'src/app/shared/components/button/button.component';
import { FileService } from 'src/app/core/services/file.service';

@Component({
  selector: 'app-view-project-update',
  standalone: true,
  imports: [
    CommonModule,
    NgIconsModule,
    ButtonComponent
  ],
  templateUrl: './view-project-update.component.html',
  styleUrl: './view-project-update.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ViewProjectUpdateComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private dialog = inject(MatDialog);
  private technicalService = inject(TechnicalService);
  private fileService = inject(FileService);

  projectUpdate = signal<ProjectUpdate | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);
  technicalId = signal<string>('');
  updateId = signal<string>('');
  downloadingFiles = signal<Set<string>>(new Set());

  ngOnInit(): void {
    this.loadRouteParams();
    this.loadProjectUpdate();
  }

  private loadRouteParams(): void {
    const technicalId = this.route.snapshot.paramMap.get('technicalId');
    const updateId = this.route.snapshot.paramMap.get('updateId');
    
    if (technicalId && updateId) {
      this.technicalId.set(technicalId);
      this.updateId.set(updateId);
    } else {
      this.error.set('Invalid route parameters');
      this.loading.set(false);
    }
  }

  loadProjectUpdate(): void {
    if (!this.technicalId() || !this.updateId()) return;

    this.loading.set(true);
    this.error.set(null);

    this.technicalService.getProjectUpdateById(this.technicalId(), this.updateId()).subscribe({
      next: (response: any) => {
        if (response.success) {
          this.projectUpdate.set(response.data);
        } else {
          this.error.set(response.message || 'Failed to load project update');
        }
        this.loading.set(false);
      },
      error: (err: any) => {
        this.error.set('Failed to load project update');
        this.loading.set(false);
        console.error('Error loading project update:', err);
      }
    });
  }

  onEditAndSend(): void {
    const update = this.projectUpdate();
    if (!update) return;

    const dialogData: MailFormData = {
      mailData: update,
      currentUser: update.from
    };

    const dialogRef = this.dialog.open(MailFormComponent, {
      width: '900px',
      maxWidth: '95vw',
      maxHeight: '90vh',
      data: dialogData,
      disableClose: true
    });

    dialogRef.afterClosed().subscribe((result: any) => {
      if (result) {
        this.updateProjectUpdate(result);
      }
    });
  }

  private updateProjectUpdate(formData: FormData): void {
    this.technicalService.updateProjectUpdate(
      this.technicalId(),
      this.updateId(),
      formData
    ).subscribe({
      next: (response: any) => {
        if (response.success) {
          this.loadProjectUpdate();
        } else {
          this.error.set(response.message || 'Failed to update project update');
        }
      },
      error: (err: any) => {
        this.error.set('Failed to update project update');
        console.error('Error updating project update:', err);
      }
    });
  }

  onBack(): void {
    this.router.navigate(['../'], { relativeTo: this.route });
  }

  downloadAttachment(attachment: { fileName: string; originalname: string }): void {
    const fileName = attachment.fileName;
    const downloadingSet = this.downloadingFiles();
    
    if (downloadingSet.has(fileName)) {
      return;
    }

    downloadingSet.add(fileName);
    this.downloadingFiles.set(new Set(downloadingSet));

    this.fileService.downloadFileWithProgress(
      fileName,
      attachment.originalname,
      (progress: number) => {
        console.log(`Download progress for ${attachment.originalname}: ${progress}%`);
      },
      (error: any) => {
        console.error('Download failed:', error);
        this.error.set(`Failed to download ${attachment.originalname}`);
        const updatedSet = this.downloadingFiles();
        updatedSet.delete(fileName);
        this.downloadingFiles.set(new Set(updatedSet));
      }
    );

    setTimeout(() => {
      const updatedSet = this.downloadingFiles();
      updatedSet.delete(fileName);
      this.downloadingFiles.set(new Set(updatedSet));
    }, 3000);
  }

  isFileDownloading(fileName: string): boolean {
    return this.downloadingFiles().has(fileName);
  }

  formatDate(date: Date | string): string {
    return new Date(date).toLocaleString();
  }

  getUpdatedByName(): string {
    const updatedBy = this.projectUpdate()?.updatedBy as any;
    if (!updatedBy) return 'Unknown';
    return updatedBy.fullName || updatedBy.firstName || 'Unknown';
  }

  formatMessage(message: string): string {
    if (!message) return '';
    return message
      .replace(/\r\n/g, '<br>')
      .replace(/\n/g, '<br>')
      .replace(/\r/g, '<br>');
  }
}
