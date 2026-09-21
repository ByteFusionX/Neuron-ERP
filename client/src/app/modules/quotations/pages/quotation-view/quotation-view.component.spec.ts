import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { MatDialogModule } from '@angular/material/dialog';
import { ToastrModule } from 'ngx-toastr';

import { QuotationViewComponent } from './quotation-view.component';

describe('QuotationViewComponent', () => {
  let component: QuotationViewComponent;
  let fixture: ComponentFixture<QuotationViewComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [QuotationViewComponent, MatDialogModule, ToastrModule.forRoot()],
      providers: [provideHttpClient(), provideRouter([])],
    });
    fixture = TestBed.createComponent(QuotationViewComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
