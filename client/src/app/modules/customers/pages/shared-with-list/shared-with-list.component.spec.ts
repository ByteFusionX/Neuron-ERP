import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SharedWithListComponent } from './shared-with-list.component';

describe('SharedWithListComponent', () => {
  let component: SharedWithListComponent;
  let fixture: ComponentFixture<SharedWithListComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [SharedWithListComponent]
});
    fixture = TestBed.createComponent(SharedWithListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
