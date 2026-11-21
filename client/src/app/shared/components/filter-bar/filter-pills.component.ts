import { Component, Input } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { FilterBarComponent } from './filter-bar.component';

/** The applied-filter pills row for an `app-filter-bar` placed elsewhere (e.g. its button in a page header), like the grid's pills under its toolbar. */
@Component({
  selector: 'app-filter-pills',
  standalone: true,
  imports: [NgIf, NgFor],
  templateUrl: './filter-pills.component.html',
})
export class FilterPillsComponent {
  @Input({ required: true }) bar!: FilterBarComponent;
}
