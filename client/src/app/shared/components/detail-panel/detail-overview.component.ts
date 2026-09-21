import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { DataGridComponent } from '../data-grid/data-grid.component';
import { DataGridFieldComponent } from '../data-grid/data-grid-field.component';
import { DataGridAutofocusDirective } from '../data-grid/data-grid-autofocus.directive';
import { DetailSectionComponent } from './detail-section.component';
import { DetailFieldComponent } from './detail-field.component';
import { DetailTextareaFieldComponent } from './detail-textarea-field.component';
import { DetailBadgeComponent } from './detail-badge.component';
import { DetailProgressComponent } from './detail-progress.component';
import { DetailPanelIconComponent } from './detail-panel-icon.component';
import { DetailOverviewField, DetailOverviewSection } from './detail-panel.model';

/**
 * Key/value "Details" tab body: a list of titled sections, each a list of fields bound to a grid
 * column (type 'dg'), a static value (type 'field'), a standalone  q  pill (type 'badge') or a
 * progress meter (type 'progress'). A 'dg' field can also carry a `badge` to render a status pill
 * under its value (e.g. an overdue indicator under a due date). Used for the general info tab and
 * merged into it for modules that also have a key/value tab (e.g. deal/finance status) — same
 * section/field markup, only the `sections` config differs per module.
 *
 *   <app-detail-overview [grid]="grid" [row]="row" [sections]="overviewSections(row)"></app-detail-overview>
 */
