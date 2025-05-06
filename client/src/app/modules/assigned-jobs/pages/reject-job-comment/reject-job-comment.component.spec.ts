import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RejectJobCommentComponent } from './reject-job-comment.component';

describe('RejectJobCommentComponent', () => {
  let component: RejectJobCommentComponent;
  let fixture: ComponentFixture<RejectJobCommentComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [RejectJobCommentComponent]
});
    fixture = TestBed.createComponent(RejectJobCommentComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
