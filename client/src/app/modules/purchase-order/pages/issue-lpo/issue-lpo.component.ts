import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

@Component({
  selector: 'app-issue-lpo',
  imports: [
    CommonModule, 
    FormsModule,
    ReactiveFormsModule,
  ],
  templateUrl: './issue-lpo.component.html',
  styleUrl: './issue-lpo.component.css'
})
export class IssueLpoComponent {

}
