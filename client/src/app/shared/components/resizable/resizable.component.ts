import { Component, HostBinding, Input } from '@angular/core';
import { ResizableDirective } from './resizable.directive';

@Component({
    selector: 'th[resizable]',
    templateUrl: './resizable.component.html',
    styleUrls: ['./resizable.component.css'],
    imports: [ResizableDirective]
})
export class ResizableComponent {
  @HostBinding('style.width.px')
  width: number | null = null;
  @Input('key') key: string | null = null;
  keysObject: { [key: string]: number } = {}

  ngOnInit() {
    if (this.key) {
      const storedKeys = localStorage.getItem('tableWidth')
      if (storedKeys) {
        this.keysObject = JSON.parse(storedKeys);
        const savedWidth = this.keysObject[this.key];
        if (savedWidth) {
          this.width = savedWidth;
        }
      }
    }
  }

  onResize(width: any) {
    this.width = width;
    const storedKeys = localStorage.getItem('tableWidth')
    if (storedKeys) {
      this.keysObject = JSON.parse(storedKeys);
    }
    if (this.key) {
      this.keysObject[this.key] = width;
      localStorage.setItem('tableWidth', JSON.stringify(this.keysObject));
    }
  }
}
