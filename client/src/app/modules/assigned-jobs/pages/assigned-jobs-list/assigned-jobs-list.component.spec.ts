import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AssignedJobsListComponent } from './assigned-jobs-list.component';

describe('AssignedJobsListComponent', () => {
  let component: AssignedJobsListComponent;
  let fixture: ComponentFixture<AssignedJobsListComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [AssignedJobsListComponent]
});
    fixture = TestBed.createComponent(AssignedJobsListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
