import { Component, Input, forwardRef, OnDestroy, ChangeDetectorRef, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { EmailSearchService, EmailSuggestion } from 'src/app/core/services/email-search.service';
import { Subject, debounceTime, distinctUntilChanged, switchMap, takeUntil } from 'rxjs';
import { TechnicalService } from 'src/app/core/services/technical.service';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-email-tag-input',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './email-tag-input.component.html',
  styleUrl: './email-tag-input.component.css',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => EmailTagInputComponent),
      multi: true
    }
  ]
})
export class EmailTagInputComponent implements ControlValueAccessor, OnDestroy {
  @Input() label = '';
  @Input() placeholder = 'Enter email addresses...';
  @Input() isSubmitted = false;
  @Input() id = '';

  emails: string[] = [];
  inputValue = '';
  suggestions: EmailSuggestion[] = [];
  showSuggestions = false;
  selectedSuggestionIndex = -1;
  disabled = false;
  
  private searchSubject = new Subject<string>();
  private destroy$ = new Subject<void>();
  private blurTimeout: any;
  
  onChange: any = () => {};
  onTouched: any = () => {};

  constructor(
    private emailSearchService: EmailSearchService,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone,
    private toast: ToastrService
  ) {
    this.searchSubject.pipe(
      debounceTime(150),
      distinctUntilChanged(),
      switchMap(query => this.emailSearchService.searchPersons(query)),
      takeUntil(this.destroy$)
    ).subscribe(suggestions => {
      this.ngZone.run(() => {
        this.suggestions = suggestions || [];
        this.showSuggestions = this.showSuggestionsDropdown();
        this.selectedSuggestionIndex = -1;
        this.cdr.detectChanges();
      });
    });
  }

  ngOnInit() {
    if (!this.id) {
      this.id = this.label.toLowerCase().replace(/\s+/g, '-') + '-email-input';
    }
  }

  ngOnDestroy() {
    if (this.blurTimeout) {
      clearTimeout(this.blurTimeout);
    }
    this.destroy$.next();
    this.destroy$.complete();
  }

  onInputChange(event: Event): void {
    this.inputValue = (event.target as HTMLInputElement).value;
    
    // Clear any pending blur timeout
    if (this.blurTimeout) {
      clearTimeout(this.blurTimeout);
      this.blurTimeout = null;
    }
    
    if (this.inputValue.trim().length > 1) {
      this.searchSubject.next(this.inputValue);
    } else {
      this.suggestions = [];
      this.showSuggestions = false;
      this.cdr.detectChanges();
    }
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (this.selectedSuggestionIndex >= 0) {
        if (this.selectedSuggestionIndex < this.suggestions.length) {
          this.selectSuggestion(this.suggestions[this.selectedSuggestionIndex]);
        } else {
          // Selected the manual add option
          this.addCurrentEmail();
        }
      } else {
        this.addCurrentEmail();
      }
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      const maxIndex = this.suggestions.length + (this.shouldShowManualAddOption() ? 0 : -1);
      this.selectedSuggestionIndex = Math.min(this.selectedSuggestionIndex + 1, maxIndex);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.selectedSuggestionIndex = Math.max(this.selectedSuggestionIndex - 1, -1);
    } else if (event.key === 'Escape') {
      this.hideSuggestions();
    }
  }

  onInputBlur(): void {
    this.blurTimeout = setTimeout(() => {
      this.hideSuggestions();
      this.cdr.detectChanges();
    }, 200);
  }

  onInputFocus(): void {
    // Clear any pending blur timeout
    if (this.blurTimeout) {
      clearTimeout(this.blurTimeout);
      this.blurTimeout = null;
    }
    
    if (this.showSuggestionsDropdown()) {
      this.showSuggestions = true;
      this.cdr.detectChanges();
    }
  }

  addCurrentEmail(): void {
    const value = this.inputValue.trim();
    if (value && this.isValidEmail(value) && !this.emails.includes(value)) {
      this.emails = [...this.emails, value];
      this.inputValue = '';
      this.hideSuggestions();
      this.emitChange();
      
      // Check if this email is not in existing suggestions (new contact)
      const isExistingContact = this.suggestions.some(suggestion => 
        suggestion.email.toLowerCase() === value.toLowerCase()
      );
      
      if (!isExistingContact) {
        // Add to contacts silently in background
        this.emailSearchService.addContact(value).subscribe({
          next: () => {
            this.toast.success('Contact added successfully');
          },
          error: (error) => {
            this.toast.error('Failed to add contact');
            console.warn('Failed to add contact:', error);
          }
        });
      }
    }
  }

  selectSuggestion(suggestion: EmailSuggestion): void {
    if (!this.emails.includes(suggestion.email)) {
      this.emails = [...this.emails, suggestion.email];
      this.inputValue = '';
      this.hideSuggestions();
      this.emitChange();
    }
  }

  removeEmail(index: number): void {
    this.emails = this.emails.filter((_, i) => i !== index);
    this.emitChange();
  }

  hideSuggestions(): void {
    this.showSuggestions = false;
    this.selectedSuggestionIndex = -1;
  }

  showSuggestionsDropdown(): boolean {
    return this.inputValue.trim().length > 0 && (this.suggestions.length > 0 || this.shouldShowManualAddOption());
  }

  shouldShowManualAddOption(): boolean {
    return this.inputValue.trim().length > 0;
  }

  isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  emitChange(): void {
    this.onChange(this.emails);
    this.onTouched();
  }

  writeValue(value: string[]): void {
    if (Array.isArray(value)) {
      this.emails = value;
    } else if (typeof value === 'string' && value) {
      this.emails = (value as string).split(',').map((item: string) => item.trim()).filter((item: string) => item);
    } else {
      this.emails = [];
    }
  }

  registerOnChange(fn: any): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: any): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }
} 