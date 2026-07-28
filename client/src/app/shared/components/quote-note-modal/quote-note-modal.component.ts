import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { ModalLayoutComponent } from '../modal-layout/modal-layout.component';
import { QuotationService } from 'src/app/core/services/quotation/quotation.service';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-quote-note-modal',
  standalone: true,
  imports: [CommonModule, ModalLayoutComponent],
  templateUrl: './quote-note-modal.component.html',
  styleUrls: ['./quote-note-modal.component.css']
})
export class QuoteNoteModalComponent implements OnInit {
  note: string = '';
  isLoading: boolean = true;

  constructor(
    public dialogRef: MatDialogRef<QuoteNoteModalComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { quoteId: string },
    private quotationService: QuotationService,
    private toast: ToastrService
  ) { }

  ngOnInit(): void {
    this.loadNote();
  }

  loadNote(): void {
    this.isLoading = true;
    this.quotationService.getQuoteNote(this.data.quoteId).subscribe({
      next: (res) => {
        this.note = res.saveNote || '';
        this.isLoading = false;
      },
      error: () => {
        this.toast.error('Failed to load note');
        this.isLoading = false;
      }
    });
  }

  onClose(): void {
    this.dialogRef.close();
  }
}
