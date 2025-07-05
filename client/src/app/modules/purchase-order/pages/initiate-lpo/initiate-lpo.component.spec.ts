import { ComponentFixture, TestBed } from '@angular/core/testing';

import { InitiateLpoComponent } from './initiate-lpo.component';

describe('InitiateLpoComponent', () => {
  let component: InitiateLpoComponent;
  let fixture: ComponentFixture<InitiateLpoComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InitiateLpoComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(InitiateLpoComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
