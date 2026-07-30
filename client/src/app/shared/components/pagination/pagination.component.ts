import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { NgIconsModule } from '@ng-icons/core';

@Component({
    selector: 'app-pagination',
    templateUrl: './pagination.component.html',
    styleUrls: ['./pagination.component.css'],
    imports: [CommonModule, NgIconsModule]
})
export class PaginationComponent implements OnChanges {
  @Input() page!: number;
  @Input() total!: number;
  @Input() row!: number;
  @Output('changeData') changeData = new EventEmitter<{ page: number, row: number }>()
  maxPage!: number;
  selectedPage!: number;

  ngOnChanges(changes: SimpleChanges): void {
    this.totalLinksArray()
    this.selectedPage = this.page
  }

  totalLinksArray() {
    let result = Math.ceil(this.total / this.row);
    this.maxPage = Math.max(result, 1);
    return Array.from({ length: this.maxPage }, (_, i) => i + 1);
  }

  onLinkClick(page: number) {
    this.selectedPage = page
    this.changeData.emit({ page: page, row: this.row })
  }

  onPreviousClick() {
    if (this.selectedPage != 1) {
      --this.selectedPage
      this.onLinkClick(this.selectedPage)
    }
  }

  onNextClick() {
    if (this.selectedPage < this.maxPage) {
      ++this.selectedPage
      this.onLinkClick(this.selectedPage)
    }
  }

  onChangeSelect(event: Event) {
    let selected = (event.target as HTMLSelectElement).value
    this.row = Number(selected)
    this.selectedPage = 1
    this.onLinkClick(this.selectedPage)
  }

  onPageNumberClick(pageNumber: number) {
    this.selectedPage = pageNumber
    this.onLinkClick(pageNumber)
  }
}
