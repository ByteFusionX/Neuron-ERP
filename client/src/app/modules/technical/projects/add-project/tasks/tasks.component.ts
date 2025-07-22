import { Component, inject, signal, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TechnicalService } from 'src/app/core/services/technical.service';
import { MatDialog } from '@angular/material/dialog';
import { TasksModalComponent } from '../tasks-modal/tasks-modal.component';
import { CommonModule } from '@angular/common';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { CdkDragDrop, moveItemInArray, transferArrayItem } from '@angular/cdk/drag-drop';
import { NgIconComponent } from '@ng-icons/core';
import { SkeltonLoadingComponent } from 'src/app/shared/components/skelton-loading/skelton-loading.component';

@Component({
  selector: 'app-tasks',
  standalone: true,
  imports: [CommonModule, DragDropModule, NgIconComponent, SkeltonLoadingComponent],
  templateUrl: './tasks.component.html',
  styleUrl: './tasks.component.css',
})
export class TasksComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private technicalService = inject(TechnicalService);
  private dialog = inject(MatDialog);

  projectId = signal<string>('');
  statuses = signal<{
    bgColor: string;
    name: string;
  }[]>([
    { bgColor: 'bg-red-200', name: 'Pending' },
    { bgColor: 'bg-yellow-200', name: 'In Progress' },
    { bgColor: 'bg-green-200', name: 'Completed' },
    { bgColor: 'bg-gray-200', name: 'Cancelled' }
  ]);

  tasks = signal<any[]>([]);
  loading = signal<boolean>(false);

  trackStatus = (index: number, status: { name: string }) => status.name;
  trackTask = (index: number, task: any) => task._id || task.id || index;

  get dropListIds() {
    return this.statuses().map(s => s.name);
  }

  ngOnInit(): void {
    this.getProjectId();
  }

  getProjectId(): void {
    this.route.params.subscribe((params) => {
      this.projectId.set(params['id']);
      this.getTasks();
    });
  }

  getTasks(): void {
    if (!this.projectId()) return;
    this.loading.set(true);
    this.technicalService.getTasks(this.projectId()).subscribe({
      next: (res) => {
        this.tasks.set(res.data || res || []);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
      }
    });
  }

  openCreateTaskModal(status?: string): void {
    const dialogRef = this.dialog.open(TasksModalComponent, {
      maxHeight: '90vh',
      data: { projectId: this.projectId(), status },
    });
    dialogRef.afterClosed().subscribe((refresh) => {
      if (refresh) this.getTasks();
    });
  }

  openEditTaskModal(task: any): void {
    console.log(task._id);
    const dialogRef = this.dialog.open(TasksModalComponent, {
      maxHeight: '90vh',
      data: { task, taskId: task._id, projectId: this.projectId() }
    });
    dialogRef.afterClosed().subscribe((refresh) => {
      if (refresh) this.getTasks();
    });
  }

  getTasksByStatus(status: string) {
    return this.tasks().filter(task => task.status === status);
  }

  drop(event: CdkDragDrop<any[]>, status: string) {
    let movedTask;
    let statusChanged = false;
    if (event.previousContainer === event.container) {
      moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
      movedTask = event.container.data[event.currentIndex];
    } else {
      movedTask = event.previousContainer.data[event.previousIndex];
      if (movedTask.status !== status) {
        statusChanged = true;
        movedTask.status = status;
      }
      transferArrayItem(
        event.previousContainer.data,
        event.container.data,
        event.previousIndex,
        event.currentIndex
      );
    }
    this.tasks.set([...this.tasks()]);
    if (statusChanged && movedTask && movedTask._id) {
      const payload = {
        taskName: movedTask.taskName,
        description: movedTask.description,
        status: movedTask.status,
        priority: movedTask.priority,
        timeline: movedTask.timeline,
        progress: movedTask.progress,
        notes: movedTask.notes,
        associatedWith: movedTask.associatedWith || [],
      };
      this.technicalService.updateTask(this.projectId(), movedTask._id, payload).subscribe({
        next: () => {},
        error: () => {}
      });
    }
  }
}
