import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DnRegisterComponent } from './dn-register.component';

describe('DnRegisterComponent', () => {
  let component: DnRegisterComponent;
  let fixture: ComponentFixture<DnRegisterComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DnRegisterComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DnRegisterComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
