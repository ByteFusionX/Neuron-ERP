import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { ToastrService } from 'ngx-toastr';
import { FileUploadModalComponent } from './file-upload-modal.component';
import { EnquiryService } from '../../../core/services/enquiry/enquiry.service';

describe('FileUploadModalComponent', () => {
  let component: FileUploadModalComponent;
  let fixture: ComponentFixture<FileUploadModalComponent>;

  const mockDialogRef = {
    close: jasmine.createSpy('close')
  };

  const mockToastrService = {
    success: jasmine.createSpy('success'),
    error: jasmine.createSpy('error'),
    warning: jasmine.createSpy('warning')
  };

  const mockEnquiryService = {
    downloadFile: jasmine.createSpy('downloadFile')
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FileUploadModalComponent],
      providers: [
        { provide: MatDialogRef, useValue: mockDialogRef },
        { provide: MAT_DIALOG_DATA, useValue: { title: 'Test Modal' } },
        { provide: ToastrService, useValue: mockToastrService },
        { provide: EnquiryService, useValue: mockEnquiryService }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(FileUploadModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
