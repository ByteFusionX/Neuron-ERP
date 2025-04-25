import { ComponentFixture, TestBed } from '@angular/core/testing';

import { OptionalItemsComponent } from './optional-items.component';

describe('OptionalItemsComponent', () => {
  let component: OptionalItemsComponent;
  let fixture: ComponentFixture<OptionalItemsComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [OptionalItemsComponent]
});
    fixture = TestBed.createComponent(OptionalItemsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
