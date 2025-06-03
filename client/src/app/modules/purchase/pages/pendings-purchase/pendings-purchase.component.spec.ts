import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PendingPurchaseComponent } from './pendings-purchase.component';

describe('PendingsComponent', () => {
  let component: PendingPurchaseComponent;
  let fixture: ComponentFixture<PendingPurchaseComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PendingPurchaseComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PendingPurchaseComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
