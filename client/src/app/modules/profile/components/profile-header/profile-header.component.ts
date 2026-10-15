import { Component, input, model, output } from '@angular/core';
import { TitleCasePipe } from '@angular/common';
import { MyProfile } from 'src/app/shared/interfaces/employee.interface';

export interface ProfileTab { id: string; label: string; icon: string; }

@Component({
  selector: 'app-profile-header',
  templateUrl: './profile-header.component.html',
  styleUrls: ['../../profile-shared.css', './profile-header.component.css'],
  imports: [TitleCasePipe],
})
export class ProfileHeaderComponent {
  profile = input.required<MyProfile>()
  tabs = input.required<readonly ProfileTab[]>()
  tenure = input<string | null>(null)
  initials = input('')
  responsibilities = input<string[]>([])
  completeness = input<{ percent: number; missing: string[] }>({ percent: 0, missing: [] })
  uploadingPhoto = input(false)
  activeTab = model.required<string>()
  photoSelected = output<Event>()
  photoRemoved = output<void>()
}
