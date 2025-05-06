import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ViewEstimationComponent } from './view-estimation.component';

describe('ViewEstimationComponent', () => {
  let component: ViewEstimationComponent;
  let fixture: ComponentFixture<ViewEstimationComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [ViewEstimationComponent]
});
    fixture = TestBed.createComponent(ViewEstimationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
