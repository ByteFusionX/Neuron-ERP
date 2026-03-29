import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { NgIconsModule } from '@ng-icons/core';
import { IconsModule } from 'src/app/lib/icons/icons.module';
import { ButtonComponent } from '../button/button.component';

export interface ModalFooterButton {
  label: string;
  onClick: () => void;
  theme?: 'primary' | 'secondary' | 'cancel' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  icon?: string;
  type?: 'button' | 'submit';
}

@Component({
  selector: 'app-modal-layout',
  standalone: true,
  imports: [CommonModule, DragDropModule, NgIconsModule, IconsModule, ButtonComponent],
  templateUrl: './modal-layout.component.html',
  styleUrls: ['./modal-layout.component.css']
})
export class ModalLayoutComponent {
  @Input() title: string = '';
  @Input() subtitle?: string;
  @Input() onClose: () => void = () => {};
  @Input() footerButtons: ModalFooterButton[] = [];
  @Input() showFooter: boolean = true;
  @Input() showHeader: boolean = true;
  @Input() contentMaxHeight: string = '77vh';
  @Input() headerClass: string = '';
  @Input() contentClass: string = '';
  @Input() footerClass: string = '';
  @Input() simpleMode: boolean = false;
}
