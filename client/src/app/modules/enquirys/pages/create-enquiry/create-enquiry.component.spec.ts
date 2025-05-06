import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CreateEnquiryDialog } from './create-enquiry.component';

describe('CreateEnquiryDialog', () => {
  let component: CreateEnquiryDialog;
  let fixture: ComponentFixture<CreateEnquiryDialog>;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [CreateEnquiryDialog]
});
    fixture = TestBed.createComponent(CreateEnquiryDialog);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
