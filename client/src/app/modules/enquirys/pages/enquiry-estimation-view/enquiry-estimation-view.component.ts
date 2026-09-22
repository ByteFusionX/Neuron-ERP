import { Component, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, inject } from '@angular/core';
import { DecimalPipe, NgClass, NgFor, NgIf } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subscription, filter, take } from 'rxjs';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { EnquiryService } from 'src/app/core/services/enquiry/enquiry.service';
import { SmartFormModule } from 'src/app/shared/components/smart-form';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { ParseBoldTextPipe } from 'src/app/shared/pipes/boldParse.pipe';
import { ParseBracketsTextPipe } from 'src/app/shared/pipes/highlightParse.pipe';
import { NumberFormatterPipe } from 'src/app/shared/pipes/numFormatter.pipe';

/**
 * Read-only view of the presale estimation on an enquiry, with a "Revise" request back to
 * presales. The host binds `open` and `enquiry` and reacts to `seen` / `revised` / `closed`.
 */
@Component({
  selector: 'app-enquiry-estimation-view',
  standalone: true,
  templateUrl: './enquiry-estimation-view.component.html',
  imports: [NgIf, NgFor, NgClass, DecimalPipe, ReactiveFormsModule, SmartFormModule, ActionButtonComponent,
    ParseBoldTextPipe, ParseBracketsTextPipe, NumberFormatterPipe],
})
export class EnquiryEstimationViewComponent implements OnChanges, OnDestroy {
  @Input() open = false;
  @Input() enquiry: any = null;
  /** Fired once the sales person who owns the enquiry has opened the estimate. */
  @Output() seen = new EventEmitter<void>();
  /** Fired after a revision request has been sent to presales. */
  @Output() revised = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();

  selectedOption = 0;
  showRevision = false;
  isSaving = false;

  private fb = inject(FormBuilder);
  private enquiryService = inject(EnquiryService);
  private employeeService = inject(EmployeeService);
  private subscriptions = new Subscription();
  private seenSub?: Subscription;

  form = this.fb.group({
    comment: ['', Validators.required],
  });

  get estimations(): any {
    return this.enquiry?.preSale?.estimations;
  }

  get options(): any[] {
    return this.estimations?.optionalItems ?? [];
  }

  get option(): any {
    return this.options[this.selectedOption];
  }

  get estimatedBy(): string {
    const p = this.enquiry?.reAssigned ?? this.enquiry?.preSale?.presalePerson;
    return p ? `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim() : '';
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
    return this.option?.totalDiscount ?? this.estimations?.totalDiscount ?? 0;
  }

  get netAmount(): number {
    return this.sellingPrice - this.discount;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.open || !(changes['open'] || changes['enquiry'])) return;
    this.selectedOption = 0;
    this.showRevision = false;
    this.isSaving = false;
    this.form.reset({ comment: '' });
    this.markSeen();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    this.seenSub?.unsubscribe();
  }

  /** The owning sales person opening the estimate acknowledges it on the server. */
  private markSeen(): void {
    const enquiry = this.enquiry;
    if (!enquiry || enquiry.preSale?.seenbySalesPerson !== false) return;
    this.seenSub?.unsubscribe();
    this.seenSub = this.employeeService.employeeData$
      .pipe(filter((e) => !!e?._id), take(1))
      .subscribe((e) => {
        if (enquiry.salesPerson?._id !== e!._id) return;
        this.enquiryService.markAsSeenEstimation(enquiry._id).subscribe((res: any) => {
          if (res.success) this.seen.emit();
        });
      });
  }

  profit(d: any): number {
    return d.unitCost && d.unitSellingPrice ? ((d.unitSellingPrice - d.unitCost) / d.unitSellingPrice) * 100 : 0;
  }

  toggleRevision(): void {
    this.showRevision = !this.showRevision;
    this.isSaving = false;
  }

  onDrawerClosed(): void {
    this.closed.emit();
  }

  submitRevision(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.isSaving = true;
    this.subscriptions.add(
      this.enquiryService.sendRevision(this.form.getRawValue().comment!, this.enquiry._id).subscribe({
        next: (res: any) => {
          this.isSaving = false;
          if (res.success) this.revised.emit();
        },
        error: () => (this.isSaving = false),
      })
    );
  }

  private sum(fn: (d: any) => number): number {
    let total = 0;
    (this.option?.items ?? []).forEach((item: any) =>
      (item.itemDetails ?? []).forEach((d: any) => (total += fn(d) || 0))
    );
    return total;
  }
}
