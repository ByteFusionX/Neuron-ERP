import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SelectEmployeeComponent } from './select-employee.component';

describe('SelectEmployeeComponent', () => {
  let component: SelectEmployeeComponent;
  let fixture: ComponentFixture<SelectEmployeeComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [SelectEmployeeComponent]
});
    fixture = TestBed.createComponent(SelectEmployeeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
