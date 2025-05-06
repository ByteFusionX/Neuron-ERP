import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ConfettiComponentComponent } from './confetti-component.component';

describe('ConfettiComponentComponent', () => {
  let component: ConfettiComponentComponent;
  let fixture: ComponentFixture<ConfettiComponentComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [ConfettiComponentComponent]
});
    fixture = TestBed.createComponent(ConfettiComponentComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
