import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CreateCustomerDialog } from './create-customer.component';

describe('CreateCustomerDialog', () => {
  let component: CreateCustomerDialog;
  let fixture: ComponentFixture<CreateCustomerDialog>;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [CreateCustomerDialog]
});
    fixture = TestBed.createComponent(CreateCustomerDialog);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
