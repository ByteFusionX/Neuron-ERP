import { AfterViewInit, Component, ElementRef, HostListener, Input, OnChanges, OnDestroy } from '@angular/core';
import { buttonSlideState, dropDownMenuSate, sideBarState } from './side-bar.animation';
import { NavigationEnd, NavigationError, NavigationStart, Router } from '@angular/router';
import { IconsModule } from 'src/app/lib/icons/icons.module';
import { CommonModule } from '@angular/common';
import { AppRoutingModule } from 'src/app/app-routing.module';
import { MatTooltipModule } from '@angular/material/tooltip';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { Privileges } from '../../interfaces/employee.interface';
import { Observable, Subscription } from 'rxjs';
import { NotificationService } from 'src/app/core/services/notification.service';
import { NotificationCounts } from '../../interfaces/notification.interface';

@Component({
    selector: 'app-side-bar',
    templateUrl: './side-bar.component.html',
    styleUrls: ['./side-bar.component.css'],
    animations: [sideBarState, dropDownMenuSate, buttonSlideState],
    imports: [CommonModule, IconsModule, AppRoutingModule, MatTooltipModule]
})
export class SideBarComponent implements AfterViewInit, OnDestroy {
  notificationCounts$!: Observable<NotificationCounts>;
  @Input() showFullBar: boolean = true
  homeDropDown: boolean = false;
  jobDropDown: boolean = false;
  dealDropDown: boolean = false;
  activeLink: string = '';

  showTabs: boolean = false;
  privileges!: Privileges | undefined;
  notifyCount!: number
  notViewedPresaleCount!: number
  mySubscription: Subscription = new Subscription()

  constructor(
    private eref: ElementRef,
    private router: Router,
    private _employeeService: EmployeeService,
    private _notificationService: NotificationService
  ) {
    this.router.events.subscribe(event => {
      if (event instanceof NavigationEnd) {
        this.activeLink = event.urlAfterRedirects;
      }
    });
  }

  ngOnInit() {
    this.checkPermission();
    this.notificationCounts$ = this._notificationService.notificationCounts$;
    setTimeout(() => {
      this.showTabs = true;
    }, 2000);
  }

  @HostListener('window:resize', ['$event'])
  onResize(event: Event): void {
    this.showFullBar = window.innerWidth >= 767
    this.homeDropDown = false
  }

  ngAfterViewInit(): void {
    this.router.events.subscribe((event: any) => {
      if (event instanceof NavigationStart &&
        event.url.includes('home')) {
        this.homeDropDown = true
      }
      if (event instanceof NavigationEnd) { }
      if (event instanceof NavigationError) { }
    });
  }

  @HostListener('document:click', ['$event.target'])
  onClick(event: HTMLElement) {
    if (!(this.eref.nativeElement.contains(event)) && !this.showFullBar) {
      this.homeDropDown = false;
    }
  }

  checkPermission() {
    this._employeeService.employeeData$.subscribe((data) => {
      this.privileges = data?.category.privileges
    })
  }

  onHomeClick() {
    this.homeDropDown = !this.homeDropDown
  }

  onJobClick() {
    this.jobDropDown = !this.jobDropDown
  }

  onDealClick() {
    this.dealDropDown = !this.dealDropDown
  }

  ngOnDestroy(): void {
    if (this.mySubscription) {
      this.mySubscription.unsubscribe()
    }
  }
}
