import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ResizableComponent } from './resizable.component';

describe('ResizableComponent', () => {
  let component: ResizableComponent;
  let fixture: ComponentFixture<ResizableComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [ResizableComponent]
});
    fixture = TestBed.createComponent(ResizableComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