@Component({
  selector: 'app-detail-overview',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    DataGridFieldComponent,
    DataGridAutofocusDirective,
    DetailSectionComponent,
    DetailFieldComponent,
    DetailTextareaFieldComponent,
    DetailBadgeComponent,
    DetailProgressComponent,
    DetailPanelIconComponent,
  ],
  template: `
    <div class="dov-section" *ngFor="let s of sections; trackBy: trackSection">
      <app-detail-section *ngIf="s.visible !== false" [title]="s.title" [columns]="s.columns || '1'">
        <ng-container *ngFor="let f of s.fields; trackBy: trackField">
          <ng-container *ngIf="f.visible !== false">
            <div *ngIf="f.type === 'dg' && f.badge; else dgField">
              <app-dg-field [grid]="grid" [row]="row" [key]="f.key!" [label]="f.label || ''"
                [stacked]="f.stacked ?? (s.columns === '2')" [noHover]="f.noHover ?? false"></app-dg-field>
              <app-detail-badge *ngIf="f.badge!.visible !== false" class="mt-1"
                [label]="f.badge!.label" [tone]="f.badge!.tone || 'neutral'" [dot]="f.badge!.dot ?? false"></app-detail-badge>
            </div>
            <ng-template #dgField>
              <app-dg-field *ngIf="f.type === 'dg'" [grid]="grid" [row]="row" [key]="f.key!" [label]="f.label || ''"
                [stacked]="f.stacked ?? (s.columns === '2')" [noHover]="f.noHover ?? false"></app-dg-field>
            </ng-template>
            <app-detail-field *ngIf="f.type === 'field'" [label]="f.label || ''" [tone]="f.tone ?? null"
              [stacked]="f.stacked ?? (s.columns === '2')" [noHover]="f.noHover ?? false">
              <app-detail-textarea-field *ngIf="f.editable && f.editor === 'textarea'; else standardField"
                [value]="f.value" [ariaLabel]="f.label || ''" (save)="f.onSave?.($event)"></app-detail-textarea-field>
              <ng-template #standardField>
              <ng-container *ngIf="f.editable; else staticFieldValue">
                <ng-container *ngIf="editingKey === fieldKey(s, f); else fieldDisplay">
                  <select *ngIf="f.editor === 'select'" class="dov-input" dgAutofocus [ngModel]="editValue"
                    (ngModelChange)="editValue = $event; commitField(f)" (blur)="commitField(f)" (keydown.escape)="cancelField($event)">
                    <option *ngFor="let o of f.editorOptions" [ngValue]="o.value">{{ o.label }}</option>
                  </select>
                  <input *ngIf="f.editor !== 'select'" class="dov-input" dgAutofocus [(ngModel)]="editValue"
                    [type]="f.editor === 'number' ? 'number' : f.editor === 'date' ? 'date' : 'text'"
                    (keydown.enter)="commitField(f)" (keydown.escape)="cancelField($event)" (blur)="commitField(f)" />
                </ng-container>
                <ng-template #fieldDisplay>
                  <button type="button" class="dov-value group/dov" (click)="startField(s, f)" [attr.aria-label]="'Edit ' + (f.label || '')">
                    <span [class.tabular-nums]="f.numeric">{{ f.value ?? '—' }}</span>
                    <app-dp-icon name="note" size="w-3.5 h-3.5" class="ml-auto text-gray-400 dark:text-gray-500 opacity-0 group-hover/dov:opacity-100"></app-dp-icon>
                  </button>
                </ng-template>
              </ng-container>
              <ng-template #staticFieldValue>
                <app-detail-badge *ngIf="f.pill && f.value; else plainValue" class="capitalize" [label]="f.value" [tone]="f.tone || 'neutral'"></app-detail-badge>
                <ng-template #plainValue><span [class.tabular-nums]="f.numeric">{{ f.value ?? '—' }}</span></ng-template>
              </ng-template>
              </ng-template>
            </app-detail-field>
            <app-detail-badge *ngIf="f.type === 'badge'" [label]="f.label || ''" [tone]="f.tone || 'neutral'" [dot]="f.dot ?? false"></app-detail-badge>
            <app-detail-progress *ngIf="f.type === 'progress'" [label]="f.label || ''" [value]="f.value" [tone]="f.tone || 'active'"
              [max]="f.max ?? null" [display]="f.display ?? null" [marker]="f.marker ?? null" [caption]="f.caption || ''"></app-detail-progress>
          </ng-container>
        </ng-container>
      </app-detail-section>

      <p *ngIf="s.visible === false && s.emptyMessage" class="text-[13px] text-gray-500 dark:text-gray-400 px-1">{{ s.emptyMessage }}</p>
    </div>
  `,
  styles: [`
    :host { display: block; --dp-rule: #d1d5db; }
    :host-context(html.dark) { --dp-rule: #3f3f46; }
    /* Full-bleed rule: cancel the tab body's horizontal padding so the line spans the panel. */
    .dov-section + .dov-section { margin: 1.5rem calc(var(--dp-pad, 1.25rem) * -1) 0;
      padding: 1.5rem var(--dp-pad, 1.25rem) 0; border-top: 1px solid var(--dp-rule); }
    .dov-value { display: flex; align-items: center; gap: 0.5rem; width: calc(100% + 0.75rem); min-height: 1.875rem;
      margin: -0.25rem -0.375rem; padding: 0.25rem 0.375rem; border-radius: 0.375rem; text-align: left;
      transition: background-color 120ms ease; }
    .dov-value:focus-visible { background: #f3f4f6; outline: none; }
    .dov-input { width: 100%; height: 1.875rem; padding: 0 0.5rem; font-size: 0.8125rem; border: 1px solid #7c3aed;
      border-radius: 0.375rem; outline: none; box-shadow: 0 0 0 3px rgb(124 58 237 / 0.15); background: #fff; }
    :host-context(html.dark) .dov-value:focus-visible { background: #262626; }
    :host-context(html.dark) .dov-input { background: #1a1a1a; color: #ededed; }
  `],
})
export class DetailOverviewComponent<T extends Record<string, any> = any> {
  @Input({ required: true }) grid!: DataGridComponent<T>;
  @Input({ required: true }) row!: T;
  @Input() sections: DetailOverviewSection[] = [];

  editingKey: string | null = null;
  editValue: any = null;

  /** Sections/fields are regenerated (new object refs) on every CD cycle via `overviewSections(row)`,
   * so identity can't be used to track which field is being edited — use a stable string key instead. */
  fieldKey(s: DetailOverviewSection, f: DetailOverviewField): string {
    return s.title + '|' + (f.key || f.label);
  }

  trackSection(_index: number, s: DetailOverviewSection): string {
    return s.title;
  }

  trackField(index: number, f: DetailOverviewField): string {
    return f.key || f.label || String(index);
  }

  startField(s: DetailOverviewSection, f: DetailOverviewField): void {
    this.editValue = f.value;
    this.editingKey = this.fieldKey(s, f);
  }

  commitField(f: DetailOverviewField): void {
    if (this.editingKey === null) return;
    this.editingKey = null;
    if (this.editValue !== f.value) f.onSave?.(this.editValue);
  }

  cancelField(event: Event): void {
    event.stopPropagation();
    this.editingKey = null;
  }
}
