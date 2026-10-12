import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PresalesListComponent } from './presales-list.component';

describe('PresalesListComponent', () => {
  let component: PresalesListComponent;
  let fixture: ComponentFixture<PresalesListComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [PresalesListComponent]
});
    fixture = TestBed.createComponent(PresalesListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
