import { ChangeDetectionStrategy, Component, Input, output, OutputEmitterRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IconsModule } from 'src/app/lib/icons/icons.module';

@Component({
  selector: 'data-search',
  imports: [IconsModule, FormsModule],
  templateUrl: './search.component.html',
  styleUrl: './search.component.css',
})
export class SearchComponent {
  @Input() placeholder:string = '' 
  searchQuery: string = '';
  searchSubmitted: OutputEmitterRef<string> = output();
  isEnter:boolean = false;

  ngModelChange() {
    if (this.searchQuery === '' && this.isEnter) {
      this.onSearch();
      this.isEnter = false;
    }
  }

  onSearch() {
    this.searchSubmitted.emit(this.searchQuery);
    this.isEnter = false;
  }

  onEnterKey() {
    this.isEnter = true;
    this.onSearch();
  }
}