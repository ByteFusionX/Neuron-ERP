import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SkeltonLoadingComponent } from './skelton-loading.component';

describe('SkeltonLoadingComponent', () => {
  let component: SkeltonLoadingComponent;
  let fixture: ComponentFixture<SkeltonLoadingComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [SkeltonLoadingComponent]
    });
    fixture = TestBed.createComponent(SkeltonLoadingComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
