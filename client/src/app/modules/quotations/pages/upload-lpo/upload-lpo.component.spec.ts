import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UploadLpoComponent } from './upload-lpo.component';

describe('UploadLpoComponent', () => {
  let component: UploadLpoComponent;
  let fixture: ComponentFixture<UploadLpoComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [UploadLpoComponent]
});
    fixture = TestBed.createComponent(UploadLpoComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
