import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AssignPresaleComponent } from './assign-presale.component';

describe('AssignPresaleComponent', () => {
  let component: AssignPresaleComponent;
  let fixture: ComponentFixture<AssignPresaleComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [AssignPresaleComponent]
});
    fixture = TestBed.createComponent(AssignPresaleComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
