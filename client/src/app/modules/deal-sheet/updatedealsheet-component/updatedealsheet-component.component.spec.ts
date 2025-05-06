import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UpdatedealsheetComponent } from './updatedealsheet-component.component';

describe('UpdatedealsheetComponent', () => {
  let component: UpdatedealsheetComponent;
  let fixture: ComponentFixture<UpdatedealsheetComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [UpdatedealsheetComponent]
});
    fixture = TestBed.createComponent(UpdatedealsheetComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
