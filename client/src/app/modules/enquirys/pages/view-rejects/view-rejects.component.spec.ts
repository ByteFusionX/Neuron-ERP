import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ViewRejectsComponent } from './view-rejects.component';

describe('ViewRejectsComponent', () => {
  let component: ViewRejectsComponent;
  let fixture: ComponentFixture<ViewRejectsComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [ViewRejectsComponent]
});
    fixture = TestBed.createComponent(ViewRejectsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
