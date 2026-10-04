import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UpdateDealsheetComponent } from './update-dealsheet.component';

describe('UpdateDealsheetComponent', () => {
  let component: UpdateDealsheetComponent;
  let fixture: ComponentFixture<UpdateDealsheetComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [UpdateDealsheetComponent],
    });
    fixture = TestBed.createComponent(UpdateDealsheetComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
