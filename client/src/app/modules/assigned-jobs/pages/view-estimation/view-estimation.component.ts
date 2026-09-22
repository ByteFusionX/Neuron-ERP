import { Component, EventEmitter, booleanAttribute, Input, OnChanges, Output, SimpleChanges, inject } from '@angular/core';
import { DecimalPipe, NgClass, NgFor, NgIf } from '@angular/common';
import { NavigationExtras, Router } from '@angular/router';
import { ConfirmDialogService } from 'src/app/shared/components/confirm-dialog';
import { SmartFormModule } from 'src/app/shared/components/smart-form';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
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
    ParseBoldTextPipe, ParseBracketsTextPipe, NumberFormatterPipe],
})
export class ViewEstimationComponent implements OnChanges {
  @Input() open = false;
  @Input() estimation: Estimations | null = null;
  @Input() enquiryId = '';
  @Input({ transform: booleanAttribute }) editable = false;
  @Output() cleared = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();

  selectedOption = 0;

  private router = inject(Router);
  private confirm = inject(ConfirmDialogService);

  get options(): any[] {
    return this.estimation?.optionalItems ?? [];
  }

  get option(): any {
    return this.options[this.selectedOption];
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
    return (this.profitAmount / this.sellingPrice) * 100 || 0;
  }

  get discount(): number {
    return this.option?.totalDiscount ?? this.estimation?.totalDiscount ?? 0;
  }

  get netAmount(): number {
    return this.sellingPrice - this.discount;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (this.open && (changes['open'] || changes['estimation'])) this.selectedOption = 0;
  }

  profit(d: any): number {
    return d.unitCost && d.unitSellingPrice ? ((d.unitSellingPrice - d.unitCost) / d.unitSellingPrice) * 100 : 0;
  }

  onEdit(): void {
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
