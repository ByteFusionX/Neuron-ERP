import { ComponentFixture, TestBed } from '@angular/core/testing';

import { InventoryDeductionComponent } from './inventory-deduction.component';

describe('InventoryDeductionComponent', () => {
  let component: InventoryDeductionComponent;
  let fixture: ComponentFixture<InventoryDeductionComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InventoryDeductionComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(InventoryDeductionComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
