import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ReassignEmployeeComponent } from './reassign-employee.component';

describe('ReassignEmployeeComponent', () => {
  let component: ReassignEmployeeComponent;
  let fixture: ComponentFixture<ReassignEmployeeComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [ReassignEmployeeComponent]
});
    fixture = TestBed.createComponent(ReassignEmployeeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
