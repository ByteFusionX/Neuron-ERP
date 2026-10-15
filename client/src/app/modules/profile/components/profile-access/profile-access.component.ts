import { Component, input } from '@angular/core';
import { DatePipe, TitleCasePipe } from '@angular/common';
import { MyProfile } from 'src/app/shared/interfaces/employee.interface';

export interface AccessRow { module: string; grants: string[]; }

@Component({
  selector: 'app-profile-access',
  templateUrl: './profile-access.component.html',
  styleUrls: ['../../profile-shared.css', './profile-access.component.css'],
  imports: [DatePipe, TitleCasePipe],
})
export class ProfileAccessComponent {
  profile = input.required<MyProfile>()
  isAdmin = input(false)
  accessRows = input<AccessRow[]>([])
  extraRows = input<AccessRow[]>([])
}
