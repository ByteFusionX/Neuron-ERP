import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CreateCustomerTypeComponent } from './create-customer-type.component';

describe('CreateCustomerTypeComponent', () => {
  let component: CreateCustomerTypeComponent;
  let fixture: ComponentFixture<CreateCustomerTypeComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [CreateCustomerTypeComponent]
});
    fixture = TestBed.createComponent(CreateCustomerTypeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
