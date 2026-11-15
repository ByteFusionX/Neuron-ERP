import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { Subscription } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import { PurchaseService } from 'src/app/core/services/purchase/purchase.service';
import { TechnicalService } from 'src/app/core/services/technical.service';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { DetailBadgeComponent } from 'src/app/shared/components/detail-panel/detail-badge.component';
import { SmartFormModule } from 'src/app/shared/components/smart-form';

/** How an MR item stands against what the PR already holds for it. */
type MrState = 'new' | 'covered' | 'up' | 'down';

interface MrRow {
  request: any;
  /** Quantity the PR already holds for this MR item (sum of its MR-linked lines). */
  inPr: number;
  state: MrState;
  /** Quantity still needed ('up'), or by which the MR went below the PR ('down'). */
  diff: number;
}

@Component({
  selector: 'app-mr-items-drawer',
  imports: [CommonModule, FormsModule, SmartFormModule, ActionButtonComponent, DetailBadgeComponent],
  templateUrl: './mr-items-drawer.component.html',
})
export class MrItemsDrawerComponent implements OnChanges, OnDestroy {
  @Input() open = false;
  @Input() purchaseId: string | null = null;
  @Input() jobId: string | null = null;
  /** The PR's current item groups (itemsList), so what is added merges with unsaved-but-synced lines. */
  @Input() currentItems: any[] = [];
  @Output() added = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();

  private technicalService = inject(TechnicalService);
  private purchaseService = inject(PurchaseService);
  private toaster = inject(ToastrService);
  private subs = new Subscription();

  loading = false;
  saving = false;
  rows: MrRow[] = [];
  selected = new Set<number>();

  ngOnChanges(changes: SimpleChanges): void {
    if (this.open && (changes['open'] || changes['jobId'] || changes['currentItems'])) {
      if (changes['open'] || changes['jobId'] || !this.rows.length) this.load();
      else this.recompute();
    }
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  private requests: any[] = [];

  private load(): void {
    this.selected.clear();
    if (!this.jobId) { this.requests = []; this.rows = []; return; }
    this.loading = true;
    this.subs.add(this.technicalService.getMaterialRequestByJobId(this.jobId).subscribe({
      next: (res) => {
        this.loading = false;
        this.requests = (res?.data || []).filter((r: any) => r.status === 'approved');
        this.recompute();
      },
      error: () => {
        this.loading = false;
        this.requests = [];
        this.rows = [];
        this.toaster.error('Failed to load material requests');
      },
    }));
  }

  /** What the PR already holds per MR item: lines pointing at it, else (older lines) an MR line with the same text. */
  private recompute(): void {
    const lines: any[] = (this.currentItems || []).flatMap((i: any) => i.itemDetails || []).filter((d: any) => d.fromMrRequest);
    this.rows = this.requests.map((request) => {
      const text = String(request.itemName || '').trim().toLowerCase();
      const mine = lines.filter((d) => d.mrLineId ? String(d.mrLineId) === String(request._id) : String(d.detail || '').trim().toLowerCase() === text);
      const inPr = mine.reduce((n, d) => n + (Number(d.quantity) || 0), 0);
      const qty = Number(request.quantity) || 0;
      if (!mine.length) return { request, inPr: 0, state: 'new' as MrState, diff: qty };
      if (Math.abs(qty - inPr) < 0.0001) return { request, inPr, state: 'covered' as MrState, diff: 0 };
      return qty > inPr
        ? { request, inPr, state: 'up' as MrState, diff: qty - inPr }
        : { request, inPr, state: 'down' as MrState, diff: inPr - qty };
    });
    this.selected = new Set([...this.selected].filter((i) => this.isSelectable(i)));
  }

  /** In the PR with the same quantity: shown ticked and fixed until the MR quantity changes. */
  isLocked(i: number): boolean {
    return this.rows[i]?.state === 'covered';
  }

  isSelectable(i: number): boolean {
    const s = this.rows[i]?.state;
    return s === 'new' || s === 'up';
  }

  isChecked(i: number): boolean {
    return this.isLocked(i) || this.selected.has(i);
  }

  toggle(i: number): void {
    if (!this.isSelectable(i)) return;
    this.selected.has(i) ? this.selected.delete(i) : this.selected.add(i);
  }

  get selectableCount(): number {
    return this.rows.filter((_, i) => this.isSelectable(i)).length;
  }

  toggleAll(): void {
    const all = this.rows.map((_, i) => i).filter((i) => this.isSelectable(i));
    if (this.selected.size === all.length) this.selected.clear();
    else all.forEach((i) => this.selected.add(i));
  }

  /** Cost of what would be added: the quantity still needed, at the MR's estimated cost. */
  get selectedTotal(): number {
    return [...this.selected].reduce((n, i) => n + this.rows[i].diff * (Number(this.rows[i].request.estimatedCost) || 0), 0);
  }

  addSelected(): void {
    if (!this.purchaseId) {
      this.toaster.error('Save the request first');
      return;
    }
    const newItems = [...this.selected].map((i) => {
      const { request, diff } = this.rows[i];
      return {
        itemName: request.itemName,
        itemDetails: [{
          _id: uuidv4(),
          detail: request.itemName,
          itemCode: request.itemCode || '',
          partNo: request.partNo || '',
          productId: request.productId || undefined,
          uom: request.uom || '',
          quantity: diff,
          unitCost: request.estimatedCost,
          availability: '',
          supplierName: '',
          email: '',
          phoneNo: '',
          dealSelected: false,
          remarks: request.remarks,
          fromMrRequest: true,
          mrLineId: String(request._id),
        }],
      };
    });
    if (!newItems.length) return;
    this.saving = true;
    this.subs.add(this.purchaseService.updatePurchaseItems(this.purchaseId, [...(this.currentItems || []), ...newItems]).subscribe({
      next: (res) => {
        this.saving = false;
        if (res?.success) {
          this.toaster.success(`${newItems.length} item${newItems.length === 1 ? '' : 's'} added to the request`);
          this.selected.clear();
          this.added.emit();
          this.closed.emit();
        }
      },
      error: (err) => {
        this.saving = false;
        this.toaster.error(err?.error?.message || 'Failed to add items');
      },
    }));
  }

  onDrawerClosed(): void {
    this.selected.clear();
    this.closed.emit();
  }
}
