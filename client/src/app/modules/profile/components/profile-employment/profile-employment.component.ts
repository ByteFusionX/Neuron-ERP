import { Component, input } from '@angular/core';
import { DatePipe, DecimalPipe, TitleCasePipe } from '@angular/common';
import { MyProfile } from 'src/app/shared/interfaces/employee.interface';

@Component({
  selector: 'app-profile-employment',
  templateUrl: './profile-employment.component.html',
  styleUrls: ['../../profile-shared.css'],
  imports: [DatePipe, DecimalPipe, TitleCasePipe],
})
export class ProfileEmploymentComponent {
  profile = input.required<MyProfile>()
}
