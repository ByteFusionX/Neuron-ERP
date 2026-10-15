import { Component, inject } from '@angular/core';
import { Observable, catchError, firstValueFrom, forkJoin, map, of } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { ConfirmDialogService } from 'src/app/shared/components/confirm-dialog';
import { MasterListName, MasterListService } from 'src/app/core/services/master-list.service';
import { ModalService } from 'src/app/shared/components/modal';
import { NoteFormComponent } from '../note-form/note-form.component';
import { MasterCustomRow, MasterDataGridComponent, MasterTab } from './master-data-grid.component';

interface NoteType {
  /** Key the notes API uses for this kind of entry. */
  key: string;
  list: MasterListName;
  label: string;
}

const QUOTE_TYPES: NoteType[] = [
  { key: 'customerNotes', list: 'customerNote', label: 'Customer Note' },
  { key: 'termsAndConditions', list: 'termsAndConditions', label: 'Terms & Conditions' },
];

const PURCHASE_TYPES: NoteType[] = [
  { key: 'purchaseTermsNotes', list: 'purchaseTermsNotes', label: 'Terms & Notes' },
  { key: 'placeOfDelivery', list: 'placeOfDelivery', label: 'Place of Delivery' },
  { key: 'shippingTerms', list: 'shippingTerms', label: 'Shipping Terms' },
];

const DIALOG_SIZE = { width: '560px' };

@Component({
  selector: 'app-notes-terms-data',
  standalone: true,
  imports: [MasterDataGridComponent],
  template: `
    <app-master-data-grid label="Notes & Terms" storageKey="notes-terms" [tabs]="tabs"
      description="Default notes and terms printed on quotations and purchase orders."></app-master-data-grid>
  `,
})
export class NotesTermsDataComponent {
  private modal = inject(ModalService);
  private toast = inject(ToastrService);
  private confirm = inject(ConfirmDialogService);
  private masterList = inject(MasterListService);

  tabs: MasterTab[] = [
    {
      id: 'quote', label: 'Quote Terms', title: 'quote term', typeColumn: true,
      hint: 'Customer notes and terms & conditions offered when preparing a quotation.',
      custom: this.customFor(QUOTE_TYPES),
    },
    {
      id: 'purchase', label: 'Purchase Terms', title: 'purchase term', typeColumn: true,
      hint: 'Terms & notes, place of delivery and shipping terms used when issuing a purchase order (LPO).',
      custom: this.customFor(PURCHASE_TYPES),
    },
  ];

  private customFor(types: NoteType[]): NonNullable<MasterTab['custom']> {
    return {
      load: () => this.load(types),
      create: () => this.openForm(types),
      edit: (row) => this.openForm(types, row),
      remove: (row) => this.remove(row),
    };
  }

  private load(types: NoteType[]): Observable<MasterCustomRow[]> {
    return forkJoin(types.map((t) => this.masterList.getItems(t.list).pipe(
      // One failing list must not blank the whole table.
      catchError((e) => { this.toast.error(e?.error?.message || `Could not load ${t.label}`); return of({ success: false, data: [] as any[] }); }),
    ))).pipe(
      map((results) =>
        results.flatMap((res, i) =>
          (res.data ?? []).map((item): MasterCustomRow => ({
            _id: item._id,
            name: item.label,
            type: types[i].label,
            createdBy: item.createdBy ? `${item.createdBy.firstName ?? ''} ${item.createdBy.lastName ?? ''}`.trim() : '',
            createdAt: item.createdAt ?? '',
            status: item.isActive ? 'Active' : 'Inactive',
            source: { ...item, noteKey: types[i].key },
          })),
        ),
      ),
    );
  }

  private async openForm(types: NoteType[], row?: MasterCustomRow): Promise<boolean> {
    const ref = this.modal.open<{ key: string; note: string }>(NoteFormComponent, {
      ...DIALOG_SIZE,
      data: {
        types: types.map((t) => ({ key: t.key, label: t.label })),
        typeKey: row?.source.noteKey,
        typeLabel: row?.type,
        note: row?.name,
        noteId: row?._id,
      },
    });
    const result = await firstValueFrom(ref.afterClosed());
    if (!result) return false;
    const list = types.find((t) => t.key === result.key)?.list ?? types[0].list;
    try {
      if (row) await firstValueFrom(this.masterList.updateItem(list, row._id, { label: result.note }));
      else await firstValueFrom(this.masterList.createItem(list, { label: result.note, value: null }));
      this.toast.success(row ? 'Changes saved' : 'Added');
      return true;
    } catch (e: any) {
      this.toast.error(e?.error?.message || 'Could not save');
      return false;
    }
  }

  private async remove(row: MasterCustomRow): Promise<boolean> {
    const { confirmed } = await this.confirm.open({
      tone: 'reject',
      title: 'Delete Note?',
      message: 'Are you sure you want to delete this entry?',
      consequence: 'This cannot be undone.',
      confirmLabel: 'Delete',
    });
    if (!confirmed) return false;
    try {
      await firstValueFrom(this.masterList.deleteItem(row.source.list, row._id));
      return true;
    } catch (e: any) {
      this.toast.error(e?.error?.message || 'Could not delete');
      return false;
    }
  }
}
