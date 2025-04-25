import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AssignedJobsComponent } from './assigned-jobs.component';

describe('AssignedJobsComponent', () => {
  let component: AssignedJobsComponent;
  let fixture: ComponentFixture<AssignedJobsComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [AssignedJobsComponent]
});
    fixture = TestBed.createComponent(AssignedJobsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
