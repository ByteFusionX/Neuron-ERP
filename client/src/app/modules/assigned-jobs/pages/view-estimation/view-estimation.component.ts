import { Component, EventEmitter, booleanAttribute, Input, OnChanges, Output, SimpleChanges, inject } from '@angular/core';
import { DecimalPipe, NgClass, NgFor, NgIf } from '@angular/common';
import { NavigationExtras, Router } from '@angular/router';
import { DomSanitizer } from '@angular/platform-browser';
import { ConfirmDialogService } from 'src/app/shared/components/confirm-dialog';
import { SmartFormModule } from 'src/app/shared/components/smart-form';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { DetailTableComponent } from 'src/app/shared/components/detail-panel/detail-table.component';
import { DetailSectionComponent } from 'src/app/shared/components/detail-panel/detail-section.component';
import { DetailFieldComponent } from 'src/app/shared/components/detail-panel/detail-field.component';
import { DetailClauseListComponent } from 'src/app/shared/components/detail-panel/detail-clause-list.component';
import { DetailClause, DetailTableColumn } from 'src/app/shared/components/detail-panel/detail-panel.model';
import { ParseBoldTextPipe } from 'src/app/shared/pipes/boldParse.pipe';
import { ParseBracketsTextPipe } from 'src/app/shared/pipes/highlightParse.pipe';
import { NumberFormatterPipe } from 'src/app/shared/pipes/numFormatter.pipe';
import { Estimations } from 'src/app/shared/interfaces/enquiry.interface';

/**
 * Drawer showing a presale estimation. With `editable` the presale engineer can also edit it
 * (navigates to the edit page) or clear it (emits `cleared` once confirmed; the host does the delete).
 */
@Component({
  selector: 'app-view-estimation',
  standalone: true,
  templateUrl: './view-estimation.component.html',
  imports: [NgIf, NgFor, NgClass, DecimalPipe, SmartFormModule, ActionButtonComponent,
    DetailTableComponent, DetailSectionComponent, DetailFieldComponent, DetailClauseListComponent,
    ParseBoldTextPipe, ParseBracketsTextPipe, NumberFormatterPipe],
})
export class ViewEstimationComponent implements OnChanges {
  @Input() open = false;
  @Input() estimation: Estimations | null = null;
  @Input() enquiryId = '';
  @Input({ transform: booleanAttribute }) editable = false;
  /** 'route' navigates to the old edit page (default, unchanged for other hosts); 'emit' raises `edit` instead. */
  @Input() editMode: 'route' | 'emit' = 'route';
  @Output() cleared = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();
  @Output() edit = new EventEmitter<Estimations>();

  selectedOption = 0;
  tab: 'items' | 'summary' = 'items';

  private router = inject(Router);
  private confirm = inject(ConfirmDialogService);
  private numberFormatter = new NumberFormatterPipe();
  private boldPipe = new ParseBoldTextPipe();
  private bracketsPipe = new ParseBracketsTextPipe(inject(DomSanitizer));

  readonly itemCols: DetailTableColumn[] = [
    { key: 'detail', label: 'Item Details', type: 'html', wrap: true },
    { key: 'quantity', label: 'Qty', type: 'number' },
    { key: 'unitCost', label: 'Unit Cost', align: 'right' },
    { key: 'totalCost', label: 'Total Cost', align: 'right', total: true, totalKey: 'totalCostRaw', totalFormat: '1.2-2' },
    { key: 'profit', label: 'Profit', align: 'right' },
    { key: 'unitPrice', label: 'Unit Price', align: 'right' },
    { key: 'totalPrice', label: 'Total Price', align: 'right', emphasis: true, total: true, totalKey: 'totalPriceRaw', totalFormat: '1.2-2' },
    { key: 'availability', label: 'Avbl.', type: 'badge', badgeTones: { 'Ex-Stock': 'good', 'ex-stock': 'good' } },
  ];

  get options(): any[] {
    return this.estimation?.optionalItems ?? [];
  }

  get option(): any {
    return this.options[this.selectedOption];
  }

  get itemRows(): Record<string, any>[] {
    const rows: Record<string, any>[] = [];
    (this.option?.items ?? []).forEach((item: any) => {
      rows.push({
        _group: true,
        label: item.itemName,
        badge: item.isOptional ? 'Optional' : '',
        note: item.isOptional ? (item.includeInTotal ? 'Included in total' : 'Excluded from total') : '',
      });
      (item.itemDetails ?? []).forEach((d: any) => {
        const totalCost = (d.quantity || 0) * (d.unitCost || 0);
        const totalPrice = (d.quantity || 0) * (d.unitSellingPrice || 0);
        rows.push({
          detail: this.boldPipe.transform(this.bracketsPipe.transform(d.detail) as string),
          quantity: d.quantity,
          unitCost: this.numberFormatter.transform(d.unitCost),
          totalCost: this.numberFormatter.transform(totalCost),
          totalCostRaw: totalCost,
          totalPriceRaw: totalPrice,
          _excludeFromTotal: !!item.isOptional && !item.includeInTotal,
          profit: this.profit(d).toFixed(2) + '%',
          unitPrice: this.numberFormatter.transform(d.unitSellingPrice),
          totalPrice: this.numberFormatter.transform(totalPrice),
          availability: d.availability,
        });
      });
    });
    return rows;
  }

  get noteClauses(): DetailClause[] {
    const note = (this.estimation?.presaleNote || '').trim();
    return note ? [{ id: 'presale', title: 'Presale Note', body: note }] : [];
  }

  get totalCost(): number {
    return this.sum((d) => d.quantity * d.unitCost);
  }

  get sellingPrice(): number {
    return this.sum((d) => d.unitSellingPrice * d.quantity);
  }

  get profitAmount(): number {
    return this.sellingPrice - this.totalCost || 0;
  }

  get profitPercent(): number {
    return ((this.sellingPrice - this.totalCost) / this.sellingPrice) * 100 || 0;
  }

  get discount(): number {
    return this.option?.totalDiscount ?? this.estimation?.totalDiscount ?? 0;
  }

  get netAmount(): number {
    return this.sellingPrice - this.discount;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (this.open && (changes['open'] || changes['estimation'])) {
      this.selectedOption = 0;
      this.tab = 'items';
    }
  }

  profit(d: any): number {
    return d.unitCost && d.unitSellingPrice ? ((d.unitSellingPrice - d.unitCost) / d.unitSellingPrice) * 100 : 0;
  }

  onEdit(): void {
    if (this.editMode === 'emit') {
      if (this.estimation) this.edit.emit(this.estimation);
      return;
    }
    const navigationExtras: NavigationExtras = {
      state: { estimation: this.estimation, enquiryId: this.enquiryId },
    };
    this.closed.emit();
    this.router.navigate(['/assigned-jobs/edit-estimations'], navigationExtras);
  }

  async onClear(): Promise<void> {
    const { confirmed } = await this.confirm.open({
      tone: 'reject',
      title: 'Clear Estimation',
      message: 'This removes your estimation and you will have to re-estimate.',
      consequence: 'This cannot be undone.',
      confirmLabel: 'Clear estimation',
      cancelLabel: 'Keep it',
    });
    if (confirmed) this.cleared.emit();
  }

  private sum(fn: (d: any) => number): number {
    let total = 0;
    (this.option?.items ?? []).forEach((item: any) =>
      (item.itemDetails ?? []).forEach((d: any) => (total += fn(d) || 0))
    );
    return total;
  }
}
