import { Component, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild, inject } from '@angular/core';
import { DecimalPipe, NgFor, NgIf, TitleCasePipe } from '@angular/common';
import { AbstractControl, FormArray, FormBuilder, FormControl, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { ToastrService } from 'ngx-toastr';
import { Subscription } from 'rxjs';
import { MaterialRequest, MaterialRequestAttachment, TechnicalService } from 'src/app/core/services/technical.service';
import { PurchaseService } from 'src/app/core/services/purchase/purchase.service';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { StatusHistoryModalComponent } from 'src/app/shared/components/status-history-modal/status-history-modal.component';
import { SfDrawerComponent, SmartFormModule } from 'src/app/shared/components/smart-form';
import { CatalogueSuggestionSource, ITEM_SUGGESTION_SOURCE, ItemEntryComponent, ItemEntryOptionValue } from 'src/app/shared/components/item-entry';
import { PurchaseRequestModalComponent } from '../projects/add-project/purchase-request-modal/purchase-request-modal.component';

/** What the item-entry line cannot carry: the saved record's id, its review status and the date it is needed. */
interface LineMeta {
  original?: MaterialRequest;
  status: 'pending' | 'approved' | 'rejected';
  statusHistory: any[];
  requiredOn: string | null;
  dateCtl?: FormControl<string | null>;
}

/**
 * Material request slide-over for a technical project. Lines are edited in `app-item-entry` (RFQ layout,
 * flat list); the date needed, estimated cost, remarks and review status sit under each line.
 * Approved lines are read-only and are always sent back unchanged.
 */
@Component({
  selector: 'app-material-request-drawer',
  standalone: true,
  templateUrl: './material-request-drawer.component.html',
  imports: [NgIf, NgFor, DecimalPipe, TitleCasePipe, FormsModule, ReactiveFormsModule, SmartFormModule, ActionButtonComponent, ItemEntryComponent],
  providers: [CatalogueSuggestionSource, { provide: ITEM_SUGGESTION_SOURCE, useExisting: CatalogueSuggestionSource }],
})
export class MaterialRequestDrawerComponent implements OnChanges, OnDestroy {
  @Input() open = false;
  @Input() projectId: string | null = null;
  @Output() saved = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();

  @ViewChild(SfDrawerComponent) drawer?: SfDrawerComponent;
  @ViewChild(ItemEntryComponent) itemEntry?: ItemEntryComponent;

  loading = false;
  saving = false;
  seedOptionalItems: ItemEntryOptionValue[] | null = null;
  existingAttachments: MaterialRequestAttachment[] = [];
  purchaseRequests: any[] = [];

  private fb = inject(FormBuilder);
  private toaster = inject(ToastrService);
  private dialog = inject(MatDialog);
  private technicalService = inject(TechnicalService);
  private purchaseService = inject(PurchaseService);
  private catalogue = inject(CatalogueSuggestionSource);
  private _catalogueInit = (this.catalogue.includePending = true);
  private subs = new Subscription();
  private loadSub?: Subscription;
  private metas = new Map<string, LineMeta>();
  private originals: MaterialRequest[] = [];

  form = this.fb.group({
    optionalItems: this.fb.array([] as any[]),
    files: [[] as File[]],
  });

  get optionalItems(): FormArray {
    return this.form.get('optionalItems') as FormArray;
  }

  get hasPurchaseRequests(): boolean {
    return this.purchaseRequests.some((p: any) => p.mrRequest);
  }

  /** Sum of quantity x estimated cost over every line on screen. */
  get grandTotal(): number {
    return this.lines().reduce((sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.unitCost) || 0), 0);
  }

  readonly stepLabels = ['Items', 'Documents'];
  step = 1;

  get itemCount(): number {
    return this.lines().length;
  }

  get totalQuantity(): number {
    return this.lines().reduce((sum, l) => sum + (Number(l.quantity) || 0), 0);
  }

  goToStep(n: number): void {
    if (n === 2) this.next();
    else this.step = 1;
  }

  /** Validates the item lines before moving on to the documents step. */
  next(): void {
    const missingDate = this.lines().some((l) => !this.isApprovedKey(l.lineKey) && !this.metas.get(l.lineKey)?.requiredOn);
    if (this.optionalItems.invalid || missingDate) {
      this.optionalItems.markAllAsTouched();
      this.touchDates();
      this.itemEntry?.revealInvalid();
      this.toaster.warning(missingDate && !this.optionalItems.invalid ? 'Set a required-on date for every item.' : 'Complete the highlighted required fields.', 'Complete required information');
      return;
    }
    this.step = 2;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.open || !(changes['open'] || changes['projectId'])) return;
    this.load();
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
    this.loadSub?.unsubscribe();
  }

  // ── Line helpers ──────────────────────────────────────────────────────────────

  private lines(): any[] {
    return (this.optionalItems.getRawValue() as any[]).flatMap((o) => (o.items || []).flatMap((i: any) => i.itemDetails || []));
  }

  /** The extra state for a line, created on first sight for lines the user adds. */
  meta(line: AbstractControl | null | undefined): LineMeta {
    const key = line?.get('lineKey')?.value as string;
    let m = this.metas.get(key);
    if (!m) {
      m = { status: 'pending', statusHistory: [], requiredOn: null };
      this.metas.set(key, m);
    }
    return m;
  }

  isApproved(line: AbstractControl | null | undefined): boolean {
    return this.meta(line).status === 'approved';
  }

  /** Required-on control for a line: required, so a missing date gets the red border once touched. */
  dateControl(line: AbstractControl): FormControl<string | null> {
    const m = this.meta(line);
    if (!m.dateCtl) {
      const ctl = new FormControl<string | null>(m.requiredOn, Validators.required);
      if (m.status === 'approved') ctl.disable({ emitEvent: false });
      ctl.valueChanges.subscribe((v) => {
        m.requiredOn = v;
        this.form.markAsDirty();
      });
      m.dateCtl = ctl;
    }
    return m.dateCtl;
  }

  private touchDates(): void {
    this.metas.forEach((m) => m.dateCtl?.markAsTouched());
  }

  statusClass(status?: string): string {
    switch ((status || 'pending').toLowerCase()) {
      case 'approved': return 'bg-emerald-100 text-emerald-700 border border-emerald-200';
      case 'rejected': return 'bg-red-100 text-red-700 border border-red-200';
      default: return 'bg-amber-100 text-amber-700 border border-amber-200';
    }
  }

  // ── Loading ───────────────────────────────────────────────────────────────────

  private load(): void {
    this.resetEntry();
    if (!this.projectId) return;
    this.loadSub?.unsubscribe();
    this.loading = true;
    this.loadSub = this.technicalService.getTechnicalProjectById(this.projectId).subscribe({
      next: (res) => {
        this.loading = false;
        const p: any = res?.data;
        this.originals = Array.isArray(p?.materialRequest) ? p.materialRequest : [];
        this.existingAttachments = (p?.materialRequestAttachements || []).map((f: any) => ({
          fileName: f.fileName,
          originalname: f.originalname,
          status: f.status || 'pending',
          statusHistory: f.statusHistory || [],
        }));

        const details = this.originals.map((m) => {
          const key = m._id || ItemEntryComponent.newLineKey();
          this.metas.set(key, {
            original: m,
            status: m.status || 'pending',
            statusHistory: m.statusHistory || [],
            requiredOn: m.requiredOn ? new Date(m.requiredOn).toISOString().split('T')[0] : null,
          });
          return { detail: m.itemName, quantity: m.quantity, unitCost: m.estimatedCost, remarks: m.remarks || '', lineKey: key };
        });
        this.seedOptionalItems = details.length ? [{ items: [{ itemName: '', itemDetails: details }] }] : null;
        // Approved lines are read-only; wait for item-entry to build the seeded lines.
        setTimeout(() => this.lockApproved());

        const jobId = p?.jobId?._id || p?.jobId;
        if (jobId) {
          this.subs.add(this.purchaseService.getPurchaseRequestsByJobId(jobId).subscribe({
            next: (r) => (this.purchaseRequests = r.data || []),
            error: () => (this.purchaseRequests = []),
          }));
        }
        this.form.markAsPristine();
      },
      error: () => {
        this.loading = false;
        this.toaster.error('Failed to load material requests');
      },
    });
  }

  private lockApproved(): void {
    for (const option of this.optionalItems.controls) {
      for (const item of (option.get('items') as FormArray).controls) {
        for (const line of (item.get('itemDetails') as FormArray).controls) {
          if (this.isApproved(line)) line.disable({ emitEvent: false });
        }
      }
    }
    this.form.markAsPristine();
  }

  private resetEntry(): void {
    this.step = 1;
    this.seedOptionalItems = null;
    this.metas.clear();
    this.originals = [];
    this.existingAttachments = [];
    this.purchaseRequests = [];
    this.itemEntry ? this.itemEntry.reset() : this.optionalItems.clear();
    this.form.reset({ files: [] });
  }

  // ── Attachments & history ─────────────────────────────────────────────────────

  removeExistingAttachment(index: number): void {
    const file = this.existingAttachments[index];
    if (file.status === 'approved') {
      this.toaster.warning('Cannot remove approved files');
      return;
    }
    this.existingAttachments.splice(index, 1);
    this.form.markAsDirty();
  }

  showHistory(history: any[] | undefined, title: string): void {
    if (!history?.length) {
      this.toaster.info('No status history available');
      return;
    }
    this.dialog.open(StatusHistoryModalComponent, {
      data: {
        title,
        history: history.map((item: any) => {
          const approved = item.status === 'approved';
          const when = item.changedDate ? new Date(item.changedDate).toISOString() : undefined;
          return {
            comment: item.comment || '',
            type: approved ? 'approval' : 'rejection',
            approvedBy: approved ? item.changedBy : undefined,
            rejectedBy: !approved ? item.changedBy : undefined,
            approvedAt: approved ? when : undefined,
            rejectedAt: !approved ? when : undefined,
            _id: item._id || Math.random().toString(),
          };
        }),
      },
      width: '600px',
      maxHeight: '80vh',
    });
  }

  openPurchaseRequests(): void {
    this.dialog.open(PurchaseRequestModalComponent, { width: '800px', data: { purchaseRequests: this.purchaseRequests } });
  }

  // ── Closing & saving ──────────────────────────────────────────────────────────

  onDrawerClosed(discarded: boolean): void {
    if (discarded) this.resetEntry();
    this.closed.emit();
  }

  cancel(): void {
    this.drawer?.requestClose();
  }

  submit(): void {
    if (this.saving) return;
    if (this.step === 1) {
      this.next();
      return;
    }
    if (!this.projectId) {
      this.toaster.error('Technical project ID is required');
      return;
    }
    const missingDate = this.lines().some((l) => !this.isApprovedKey(l.lineKey) && !this.metas.get(l.lineKey)?.requiredOn);
    if (this.optionalItems.invalid || missingDate) {
      this.optionalItems.markAllAsTouched();
      this.touchDates();
      this.itemEntry?.revealInvalid();
      this.toaster.warning(missingDate && !this.optionalItems.invalid ? 'Set a required-on date for every item.' : 'Complete the highlighted required fields.', 'Complete required information');
      return;
    }

    const present = new Set<string>();
    const materialRequest: any[] = this.lines().map((l) => {
      present.add(l.lineKey);
      const m = this.metas.get(l.lineKey)!;
      if (m.status === 'approved' && m.original) return this.asPayload(m.original);
      return {
        _id: m.original?._id,
        itemName: (l.detail || '').trim(),
        quantity: Number(l.quantity) || 1,
        estimatedCost: Number(l.unitCost) || 0,
        requiredOn: new Date(m.requiredOn as string),
        remarks: l.remarks || '',
        status: m.status || 'pending',
        statusHistory: m.statusHistory || [],
      };
    });
    // An approved request can't be dropped, even if its row was removed.
    for (const o of this.originals) {
      if (o.status === 'approved' && !present.has(o._id as string)) materialRequest.push(this.asPayload(o));
    }

    const formData = new FormData();
    formData.append('materialRequest', JSON.stringify(materialRequest));
    formData.append('existingAttachments', JSON.stringify(this.existingAttachments));
    (this.form.controls.files.value || []).forEach((f) => formData.append('attachments', f));

    this.saving = true;
    this.subs.add(this.technicalService.updateMaterialRequest(this.projectId, formData).subscribe({
      next: (res) => {
        this.saving = false;
        if (res.success) {
          this.toaster.success(res.message || 'Material request updated successfully');
          this.form.markAsPristine();
          this.resetEntry();
          this.saved.emit();
          this.closed.emit();
        } else {
          this.toaster.error(res.message || 'Failed to update material request');
        }
      },
      error: () => {
        this.saving = false;
        this.toaster.error('Failed to update material request');
      },
    }));
  }

  private isApprovedKey(key: string): boolean {
    return this.metas.get(key)?.status === 'approved';
  }

  private asPayload(o: MaterialRequest): any {
    return {
      _id: o._id,
      itemName: o.itemName,
      quantity: o.quantity,
      estimatedCost: o.estimatedCost,
      requiredOn: o.requiredOn instanceof Date ? o.requiredOn : new Date(o.requiredOn),
      remarks: o.remarks || '',
      status: o.status,
      statusHistory: o.statusHistory || [],
    };
  }
}
