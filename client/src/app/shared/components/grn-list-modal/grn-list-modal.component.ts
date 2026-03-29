import { CommonModule } from '@angular/common';
import { Component, Inject, OnInit, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { NgIconsModule } from '@ng-icons/core';
import { FormsModule } from '@angular/forms';
import { IconsModule } from 'src/app/lib/icons/icons.module';
import { ButtonComponent } from '../button/button.component';
import { ModalLayoutComponent } from '../modal-layout/modal-layout.component';

export interface GrnListModalData {
  lpoId: string;
  lpoNo: string;
  grns: any[];
  hasBalanceQty: boolean;
  purchaseId?: string;
}

@Component({
  selector: 'app-grn-list-modal',
  standalone: true,
  imports: [CommonModule, NgIconsModule, FormsModule, IconsModule, ButtonComponent, ModalLayoutComponent],
  templateUrl: './grn-list-modal.component.html',
  styleUrls: ['./grn-list-modal.component.css']
})
export class GrnListModalComponent implements OnInit {
  isLoading = signal<boolean>(false);
  searchTerm = signal<string>('');
  filteredGrns = signal<any[]>([]);

  constructor(
    public dialogRef: MatDialogRef<GrnListModalComponent>,
    @Inject(MAT_DIALOG_DATA) public data: GrnListModalData,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.filteredGrns.set(this.data.grns || []);
  }

  onSearchChange(searchValue: string): void {
    this.searchTerm.set(searchValue);
    const term = searchValue.toLowerCase().trim();
    
    if (!term) {
      this.filteredGrns.set(this.data.grns || []);
      return;
    }

    const filtered = (this.data.grns || []).filter((grn: any) => {
      const grnNo = (grn.grnNo || '').toLowerCase();
      const warehouse = (grn.warehouse?.wareHouseName || '').toLowerCase();
      const date = this.formatDate(grn.grnDate);
      
      return grnNo.includes(term) || 
             warehouse.includes(term) || 
             date.includes(term);
    });
    
    this.filteredGrns.set(filtered);
  }

  onViewGrn(grn: any): void {
    this.dialogRef.close();
    this.router.navigate(['/purchase-order/view-grn', grn._id]);
  }

  onCreateGrn(): void {
    this.dialogRef.close();
    if (this.data.purchaseId) {
      this.router.navigate(['/purchase-order/create-grn', this.data.lpoId], {
        queryParams: { purchaseId: this.data.purchaseId }
      });
    } else {
      this.router.navigate(['/purchase-order/create-grn', this.data.lpoId]);
    }
  }

  onClose(): void {
    this.dialogRef.close();
  }

  formatDate(date: any): string {
    if (!date) return '-';
    const d = new Date(date);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  getTotalItems(grn: any): number {
    return grn.items?.length || 0;
  }

  getTotalAcceptedQty(grn: any): number {
    if (!grn.items || !Array.isArray(grn.items)) return 0;
    return grn.items.reduce((sum: number, item: any) => sum + (item.acceptedQty || 0), 0);
  }

  getTotalReceivedQty(grn: any): number {
    if (!grn.items || !Array.isArray(grn.items)) return 0;
    return grn.items.reduce((sum: number, item: any) => sum + (item.receivedQty || 0), 0);
  }
}
