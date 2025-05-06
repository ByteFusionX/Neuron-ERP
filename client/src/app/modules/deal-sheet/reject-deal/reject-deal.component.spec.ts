import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RejectDealComponent } from './reject-deal.component';

describe('RejectDealComponent', () => {
  let component: RejectDealComponent;
  let fixture: ComponentFixture<RejectDealComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [RejectDealComponent]
});
    fixture = TestBed.createComponent(RejectDealComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
