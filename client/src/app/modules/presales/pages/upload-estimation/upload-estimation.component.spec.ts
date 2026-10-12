import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UploadEstimationComponent } from './upload-estimation.component';

describe('UploadEstimationComponent', () => {
  let component: UploadEstimationComponent;
  let fixture: ComponentFixture<UploadEstimationComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [UploadEstimationComponent]
});
    fixture = TestBed.createComponent(UploadEstimationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
