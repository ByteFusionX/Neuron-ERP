import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { ToastrService } from 'ngx-toastr';

import { ProfileInfoComponent } from './profile-info.component';
import { MyProfile } from 'src/app/shared/interfaces/employee.interface';

const profile: MyProfile = {
  _id: '1', employeeId: 'NT-1100', firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com',
  contactNo: 5551234, dob: '1990-01-01', photo: null,
  employment: {
    designation: 'Engineer', department: 'Sales', reportingTo: null, dateOfJoining: '2020-01-01',
    contractType: null, contractStart: null, contractEnd: null, probationEnd: null, approvalLimit: null,
    isTechnician: false, isDriver: false, isProjectManager: false,
  },
  role: 'user',
  access: { privileges: { enquiry: { viewReport: 'own', create: true } }, extraPrivileges: {}, extraPrivilegesExpiresAt: null, extraPrivilegesExpired: false },
  targets: [], preferences: {},
  security: { lastLoginAt: null, passwordChangedAt: null, microsoftLinked: false },
};

describe('ProfileInfoComponent', () => {
  let component: ProfileInfoComponent;
  let fixture: ComponentFixture<ProfileInfoComponent>;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ProfileInfoComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ToastrService, useValue: { success: () => undefined, error: () => undefined } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ProfileInfoComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('loads the profile and fills the forms', () => {
    http.expectOne((r) => r.url.endsWith('/employee/me/profile')).flush(profile);
    expect(component.detailsForm.getRawValue().firstName).toBe('Ada');
    expect(component.accessRows).toEqual([{ module: 'Enquiry', grants: ['View Report: own', 'Create'] }]);
  });

  it('requires matching passwords', () => {
    component.passwordForm.setValue({ oldPassword: 'old', newPassword: 'abcdefg1', confirmPassword: 'different1' });
    expect(component.passwordForm.hasError('mismatch')).toBeTrue();
  });
});
