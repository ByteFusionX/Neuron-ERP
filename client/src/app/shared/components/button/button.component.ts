import { CommonModule } from '@angular/common';
import {  Component, EventEmitter, Input, Output } from '@angular/core';
import { RouterModule } from '@angular/router';
import { IconsModule } from 'src/app/lib/icons/icons.module';

@Component({
  selector: 'app-btn',
  imports: [IconsModule,RouterModule,CommonModule],
  templateUrl: './button.component.html',
  styleUrl: './button.component.css',
})
export class ButtonComponent { 
  @Input() theme: 'primary' | 'secondary' | 'danger' | 'warning' | 'filter' | 'cancel' | 'success' | 'primary-outline' | 'secondary-outline' = 'primary';
  @Input() type: 'button' | 'submit' | 'reset' = 'button';
  @Input() size: 'sm' | 'md' | 'lg' = 'md';
  @Input() disabled = false;
  @Input() loading = false;
  @Input() fullWidth = false;
  @Input() routerLink: string | null = null;
  
  @Output() buttonClick = new EventEmitter<MouseEvent>();

  onClick(event: MouseEvent): void {
    if (!this.disabled && !this.loading) {
      this.buttonClick.emit(event);
    }
  }

  getButtonClasses(): { [key: string]: boolean } {
    const sizeClasses = {
      'sm': 'py-1.5 px-3 text-xs',
      'md': 'py-2 px-4 text-sm',
      'lg': 'py-2.5 px-5 text-base'
    };

    const themeClasses = {
      'primary': 'bg-violet-700 hover:bg-violet-600 text-white',
      'secondary': 'border border-gray-300 hover:bg-gray-100 text-black',
      'danger': 'bg-red-600 hover:bg-red-700 text-white',
      'warning': 'bg-orange-500 hover:bg-orange-700 text-white',
      'filter': 'bg-orange-500 hover:bg-orange-700 text-white text-xs',
      'cancel': 'border border-gray-300 hover:bg-gray-100 text-black',
      'success': 'bg-green-600 hover:bg-green-700 text-white',
      'primary-outline': 'border border-violet-700 text-violet-700 hover:shadow-md',
      'secondary-outline': 'border border-gray-500 text-gray-700 hover:shadow-md'
    };
    
    const baseClass = {};
    const sizeClass = sizeClasses[this.size] || sizeClasses['md'];
    const themeClass = themeClasses[this.theme] || themeClasses['primary'];
    
    const classes = {
      ...baseClass,
      [sizeClass]: true,
      [themeClass]: true,
      'opacity-60 cursor-not-allowed': this.disabled
    };
    
    return classes;
  }
}
