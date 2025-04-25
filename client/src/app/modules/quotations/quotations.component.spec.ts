import { ComponentFixture, TestBed } from '@angular/core/testing';

import { QuotationsComponent } from './quotations.component';

describe('QuotationsComponent', () => {
  let component: QuotationsComponent;
  let fixture: ComponentFixture<QuotationsComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [QuotationsComponent]
});
    fixture = TestBed.createComponent(QuotationsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
