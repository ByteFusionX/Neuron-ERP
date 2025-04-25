import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FeedbackRequestsComponent } from './feedback-requests.component';

describe('FeedbackRequestsComponent', () => {
  let component: FeedbackRequestsComponent;
  let fixture: ComponentFixture<FeedbackRequestsComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [FeedbackRequestsComponent]
});
    fixture = TestBed.createComponent(FeedbackRequestsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
