import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PresalesComponent } from './presales.component';

describe('PresalesComponent', () => {
  let component: PresalesComponent;
  let fixture: ComponentFixture<PresalesComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [PresalesComponent]
});
    fixture = TestBed.createComponent(PresalesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
