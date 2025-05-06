import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
    selector: 'app-home',
    templateUrl: './home.component.html',
    styleUrls: ['./home.component.css'],
    imports: [RouterOutlet]
})
export class HomeComponent{

  reduceSate: boolean = true

  reduceSideBar(event: boolean) {
    this.reduceSate = event
  }
}
