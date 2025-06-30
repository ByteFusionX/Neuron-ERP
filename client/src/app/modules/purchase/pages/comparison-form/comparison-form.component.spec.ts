import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ComparisonFormComponent } from './comparison-form.component';

describe('ComparisonFormComponent', () => {
  let component: ComparisonFormComponent;
  let fixture: ComponentFixture<ComparisonFormComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ComparisonFormComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ComparisonFormComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
