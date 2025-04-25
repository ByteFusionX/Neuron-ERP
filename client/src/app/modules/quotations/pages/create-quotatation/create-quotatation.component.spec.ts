import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CreateQuotatationComponent } from './create-quotatation.component';

describe('CreateQuotatationComponent', () => {
  let component: CreateQuotatationComponent;
  let fixture: ComponentFixture<CreateQuotatationComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [CreateQuotatationComponent]
});
    fixture = TestBed.createComponent(CreateQuotatationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
