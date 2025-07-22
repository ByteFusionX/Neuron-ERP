import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
    selector: 'app-skelton-loading',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './skelton-loading.component.html',
    styleUrls: ['./skelton-loading.component.css']
})
export class SkeltonLoadingComponent {
  @Input() lineLength!:number;
  
}
