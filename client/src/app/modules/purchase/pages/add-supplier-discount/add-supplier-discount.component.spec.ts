import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AddSupplierDiscountComponent } from './add-supplier-discount.component';

describe('AddSupplierDiscountComponent', () => {
  let component: AddSupplierDiscountComponent;
  let fixture: ComponentFixture<AddSupplierDiscountComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AddSupplierDiscountComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AddSupplierDiscountComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
