import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ApprovedDealsComponent } from './approved-deals.component';

describe('ApprovedDealsComponent', () => {
  let component: ApprovedDealsComponent;
  let fixture: ComponentFixture<ApprovedDealsComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [ApprovedDealsComponent]
});
    fixture = TestBed.createComponent(ApprovedDealsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
