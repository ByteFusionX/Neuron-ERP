import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ComparisonSheetComponent } from './comparison-sheet.component';

describe('ComparisonSheetComponent', () => {
  let component: ComparisonSheetComponent;
  let fixture: ComponentFixture<ComparisonSheetComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ComparisonSheetComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ComparisonSheetComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
