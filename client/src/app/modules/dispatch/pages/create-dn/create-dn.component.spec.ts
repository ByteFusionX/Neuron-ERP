import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CreateDnComponent } from './create-dn.component';

describe('CreateDnComponent', () => {
  let component: CreateDnComponent;
  let fixture: ComponentFixture<CreateDnComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CreateDnComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CreateDnComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
