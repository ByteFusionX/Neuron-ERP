import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ViewPresaleComponent } from './view-presale.component';

describe('ViewPresaleComponent', () => {
  let component: ViewPresaleComponent;
  let fixture: ComponentFixture<ViewPresaleComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [ViewPresaleComponent]
});
    fixture = TestBed.createComponent(ViewPresaleComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
