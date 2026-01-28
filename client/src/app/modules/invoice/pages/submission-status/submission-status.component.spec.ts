import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SubmissionStatusComponent } from './submission-status.component';

describe('SubmissionStatusComponent', () => {
  let component: SubmissionStatusComponent;
  let fixture: ComponentFixture<SubmissionStatusComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SubmissionStatusComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SubmissionStatusComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
