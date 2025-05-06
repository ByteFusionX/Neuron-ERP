import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PendingDealsComponent } from './pending-deals.component';

describe('PendingDealsComponent', () => {
  let component: PendingDealsComponent;
  let fixture: ComponentFixture<PendingDealsComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [PendingDealsComponent]
});
    fixture = TestBed.createComponent(PendingDealsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
