import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ViewLpoComponent } from './view-lpo.component';

describe('ViewLpoComponent', () => {
  let component: ViewLpoComponent;
  let fixture: ComponentFixture<ViewLpoComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [ViewLpoComponent]
});
    fixture = TestBed.createComponent(ViewLpoComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
