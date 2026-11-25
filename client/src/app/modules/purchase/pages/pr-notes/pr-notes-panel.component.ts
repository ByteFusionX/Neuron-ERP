import { Component, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastrService } from 'ngx-toastr';
import { PurchaseService } from 'src/app/core/services/purchase/purchase.service';
import { ConfirmDialogService } from 'src/app/shared/components/confirm-dialog';
import { ModalService } from 'src/app/shared/components/modal';
import { DetailPanelIconComponent } from 'src/app/shared/components/detail-panel/detail-panel-icon.component';
import { QuoteNoteModalComponent, QuoteNoteModalResult } from 'src/app/modules/quotations/pages/quote-notes/quote-note-modal.component';

type PrNoteAction = 'submitted' | 'resubmitted' | 'approved' | 'rejected' | 'revoked';

export interface PrNote {
  _id?: string;
  action?: PrNoteAction;
  title?: string;
  note: string;
  /** Approval-flow note: delete-only. */
  system?: boolean;
  createdByName?: string;
  createdAt: string | Date;
}

/** Fallback titles for approval notes saved before notes had a title. */
const ACTION_TITLE: Record<PrNoteAction, string> = {
  submitted: 'Sent for Approval',
  resubmitted: 'Resubmitted for Approval',
  approved: 'PR Approved',
  rejected: 'PR Rejected',
  revoked: 'PR Revoked',
};

/**
 * A PR's notes, newest first: manual notes (title + note, editable) and the notes typed in the
 * send / approve / reject / revoke modals (delete-only). Updates purchase.notes after each change.
 */
@Component({
  selector: 'app-pr-notes-panel',
  standalone: true,
  imports: [CommonModule, DetailPanelIconComponent],
  template: `
    <p *ngIf="!sorted.length" class="text-[13px] text-gray-500 dark:text-gray-400">No notes added yet.</p>
    <ul *ngIf="sorted.length" class="space-y-3">
      <li *ngFor="let n of sorted" class="rounded-lg border border-gray-200 p-3 dark:border-neutral-700">
        <div class="flex items-start justify-between gap-2">
          <p class="text-[13px] font-medium text-gray-900 dark:text-gray-100">{{ titleOf(n) }}</p>
          <span *ngIf="!readonly && n._id" class="flex shrink-0 gap-1">
            <button *ngIf="!isSystem(n)" type="button" title="Edit note" aria-label="Edit note"
              class="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-blue-600 dark:text-gray-400 dark:hover:bg-neutral-800"
              (click)="edit(n)"><app-dp-icon name="edit"></app-dp-icon></button>
            <button type="button" title="Delete note" aria-label="Delete note"
              class="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-red-600 dark:text-gray-400 dark:hover:bg-neutral-800"
              (click)="remove(n)"><app-dp-icon name="trash"></app-dp-icon></button>
          </span>
        </div>
        <p class="mt-1 whitespace-pre-line break-words text-[13px] text-gray-700 dark:text-gray-300">{{ n.note }}</p>
        <p class="mt-2 text-[11px] text-gray-500 dark:text-gray-400">
          {{ n.createdByName || 'Unknown' }}<ng-container *ngIf="n.createdAt"> · {{ n.createdAt | date: 'dd MMM yyyy, HH:mm' }}</ng-container>
        </p>
      </li>
    </ul>
  `,
})
export class PrNotesPanelComponent {
  /** Hides add / edit / delete. */
  @Input() readonly = false;

  /** Pass the purchase request; older PRs without a notes list fall back to their last submit note. */
  @Input() set purchase(value: any) {
    this.pr = value;
    this.refresh();
  }

  private purchaseService = inject(PurchaseService);
  private modal = inject(ModalService);
  private confirm = inject(ConfirmDialogService);
  private toaster = inject(ToastrService);
  private pr: any;
  sorted: PrNote[] = [];

  titleOf(n: PrNote): string { return n.title || (n.action ? ACTION_TITLE[n.action] : 'Note'); }
  isSystem(n: PrNote): boolean { return !!n.system || !!n.action; }

  add(): void {
    if (!this.pr?._id) return;
    this.openModal().subscribe((result) => {
      if (!result) return;
      this.purchaseService.addPurchaseNote(this.pr._id, result).subscribe({
        next: (r) => this.apply(r.notes, 'Note added'),
        error: (err) => this.toaster.error(err?.error?.message || 'Could not save the note'),
      });
    });
  }

  edit(n: PrNote): void {
    if (!n._id) return;
    this.openModal({ title: n.title || '', note: n.note }).subscribe((result) => {
      if (!result) return;
      this.purchaseService.updatePurchaseNote(this.pr._id, n._id!, result).subscribe({
        next: (r) => this.apply(r.notes, 'Note updated'),
        error: (err) => this.toaster.error(err?.error?.message || 'Could not update the note'),
      });
    });
  }

  async remove(n: PrNote): Promise<void> {
    if (!n._id) return;
    const { confirmed } = await this.confirm.open({
      tone: 'reject',
      title: 'Delete note?',
      message: `"${this.titleOf(n)}" will be removed from this purchase request.`,
      confirmLabel: 'Delete',
    });
    if (!confirmed) return;
    this.purchaseService.deletePurchaseNote(this.pr._id, n._id).subscribe({
      next: (r) => this.apply(r.notes, 'Note deleted'),
      error: (err) => this.toaster.error(err?.error?.message || 'Could not delete the note'),
    });
  }

  private openModal(note?: { title: string; note: string }) {
    return this.modal.open<QuoteNoteModalResult>(QuoteNoteModalComponent, {
      width: '520px',
      data: { context: this.pr?.purchaseId, note, hint: 'Write down anything worth remembering about this purchase request.' },
    }).afterClosed();
  }

  private apply(notes: PrNote[], message: string): void {
    this.pr.notes = notes ?? [];
    this.refresh();
    this.toaster.success(message);
  }

  private refresh(): void {
    const value = this.pr;
    const notes: PrNote[] = Array.isArray(value?.notes) ? value.notes : [];
    const list = notes.length || !value?.submitNote
      ? notes
      : [{ action: 'submitted' as const, note: value.submitNote, createdByName: '', createdAt: '' }];
    this.sorted = [...list].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  }
}
