import { Component, ElementRef, EventEmitter, HostListener, Input, OnDestroy, OnInit, Output, inject } from '@angular/core';

/** Full-screen image preview over a blurred backdrop. Moves itself to <body> so no parent clips or stacks over it. */
@Component({
  selector: 'app-image-viewer',
  standalone: true,
  template: `
    <div class="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-6 backdrop-blur-md" role="dialog" aria-modal="true" aria-label="Image preview" (click)="closed.emit()">
      <img [src]="src" [alt]="alt" class="max-h-full max-w-full rounded-lg object-contain shadow-2xl" (click)="$event.stopPropagation()" />
      <button type="button" aria-label="Close image" title="Close" (click)="closed.emit()"
        class="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-xl leading-none text-gray-700 hover:bg-white">&times;</button>
    </div>
  `,
})
export class ImageViewerComponent implements OnInit, OnDestroy {
  @Input({ required: true }) src = '';
  @Input() alt = 'Image preview';
  @Output() closed = new EventEmitter<void>();

  private host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  ngOnInit(): void {
    document.body.appendChild(this.host);
  }

  ngOnDestroy(): void {
    this.host.remove();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closed.emit();
  }
}
