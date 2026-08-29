import { CommonModule } from '@angular/common';
import { Component, Inject, OnInit } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { NgIconsModule } from '@ng-icons/core';

interface DialogTheme {
    badge: string;
    icon: string;
    confirm: string;
}

@Component({
    selector: 'app-confirmation-dialog',
    templateUrl: './confirmation-dialog.component.html',
    styleUrls: ['./confirmation-dialog.component.css'],
    imports: [CommonModule, NgIconsModule]
})
export class ConfirmationDialogComponent implements OnInit {
  constructor(
    public dialogRef: MatDialogRef<ConfirmationDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { title: string, description: string, icon: string, IconColor: string, confirmText?: string, note?: string },
  ) { }

  textColor!: string;
  theme!: DialogTheme;

  // Full class strings so Tailwind can see them at build time.
  private themes: { [key: string]: DialogTheme } = {
    red: {
      badge: 'bg-red-50 border-red-100',
      icon: 'text-red-600',
      confirm: 'bg-red-600 hover:bg-red-500',
    },
    orange: {
      badge: 'bg-orange-50 border-orange-100',
      icon: 'text-orange-500',
      confirm: 'bg-orange-500 hover:bg-orange-400',
    },
    warn: {
      badge: 'bg-orange-50 border-orange-100',
      icon: 'text-orange-500',
      confirm: 'bg-orange-500 hover:bg-orange-400',
    },
    green: {
      badge: 'bg-green-50 border-green-100',
      icon: 'text-green-600',
      confirm: 'bg-green-600 hover:bg-green-500',
    },
    violet: {
      badge: 'bg-violet-50 border-violet-100',
      icon: 'text-violet-600',
      confirm: 'bg-violet-600 hover:bg-violet-500',
    },
  };

  get noteText(): string {
    if (this.data.note) return this.data.note;
    return this.data.IconColor === 'red' ? 'This action cannot be undone.' : '';
  }

  get confirmLabel(): string {
    return this.data.confirmText || 'Confirm';
  }

  ngOnInit(): void {
    this.textColor = `text-${this.data.IconColor}-500`;
    this.theme = this.themes[this.data.IconColor] || this.themes['violet'];
  }

  onClose() {
    this.dialogRef.close(false)
  }

  onApproved() {
    this.dialogRef.close(true)
  }
}
