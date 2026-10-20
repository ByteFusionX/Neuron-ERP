import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { FormArray, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { NgIcon } from '@ng-icons/core';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { DetailBadgeComponent } from 'src/app/shared/components/detail-panel/detail-badge.component';
import { ItemEntryComponent, ItemEntryOptionValue } from 'src/app/shared/components/item-entry';
import { LineSupplierOffer } from 'src/app/shared/components/item-entry/item-entry.component';
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
    NgIcon,
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

  /** The host renders Add item itself (drawer footer), so the entry toolbar omits it. */
  @Input() externalAddButtons = false;
  @ViewChild(ItemEntryComponent) itemEntry?: ItemEntryComponent;

  @Input() isEditing = false;
  @Input() sourceLocked = false;
  @Input() isJobLess = false;
  @Input() selectedJobSheet: unknown;
  @Input() lineLocked: (i: number, j: number, k: number) => boolean = () => false;
  @Input() lineAwarded: (line: any) => boolean = () => true;
  @Input() lineBadge: (i: number, j: number, k: number) => string | null = () => null;

  @Input() lineOffers: (line: any) => LineSupplierOffer[] = () => [];
  @Output() offerPicked = new EventEmitter<{ lineKey: string; offer: LineSupplierOffer }>();

  @Input() supplierTabs: { id: string; name: string; count: number }[] = [];
  @Input() activeTab = 'items';
  addingSupplier = false;
  @Output() tabSelected = new EventEmitter<string>();
  @Output() supplierAdded = new EventEmitter<string>();

  @Output() jobLessChange = new EventEmitter<boolean>();
  @Output() jobSelected = new EventEmitter<string>();
  @Output() materialRequestsClicked = new EventEmitter<void>();
  /** Ticked lines to ask a supplier about, with the supplier picked in the selection bar if any. */
  @Output() createProductRequested = new EventEmitter<void>();
  @Output() addToRfq = new EventEmitter<{ supplierId: string; lineKeys: string[] }>();

  get f() {
    return this.purchaseForm.controls;
  }
}
