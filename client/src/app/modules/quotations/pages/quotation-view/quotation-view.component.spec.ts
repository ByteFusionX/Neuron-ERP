import { ComponentFixture, TestBed } from '@angular/core/testing';

import { QuotationViewComponent } from './quotation-view.component';

describe('QuotationViewComponent', () => {
  let component: QuotationViewComponent;
  let fixture: ComponentFixture<QuotationViewComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [QuotationViewComponent]
});
    fixture = TestBed.createComponent(QuotationViewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
