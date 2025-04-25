import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ShareTransferCustomerComponent } from './share-transfer-customer.component';

describe('ShareTransferCustomerComponent', () => {
  let component: ShareTransferCustomerComponent;
  let fixture: ComponentFixture<ShareTransferCustomerComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [ShareTransferCustomerComponent]
});
    fixture = TestBed.createComponent(ShareTransferCustomerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
