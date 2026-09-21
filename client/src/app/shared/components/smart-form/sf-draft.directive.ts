import { Directive, Input, OnDestroy, OnInit, inject } from '@angular/core';
import { FormGroupDirective } from '@angular/forms';
import { Subscription, debounceTime } from 'rxjs';

interface StoredDraft {
  value: Record<string, any>;
  savedAt: string;
}

/**
 * Autosaves a reactive form to localStorage while it is dirty: `<form [formGroup]="f" sfDraft="projects-new" #draft="sfDraft">`.
 * A draft found on load is offered via `pending` — call restore() or discard().
 */
@Directive({ selector: '[sfDraft]', standalone: true, exportAs: 'sfDraft' })
export class SfDraftDirective implements OnInit, OnDestroy {
  @Input('sfDraft') key = '';
  /** Controls that can't be serialized (files) or shouldn't persist */
  @Input() sfDraftExclude: string[] = [];
  /** Lets a host that reuses one form for create and edit switch autosave off for the latter. */
  @Input() sfDraftDisabled = false;

  pending: StoredDraft | null = null;
  savedAt: Date | null = null;

  private fg = inject(FormGroupDirective);
  private sub?: Subscription;

  private get storageKey(): string {
    return `sf-draft:${this.key}`;
  }

  ngOnInit(): void {
    // `pending` is only readable once this runs, so host templates must not read it from an
    // element that is checked before the form (it would flip null -> value in one pass, NG0100).
    try {
      const raw = localStorage.getItem(this.storageKey);
      this.pending = raw ? JSON.parse(raw) : null;
    } catch {
      this.pending = null;
    }
    this.sub = this.fg.form.valueChanges.pipe(debounceTime(600)).subscribe(() => {
      if (!this.sfDraftDisabled && this.fg.form.dirty) this.save();
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  save(): void {
    const value = { ...this.fg.form.getRawValue() };
    this.sfDraftExclude.forEach((k) => delete value[k]);
    try {
      localStorage.setItem(this.storageKey, JSON.stringify({ value, savedAt: new Date().toISOString() }));
      this.savedAt = new Date();
      this.pending = null;
    } catch {
      // storage full or blocked; autosave is best-effort
    }
  }

  restore(): void {
    if (!this.pending) return;
    this.fg.form.patchValue(this.pending.value);
    this.fg.form.markAsDirty();
    this.pending = null;
  }

  discard(): void {
    this.pending = null;
    this.clear();
  }

  clear(): void {
    this.savedAt = null;
    try {
      localStorage.removeItem(this.storageKey);
    } catch {}
  }
}
