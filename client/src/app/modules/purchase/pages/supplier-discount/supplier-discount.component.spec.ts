import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SupplierDiscountComponent } from './supplier-discount.component';

describe('SupplierDiscountComponent', () => {
  let component: SupplierDiscountComponent;
  let fixture: ComponentFixture<SupplierDiscountComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SupplierDiscountComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SupplierDiscountComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
