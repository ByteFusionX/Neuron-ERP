import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DealSheetComponent } from './deal-sheet.component';

describe('DealSheetComponent', () => {
  let component: DealSheetComponent;
  let fixture: ComponentFixture<DealSheetComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [DealSheetComponent]
});
    fixture = TestBed.createComponent(DealSheetComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
