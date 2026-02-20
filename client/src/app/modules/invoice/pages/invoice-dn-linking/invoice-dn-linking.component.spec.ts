import { ComponentFixture, TestBed } from '@angular/core/testing';

import { InvoiceDnLinkingComponent } from './invoice-dn-linking.component';

describe('InvoiceDnLinkingComponent', () => {
  let component: InvoiceDnLinkingComponent;
  let fixture: ComponentFixture<InvoiceDnLinkingComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InvoiceDnLinkingComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(InvoiceDnLinkingComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
