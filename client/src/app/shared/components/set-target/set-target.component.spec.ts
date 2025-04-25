import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SetTargetComponent } from './set-target.component';

describe('SetTargetComponent', () => {
  let component: SetTargetComponent;
  let fixture: ComponentFixture<SetTargetComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [SetTargetComponent]
});
    fixture = TestBed.createComponent(SetTargetComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
