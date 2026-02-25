import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CancelledReissuedReportComponent } from './cancelled-reissued-report.component';

describe('CancelledReissuedReportComponent', () => {
  let component: CancelledReissuedReportComponent;
  let fixture: ComponentFixture<CancelledReissuedReportComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CancelledReissuedReportComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CancelledReissuedReportComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
