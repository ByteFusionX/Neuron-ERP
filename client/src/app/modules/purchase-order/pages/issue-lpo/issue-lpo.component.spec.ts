import { ComponentFixture, TestBed } from '@angular/core/testing';

import { IssueLpoComponent } from './issue-lpo.component';

describe('IssueLpoComponent', () => {
  let component: IssueLpoComponent;
  let fixture: ComponentFixture<IssueLpoComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [IssueLpoComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(IssueLpoComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
