import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormArray, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { DetailBadgeComponent } from 'src/app/shared/components/detail-panel/detail-badge.component';
import { ItemEntryComponent, ItemEntryOptionValue } from 'src/app/shared/components/item-entry';
import { SmartFormModule, SfOption } from 'src/app/shared/components/smart-form';

@Component({
  selector: 'app-pr-form',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    SmartFormModule,
    DetailBadgeComponent,
    ActionButtonComponent,
    ItemEntryComponent,
  ],
  templateUrl: './pr-form.component.html',
  styleUrl: './pr-form.component.css',
})
export class PrFormComponent {
  @Input({ required: true }) purchaseForm!: FormGroup;
  @Input({ required: true }) entryItems!: FormArray;
  @Input({ required: true }) sourceTitle = '';
  @Input({ required: true }) sourceSubtitle = '';
  @Input({ required: true }) jobOptions!: () => SfOption[];
  @Input({ required: true }) supplierOptions!: () => SfOption[];
  @Input({ required: true }) requestedJobId!: () => string;
  @Input({ required: true }) entrySeed!: () => ItemEntryOptionValue[];
  @Input({ required: true }) itemCount!: () => number;
  @Input({ required: true }) liveTotalLpo!: () => number;
  @Input({ required: true }) currency!: () => string;

  /** A general purchase has no supplier field: it is whoever wins the RFQs. */
  supplierName(): string {
    const id = this.purchaseForm.get('supplierId')?.value;
    return id ? (this.supplierOptions().find((o) => o.value === id)?.label ?? '') : '';
  }

  @Input() isEditing = false;
  @Input() sourceLocked = false;
  @Input() isJobLess = false;
  @Input() selectedJobSheet: unknown;
  @Input() lineLocked: (i: number, j: number, k: number) => boolean = () => false;
  @Input() lineAwarded: (line: any) => boolean = () => true;
  @Input() lineBadge: (i: number, j: number, k: number) => string | null = () => null;

  @Output() jobLessChange = new EventEmitter<boolean>();
  @Output() jobSelected = new EventEmitter<string>();
  @Output() materialRequestsClicked = new EventEmitter<void>();
  /** Ticked lines to ask a supplier about, with the supplier picked in the selection bar if any. */
  @Output() rfqRequested = new EventEmitter<{ positions: { i: number; j: number; k: number }[]; supplierId: string | null }>();
  @Output() createProductRequested = new EventEmitter<void>();

  get f() {
    return this.purchaseForm.controls;
  }
}
