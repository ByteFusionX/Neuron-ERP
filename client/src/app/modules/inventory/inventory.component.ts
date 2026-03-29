import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-inventory',
  imports: [RouterOutlet],
  templateUrl: './inventory.component.html',
  styleUrl: './inventory.component.css',
  standalone: true
})
export class InventoryComponent { }
