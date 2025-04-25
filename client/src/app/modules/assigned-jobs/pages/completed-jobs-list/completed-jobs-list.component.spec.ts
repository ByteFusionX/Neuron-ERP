import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CompletedJobsListComponent } from './completed-jobs-list.component';


describe('CompletedJobsListComponent', () => {
  let component: CompletedJobsListComponent;
  let fixture: ComponentFixture<CompletedJobsListComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [CompletedJobsListComponent]
});
    fixture = TestBed.createComponent(CompletedJobsListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
