import { Component, input } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Target } from 'src/app/shared/interfaces/employee.interface';

@Component({
  selector: 'app-profile-targets',
  templateUrl: './profile-targets.component.html',
  styleUrls: ['../../profile-shared.css'],
  imports: [DecimalPipe],
})
export class ProfileTargetsComponent {
  targets = input<Target[]>([])
}
