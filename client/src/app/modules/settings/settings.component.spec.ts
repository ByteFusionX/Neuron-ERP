import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SettingsComponnet } from './settings.component';

describe('SettingsComponnet', () => {
  let component: SettingsComponnet;
  let fixture: ComponentFixture<SettingsComponnet>;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [SettingsComponnet]
});
    fixture = TestBed.createComponent(SettingsComponnet);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
