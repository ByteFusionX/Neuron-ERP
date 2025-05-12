import { AfterViewInit, Component, ElementRef, HostListener, Input, OnDestroy, OnInit } from '@angular/core';
import { buttonSlideState, dropDownMenuSate, sideBarState } from './side-bar.animation';
import { NavigationEnd, NavigationError, NavigationStart, Router, RouterModule } from '@angular/router';
import { IconsModule } from 'src/app/lib/icons/icons.module';
import { CommonModule } from '@angular/common';
import { MatTooltipModule } from '@angular/material/tooltip';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { Privileges } from '../../interfaces/employee.interface';
import { Observable, Subscription } from 'rxjs';
import { NotificationService } from 'src/app/core/services/notification.service';
import { NotificationCounts } from '../../interfaces/notification.interface';

interface MenuItem {
  id: string;
  label: string;
  icon: string;
  route?: string;
  privilegeKey?: keyof Privileges;
  privilegeValue?: string;
  hasDropdown?: boolean;
  notificationKey?: keyof NotificationCounts;
  children?: SubMenuItem[];
}

interface SubMenuItem {
  id: string;
  label: string;
  route: string;
  privilegeKey?: keyof Privileges;
  privilegeValue?: string;
  notificationKey?: keyof NotificationCounts;
  condition?: (privileges: Privileges) => boolean;
  alternateLabel?: string;
  alternateCondition?: (privileges: Privileges) => boolean;
}

@Component({
  selector: 'app-side-bar',
  templateUrl: './side-bar.component.html',
  styleUrls: ['./side-bar.component.css'],
  animations: [sideBarState, dropDownMenuSate, buttonSlideState],
  imports: [CommonModule, IconsModule, MatTooltipModule, RouterModule],
  standalone: true
})
export class SideBarComponent implements OnInit, AfterViewInit, OnDestroy {
  notificationCounts$!: Observable<NotificationCounts>;
  @Input() showFullBar: boolean = true;
  activeLink: string = '';
  showTabs: boolean = false;
  privileges!: Privileges | undefined;
  mySubscription: Subscription = new Subscription();
  expandedMenus: { [key: string]: boolean } = {};

  menuItems: MenuItem[] = [
    {
      id: 'home',
      label: 'Home',
      icon: 'heroHome',
      hasDropdown: true,
      notificationKey: 'announcementCount',
      children: [
        { id: 'dashboard', label: 'Dashboard', route: '/home' },
        {
          id: 'employees',
          label: 'Employees',
          route: '/home/employees',
          privilegeKey: 'employee',
          privilegeValue: 'none'
        },
        {
          id: 'announcements',
          label: 'Announcements',
          route: '/home/announcements',
          privilegeKey: 'announcement',
          privilegeValue: 'none',
          notificationKey: 'announcementCount'
        }
      ]
    },
    {
      id: 'customers',
      label: 'Customers',
      icon: 'heroUserGroup',
      route: '/customers',
      privilegeKey: 'customer',
      privilegeValue: 'none'
    },
    {
      id: 'enquiry',
      label: 'Enquiry',
      icon: 'heroQuestionMarkCircle',
      route: '/enquiry',
      privilegeKey: 'enquiry',
      privilegeValue: 'none',
      notificationKey: 'enquiryCount'
    },
    {
      id: 'jobs',
      label: 'Jobs',
      icon: 'heroBriefcase',
      hasDropdown: true,
      privilegeKey: 'assignedJob',
      privilegeValue: 'none',
      notificationKey: 'assignedJobCount',
      children: [
        {
          id: 'assignedJobs',
          label: 'Assigned Jobs',
          route: '/assigned-jobs',
          privilegeKey: 'assignedJob',
          privilegeValue: 'all',
          notificationKey: 'assignedJobCount'
        },
        {
          id: 'reassignedJobs',
          label: 'Reassigned Jobs',
          route: '/assigned-jobs/reassigned',
          privilegeKey: 'assignedJob',
          privilegeValue: 'none',
          notificationKey: 'reAssignedJobCount',
          alternateLabel: 'Assigned Jobs',
          alternateCondition: (privileges) => privileges?.assignedJob?.viewReport !== 'all'
        },
        {
          id: 'completedJobs',
          label: 'Completed Jobs',
          route: '/assigned-jobs/completed'
        }
      ]
    },
    {
      id: 'quotations',
      label: 'Quotations',
      icon: 'heroNewspaper',
      route: '/quotations',
      privilegeKey: 'quotation',
      privilegeValue: 'none',
      notificationKey: 'quotationCount'
    },
    {
      id: 'dealSheet',
      label: 'Deal Sheet',
      icon: 'heroClipboardDocumentCheck',
      hasDropdown: true,
      privilegeKey: 'dealSheet',
      notificationKey: 'dealSheetCount',
      children: [
        {
          id: 'pendingDeals',
          label: 'Pending',
          route: '/deal-sheet/pendings',
          notificationKey: 'dealSheetCount'
        },
        {
          id: 'approvedDeals',
          label: 'Approved',
          route: '/deal-sheet/approved'
        }
      ]
    },
    {
      id: 'jobSheet',
      label: 'Job Sheet',
      icon: 'heroBriefcase',
      privilegeKey: 'jobSheet',
      privilegeValue: 'none',
      route: '/job-sheet',
    },
    {
      id: 'purchase',
      label: 'Purchase Requisition',
      icon: 'heroShoppingCart',
      hasDropdown: true,
      // privilegeKey: 'purchase',
      notificationKey: 'purchaseCount',
      children: [
        {
          id: 'pendingPurchase',
          label: 'Pending PR',
          route: '/purchase/pendings',
          notificationKey: 'purchaseCount'
        },
        {
          id: 'approvedPurchase',
          label: 'Approved PR',
          route: '/purchase/approves',
          notificationKey: 'purchaseCount'
        },
      ]
    },
    {
      id: 'suppliers',
      label: 'Suppliers',
      icon: 'heroTruck',
      route: '/suppliers',
      privilegeKey: 'jobSheet',
      hasDropdown: true,
      privilegeValue: 'none',
      children: [
        {
          id: 'pendingSuppliers',
          label: 'Pending',
          route: '/suppliers/pendings',
          notificationKey: 'dealSheetCount'
        },
        {
          id: 'approvedSuppliers',
          label: 'Approved',
          route: '/suppliers/approved'
        }
      ]
    }
  ];

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

