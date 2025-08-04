import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { NgOptionComponent, NgSelectComponent } from '@ng-select/ng-select';

@Component({
  selector: 'app-issue-lpo',
  imports: [
    CommonModule, 
    NgSelectComponent, 
    NgOptionComponent,
    FormsModule,
    ReactiveFormsModule,
  ],
  templateUrl: './issue-lpo.component.html',
  styleUrl: './issue-lpo.component.css'
})
export class IssueLpoComponent {

}
