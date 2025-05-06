import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ApproveDealComponent } from './approve-deal.component';

describe('ApproveDealComponent', () => {
  let component: ApproveDealComponent;
  let fixture: ComponentFixture<ApproveDealComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [ApproveDealComponent]
});
    fixture = TestBed.createComponent(ApproveDealComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