    // Initialize expandedMenus with all menus collapsed
    this.menuItems.forEach(item => {
      if (item.hasDropdown) {
        this.expandedMenus[item.id] = false;
      }
    });

    setTimeout(() => {
      this.showTabs = true;
    }, 2000);
  }

  @HostListener('window:resize', ['$event'])
  onResize(event: Event): void {
    this.showFullBar = window.innerWidth >= 767;
    // Close all dropdowns on resize to mobile
    if (!this.showFullBar) {
      Object.keys(this.expandedMenus).forEach(key => {
        this.expandedMenus[key] = false;
      });
    }
  }

  ngAfterViewInit(): void {
    this.router.events.subscribe((event: any) => {
      if (event instanceof NavigationStart) {
        // Auto expand home dropdown when navigating to home routes
        if (event.url.includes('home')) {
          this.expandedMenus['home'] = true;
        }

        // Auto expand relevant dropdowns based on URL
        this.menuItems.forEach(item => {
          if (item.hasDropdown && item.children) {
            const shouldExpand = item.children.some(
              child => event.url.includes(child.route.replace('/', ''))
            );
            if (shouldExpand) {
              this.expandedMenus[item.id] = true;
            }
          }
        });
      }
    });
  }

  @HostListener('document:click', ['$event.target'])
  onClick(event: HTMLElement) {
    if (!(this.eref.nativeElement.contains(event)) && !this.showFullBar) {
      // Close all dropdowns when clicking outside sidebar in mobile view
      Object.keys(this.expandedMenus).forEach(key => {
        this.expandedMenus[key] = false;
      });
    }
  }

  checkPermission() {
    this._employeeService.employeeData$.subscribe((data) => {
      this.privileges = data?.category.privileges;
    });
  }

  toggleMenu(menuId: string) {
    this.expandedMenus[menuId] = !this.expandedMenus[menuId];
  }

  hasAccess(item: MenuItem | SubMenuItem): boolean {
    if (!this.privileges || !item.privilegeKey) return true;

    const privilegeObj = this.privileges[item.privilegeKey as keyof Privileges];
    if (!privilegeObj) return false;

    // Handle when privilegeObj is just a boolean
    if (typeof privilegeObj === 'boolean') {
      return privilegeObj; // If it's true, access is granted
    }

    // Handle when privilegeObj is an object with viewReport property
    if (typeof privilegeObj === 'object' && 'viewReport' in privilegeObj) {
      // If privilegeValue is 'none', it means user should NOT have 'none' permission
      return item.privilegeValue === 'none'
        ? privilegeObj.viewReport !== 'none'
        : privilegeObj.viewReport === item.privilegeValue;
    }

    // Default fallback if structure doesn't match expected patterns
    return false;
  }

  getNotificationCount(key: keyof NotificationCounts | undefined): number {
    if (!key) return 0;
    let count = 0;
    this.notificationCounts$.subscribe(counts => {
      count = counts[key] || 0;
    });
    return count;
  }

  hasAnyNotification(item: MenuItem): boolean {
    if (!item.notificationKey && !item.children) return false;

    let hasNotification = false;
    if (item.notificationKey) {
      this.notificationCounts$.subscribe(counts => {
        hasNotification = !!counts[item.notificationKey as keyof NotificationCounts];
      });
    }

    if (!hasNotification && item.children) {
      this.notificationCounts$.subscribe(counts => {
        hasNotification = item.children?.some(child =>
          child.notificationKey && counts[child.notificationKey as keyof NotificationCounts]
        ) || false;
      });
    }

    return hasNotification;
  }

  getSubMenuLabel(subItem: SubMenuItem): string {
    if (subItem.alternateLabel && subItem.alternateCondition && this.privileges) {
      return subItem.alternateCondition(this.privileges) ? subItem.alternateLabel : subItem.label;
    }
    return subItem.label;
  }

  ngOnDestroy(): void {
    if (this.mySubscription) {
      this.mySubscription.unsubscribe();
    }
  }
}