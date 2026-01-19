import { ComponentFixture, TestBed } from '@angular/core/testing';

import { InvoiceLinkingComponent } from './invoice-linking.component';

describe('InvoiceLinkingComponent', () => {
  let component: InvoiceLinkingComponent;
  let fixture: ComponentFixture<InvoiceLinkingComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InvoiceLinkingComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(InvoiceLinkingComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
