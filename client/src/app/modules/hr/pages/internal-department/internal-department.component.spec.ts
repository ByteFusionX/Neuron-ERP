import { ComponentFixture, TestBed } from '@angular/core/testing';

import { InternalDepartmentComponent } from './internal-department.component';

describe('InternalDepartmentComponent', () => {
  let component: InternalDepartmentComponent;
  let fixture: ComponentFixture<InternalDepartmentComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [InternalDepartmentComponent]
});
    fixture = TestBed.createComponent(InternalDepartmentComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
