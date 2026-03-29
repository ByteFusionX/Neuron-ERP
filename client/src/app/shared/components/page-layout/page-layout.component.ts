import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { NgIconsModule } from '@ng-icons/core';
import { IconsModule } from 'src/app/lib/icons/icons.module';
import { ButtonComponent } from '../button/button.component';

export interface PageFooterButton {
  label: string;
  onClick: () => void;
  theme?: 'primary' | 'secondary' | 'cancel' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  icon?: string;
  type?: 'button' | 'submit';
}

@Component({
  selector: 'app-page-layout',
  standalone: true,
  imports: [CommonModule, NgIconsModule, IconsModule, ButtonComponent],
  templateUrl: './page-layout.component.html',
  styleUrls: ['./page-layout.component.css']
})
export class PageLayoutComponent {
  @Input() title: string = '';
  @Input() subtitle?: string;
  @Input() onClose: () => void = () => {};
  @Input() footerButtons: PageFooterButton[] = [];
  @Input() showFooter: boolean = true;
  @Input() showHeader: boolean = true;
  @Input() contentMaxHeight: string = 'auto';
  @Input() headerClass: string = '';
  @Input() contentClass: string = '';
  @Input() footerClass: string = '';
  @Input() showCloseButton: boolean = true;
}
