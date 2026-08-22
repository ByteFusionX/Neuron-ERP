import {
  AfterViewInit,
  Component,
  ElementRef,
  HostListener,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  SimpleChanges,
} from '@angular/core';
import {
  buttonSlideState,
  dropDownMenuSate,
  sideBarState,
} from './side-bar.animation';
import {
  NavigationEnd,
  NavigationError,
  NavigationStart,
  Router,
  RouterModule,
} from '@angular/router';
import { IconsModule } from 'src/app/lib/icons/icons.module';
import { CommonModule } from '@angular/common';
import { MatTooltipModule } from '@angular/material/tooltip';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { Privileges } from '../../interfaces/employee.interface';
import { Observable, Subscription } from 'rxjs';
import { NotificationService } from 'src/app/core/services/notification.service';
import { SidebarPreferencesService } from 'src/app/core/services/sidebar-preferences.service';

interface MenuItem {
  id: string;
  label: string;
  icon: string;
  route?: string;
  privilegeKey?: keyof Privileges;
  privilegeValue?: string;
  hasDropdown?: boolean;
  notificationKey?: string;
  children?: SubMenuItem[];
}

interface SubMenuItem {
  id: string;
  label: string;
  route: string;
  privilegeKey?: keyof Privileges;
  privilegeValue?: string;
  notificationKey?: string;
  alternateLabel?: string;
  alternateCondition?: (privileges: Privileges) => boolean;
}

interface MenuCategory {
  id: string;
  label: string;
  items: MenuItem[];
}

@Component({
  selector: 'app-side-bar',
  templateUrl: './side-bar.component.html',
  styleUrls: ['./side-bar.component.css'],
  animations: [sideBarState, dropDownMenuSate, buttonSlideState],
  imports: [CommonModule, IconsModule, MatTooltipModule, RouterModule],
  standalone: true,
})
export class SideBarComponent
  implements OnInit, OnChanges, AfterViewInit, OnDestroy
{
  @Input() showFullBar: boolean = true;
  activeLink: string = '';
  showTabs: boolean = false;
  privileges!: Privileges | undefined;
  mySubscription: Subscription = new Subscription();
  expandedMenus: { [key: string]: boolean } = {};
  // Tracks the navigation target url, not this.router.url (which only updates
  // once a navigation is committed, so it can't be trusted mid-navigation).
  private currentUrl: string;

  menuCategories: MenuCategory[] = [
    {
      id: 'overview',
      label: 'Overview',
      items: [
        {
          id: 'home',
          label: 'Home',
          icon: 'heroHome',
          route: '/home',
        },
        {
          id: 'dashboard',
          label: 'Dashboard',
          icon: 'heroChartBar',
          route: '/dashboard',
        },
      ],
    },
    {
      id: 'sales',
      label: 'Sales',
      items: [
        {
          id: 'customers',
          label: 'Customers',
          icon: 'heroUserGroup',
          route: '/customers',
          privilegeKey: 'customer',
          privilegeValue: 'none',
        },
        {
          id: 'enquiry',
          label: 'Enquiry',
          icon: 'heroQuestionMarkCircle',
          route: '/enquiry',
          privilegeKey: 'enquiry',
          privilegeValue: 'none',
          notificationKey: 'enquiryCount',
        },
        {
          id: 'quotations',
          label: 'Quotations',
          icon: 'heroNewspaper',
          route: '/quotations',
          privilegeKey: 'quotation',
          privilegeValue: 'none',
          notificationKey: 'quotationCount',
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
              privilegeKey: 'dealSheet',
              notificationKey: 'dealSheetCount',
            },
            {
              id: 'approvedDeals',
              label: 'Approved',
              route: '/deal-sheet/approved',
              privilegeKey: 'dealSheet',
            },
          ],
        },
      ],
    },
    {
      id: 'jobs',
      label: 'Jobs',
      items: [
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
              notificationKey: 'assignedJobCount',
            },
            {
              id: 'reassignedJobs',
              label: 'Reassigned Jobs',
              route: '/assigned-jobs/reassigned',
              privilegeKey: 'assignedJob',
              privilegeValue: 'none',
              notificationKey: 'reAssignedJobCount',
              alternateLabel: 'Assigned Jobs',
              alternateCondition: (privileges) =>
                privileges?.assignedJob?.viewReport !== 'all',
            },
            {
              id: 'completedJobs',
              label: 'Completed Jobs',
              route: '/assigned-jobs/completed',
            },
          ],
        },
        {
          id: 'jobSheet',
          label: 'Job Sheet',
          icon: 'heroClipboardDocument',
          privilegeKey: 'jobSheet',
          hasDropdown: true,
          privilegeValue: 'none',
          children: [
            {
              id: 'pendingJobSheet',
              label: 'Pending',
              route: '/job-sheet/pending',
              privilegeKey: 'jobSheet',
              privilegeValue: 'none',
            },
            {
              id: 'openToWorkJobSheet',
              label: 'Open to work',
              route: '/job-sheet/open-to-work',
              privilegeKey: 'jobSheet',
              privilegeValue: 'none',
            },
            {
              id: 'inProgressJobSheet',
              label: 'In progress',
              route: '/job-sheet/in-progress',
              privilegeKey: 'jobSheet',
              privilegeValue: 'none',
            },
            {
              id: 'completedJobSheet',
              label: 'Completed',
              route: '/job-sheet/completed',
              privilegeKey: 'jobSheet',
              privilegeValue: 'none',
            },
          ],
        },
        {
          id: 'technical',
          label: 'Technical',
          icon: 'heroWrenchScrewdriver',
          hasDropdown: true,
          privilegeKey: 'technical',
          privilegeValue: 'none',
          notificationKey: 'purchaseCount',
          children: [
            {
              id: 'pendingJobs',
              label: 'Open To Work',
              route: '/technical/open-to-work-project',
              privilegeKey: 'technical',
              privilegeValue: 'canViewOpenToWorkAndAssign',
              notificationKey: 'purchaseCount',
            },
            {
              id: 'projects',
              label: 'Pending Projects',
              route: '/technical/project',
              privilegeKey: 'technical',
              privilegeValue: 'none',
              notificationKey: 'purchaseCount',
            },
            {
              id: 'amc',
              label: 'Pending AMC',
              route: '/technical/amc',
              privilegeKey: 'technical',
              privilegeValue: 'none',
              notificationKey: 'purchaseCount',
            },
            {
              id: 'mrApprovalRequests',
              label: 'MR Approval Requests',
              route: '/technical/mr-approval-requests',
              privilegeKey: 'technical',
              privilegeValue: 'canApproveMRRequests',
              notificationKey: 'purchaseCount',
            },
          ],
        },
      ],
    },
    {
      id: 'procurement',
      label: 'Procurement',
      items: [
        {
          id: 'suppliers',
          label: 'Suppliers',
          icon: 'heroBuildingOffice',
          route: '/suppliers',
          privilegeKey: 'supplier',
          hasDropdown: true,
          privilegeValue: 'none',
          children: [
            {
              id: 'pendingSuppliers',
              label: 'Pending',
              route: '/suppliers/pendings',
              notificationKey: 'dealSheetCount',
            },
            {
              id: 'approvedSuppliers',
              label: 'Approved',
              route: '/suppliers/approved',
            },
          ],
        },
        {
          id: 'purchase',
          label: 'Purchase',
          icon: 'heroShoppingCart',
          hasDropdown: true,
          privilegeKey: 'purchase',
          privilegeValue: 'none',
          notificationKey: 'purchaseCount',
          children: [
            {
              id: 'pendingPurchase',
              label: 'Pending PR',
              route: '/purchase/pendings',
              notificationKey: 'purchaseCount',
            },
            {
              id: 'approvedPurchase',
              label: 'Approved PR',
              route: '/purchase/approves',
              notificationKey: 'purchaseCount',
            },
          ],
        },
        {
          id: 'supplierLpo',
          label: 'Supplier LPO',
          icon: 'heroClipboardDocumentList',
          hasDropdown: true,
          privilegeKey: 'purchaseOrder',
          privilegeValue: 'none',
          children: [
            {
              id: 'pendingLpoApproval',
              label: 'LPO Approval Requests',
              route: '/purchase-order/pending-approval',
              privilegeKey: 'purchaseOrder',
              privilegeValue: 'none',
            },
            {
              id: 'approvedLpos',
              label: 'Approved LPOs',
              route: '/purchase-order/approved',
              privilegeKey: 'purchaseOrder',
              privilegeValue: 'none',
            },
          ],
        },
      ],
    },
    {
      id: 'inventory',
      label: 'Inventory',
      items: [
        {
          id: 'inventory',
          label: 'Inventory',
          icon: 'heroCube',
          route: '/inventory',
          privilegeKey: 'inventory',
          hasDropdown: true,
          privilegeValue: 'none',
          children: [
            {
              id: 'Products',
              label: 'All Products',
              route: '/inventory/products',
              notificationKey: 'dealSheetCount',
            },
            {
              id: 'stockEntries',
              label: 'Stock Entries',
              route: '/inventory/stock-entries',
            },
          ],
        },
      ],
    },
    {
      id: 'administration',
      label: 'Administration',
      items: [
        {
          id: 'grn',
          label: 'GRN',
          icon: 'heroInboxArrowDown',
          route: '/grn/grn-list',
          privilegeKey: 'grn',
          privilegeValue: 'none',
        },
        {
          id: 'dispatch',
          label: 'Dispatch',
          icon: 'heroTruck',
          route: '/dispatch/delivery-note-register',
          privilegeKey: 'dispatch',
          privilegeValue: 'none',
        },
        {
          id: 'invoice',
          label: 'Invoice',
          icon: 'heroDocumentText',
          route: '/invoice',
          hasDropdown: true,
          privilegeKey: 'invoice',
          privilegeValue: 'none',
          children: [
            {
              id: 'invoice-register',
              label: 'Invoices',
              route: '/invoice/invoice-register',
              privilegeKey: 'invoice',
              privilegeValue: 'none',
            },
            {
              id: 'invoice-dn-linking',
              label: 'Invoice vs DN',
              route: '/invoice/invoice-dn-linking',
              privilegeKey: 'invoice',
              privilegeValue: 'viewInvoicesVsDn',
            },
            {
              id: 'cancelled-adjusted-invoices',
              label: 'Cancelled/Adjusted',
              route: '/invoice/cancelled-invoices',
              privilegeKey: 'invoice',
              privilegeValue: 'viewCancelledAdjusted',
            },
            {
              id: 'cancelled-reissued-invoices',
              label: 'Reissued',
              route: '/invoice/reissued',
              privilegeKey: 'invoice',
              privilegeValue: 'viewReissued',
            },
          ],
        },
      ],
    },
    {
      id: 'people',
      label: 'People',
      items: [
        {
          id: 'employees',
          label: 'Employees',
          icon: 'heroIdentification',
          route: '/employees',
          privilegeKey: 'employee',
          privilegeValue: 'none',
        },
        {
          id: 'claims',
          label: 'Claims',
          icon: 'heroDocumentPlus',
          route: '/claims',
          privilegeKey: 'claims',
          hasDropdown: true,
          privilegeValue: 'none',
          children: [
            {
              id: 'myClaims',
              label: 'My Claims',
              route: '/claims/my-claims',
              privilegeKey: 'claims',
              privilegeValue: 'none',
              notificationKey: 'dealSheetCount',
            },
            {
              id: 'approvalRequests',
              label: 'Approval Requests',
              route: '/claims/approval-requests',
              privilegeKey: 'claims',
              privilegeValue: 'canApprove',
            },
          ],
        },
      ],
    },
  ];

  constructor(
    private eref: ElementRef,
    private router: Router,
    private _employeeService: EmployeeService,
    private _notificationService: NotificationService,
    private sidebarPrefs: SidebarPreferencesService,
  ) {
    this.currentUrl = this.router.url;
    this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        this.activeLink = event.urlAfterRedirects;
        this.scrollActiveItemIntoView();
      }
    });
  }

  ngOnInit() {
    this.checkPermission();

    // Initialize expandedMenus with all menus collapsed
    this.menuCategories.forEach((category) => {
      category.items.forEach((item) => {
        if (item.hasDropdown) {
          this.expandedMenus[item.id] = false;
        }
      });
    });

    // Auto-expand the dropdown matching the current URL immediately, so a
    // fresh page load/refresh doesn't depend on catching a NavigationStart event.
    this.expandActiveRouteMenus(this.currentUrl);

    setTimeout(() => {
      this.showTabs = true;
      this.scrollActiveItemIntoView();
    }, 2000);
  }

  ngOnChanges(changes: SimpleChanges) {
    // Recompute when switching between minimised/full sidebar: expanding
    // should re-open and highlight the active sub-tab, collapsing should
    // close any flyout that was left open.
    if (changes['showFullBar'] && !changes['showFullBar'].firstChange) {
      this.expandActiveRouteMenus(this.currentUrl);
      if (this.showFullBar) {
        this.scrollActiveItemIntoView();
      }
    }
  }

  @HostListener('window:resize', ['$event'])
  onResize(event: Event): void {
    this.showFullBar = window.innerWidth >= 767;
    // Close all dropdowns on resize to mobile
    if (!this.showFullBar) {
      Object.keys(this.expandedMenus).forEach((key) => {
        this.expandedMenus[key] = false;
      });
    }
  }

  ngAfterViewInit(): void {
    this.router.events.subscribe((event: any) => {
      if (event instanceof NavigationStart) {
        this.currentUrl = event.url;
        this.expandActiveRouteMenus(event.url);
      }
    });
  }

  private expandActiveRouteMenus(url: string) {
    // In the minimised (icon-only) sidebar, dropdowns are shown as flyouts.
    // Always close them on navigation - picking a page or moving to another
    // tab/sub-tab should collapse the flyout rather than leave it pinned open.
    if (!this.showFullBar) {
      this.menuCategories.forEach((category) => {
        category.items.forEach((item) => {
          if (item.hasDropdown) {
            this.expandedMenus[item.id] = false;
          }
        });
      });
      return;
    }

    // Auto expand home dropdown when navigating to home routes
    if (url.includes('home')) {
      this.expandedMenus['home'] = true;
    }

    // Auto expand the dropdown matching the current URL and close every
    // other dropdown (accordion behaviour when switching between tabs).
    this.menuCategories.forEach((category) => {
      category.items.forEach((item) => {
        if (item.hasDropdown && item.children) {
          const shouldExpand = item.children.some((child) =>
            url.includes(child.route.replace('/', '')),
          );
          this.expandedMenus[item.id] = shouldExpand;
        }
      });
    });
  }

  @HostListener('document:click', ['$event.target'])
  onClick(event: HTMLElement | EventTarget | null) {
    if (!this.eref.nativeElement.contains(event) && !this.showFullBar) {
      // Close all dropdowns when clicking outside sidebar in mobile view
      Object.keys(this.expandedMenus).forEach((key) => {
        this.expandedMenus[key] = false;
      });
    }
  }

  checkPermission() {
    this._employeeService.employeeData$.subscribe((data) => {
      this.privileges = data?.category.privileges;
      this.loadPersistedExpandedMenus();
    });
  }

  private loadPersistedExpandedMenus() {
    const saved = this.sidebarPrefs.getExpandedMenus();
    Object.keys(saved).forEach((id) => {
      this.expandedMenus[id] = saved[id];
    });
    // Re-apply active-route expansion in case it was overridden by a stale
    // saved "collapsed" value for the section the user is currently in.
    this.expandActiveRouteMenus(this.currentUrl);
  }

  toggleMenu(menuId: string) {
    this.expandedMenus[menuId] = !this.expandedMenus[menuId];
    this.sidebarPrefs.setExpandedMenus(this.expandedMenus);
    if (this.expandedMenus[menuId]) {
      this.scrollItemIntoView(menuId);
    }
  }

  // Keeps the active/opened tab visible by scrolling the sidebar's scroll
  // container, without moving the page itself.
  private scrollActiveItemIntoView() {
    const activeId = this.getActiveTopLevelItemId();
    if (activeId) {
      this.scrollItemIntoView(activeId);
    }
  }

  private getActiveTopLevelItemId(): string | null {
    for (const category of this.menuCategories) {
      for (const item of category.items) {
        if (item.route && this.activeLink === item.route) return item.id;
        if (item.children?.some((child) => this.activeLink === child.route)) {
          return item.id;
        }
      }
    }
    return null;
  }

  private scrollItemIntoView(itemId: string) {
    setTimeout(() => {
      const el = this.eref.nativeElement.querySelector(
        `#sidebar-item-${itemId}`,
      );
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  }

  hasAccess(item: MenuItem | SubMenuItem): boolean {
    if (!this.privileges || !item.privilegeKey) return true;

    const privilegeObj = this.privileges[item.privilegeKey as keyof Privileges];
    if (!privilegeObj) return false;

    // Handle when privilegeObj is just a boolean
    if (typeof privilegeObj === 'boolean') {
      return privilegeObj; // If it's true, access is granted
    }

    // Handle inventory with nested structure
    if (
      item.privilegeKey === 'inventory' &&
      typeof privilegeObj === 'object' &&
      'products' in privilegeObj
    ) {
      const inventoryPrivilege = privilegeObj as any;
      return item.privilegeValue === 'none'
        ? inventoryPrivilege.products?.viewReport !== 'none' ||
            inventoryPrivilege.stockEntries?.viewReport !== 'none'
        : inventoryPrivilege.products?.viewReport === item.privilegeValue ||
            inventoryPrivilege.stockEntries?.viewReport === item.privilegeValue;
    }

    // Handle when privilegeObj is an object
    if (typeof privilegeObj === 'object') {
      const obj = privilegeObj as any;

      // Direct boolean property check based on privilegeValue matching an exact boolean key
      if (
        item.privilegeValue &&
        typeof obj[item.privilegeValue] === 'boolean'
      ) {
        return obj[item.privilegeValue];
      }

      // Existing viewReport logic
      if ('viewReport' in obj) {
        const viewReport = obj.viewReport ?? 'none';

        // When privilegeValue is 'none', user access is granted if viewReport != 'none'
        // OR if it's a dropdown container and ANY nested boolean flag is true.
        if (item.privilegeValue === 'none') {
          if (viewReport !== 'none') return true;
          if ('hasDropdown' in item && item.hasDropdown) {
            return Object.values(obj).some((val) => val === true);
          }
          return false;
        }

        return viewReport === item.privilegeValue;
      }
    }

    // Default fallback if structure doesn't match expected patterns
    return false;
  }

  categoryHasAccess(category: MenuCategory): boolean {
    return category.items.some((item) => this.hasAccess(item));
  }

  // In the minimised sidebar the sub-tab list is hidden, so highlight the
  // parent icon instead when the active route belongs to one of its children.
  isParentActive(item: MenuItem): boolean {
    if (item.route && this.activeLink === item.route) return true;
    return !!item.children?.some((child) => this.activeLink === child.route);
  }

  get visibleCategories(): MenuCategory[] {
    return this.menuCategories.filter((category) =>
      this.categoryHasAccess(category),
    );
  }

  getSubMenuLabel(subItem: SubMenuItem): string {
    if (
      subItem.alternateLabel &&
      subItem.alternateCondition &&
      this.privileges
    ) {
      return subItem.alternateCondition(this.privileges)
        ? subItem.alternateLabel
        : subItem.label;
    }
    return subItem.label;
  }

  ngOnDestroy(): void {
    if (this.mySubscription) {
      this.mySubscription.unsubscribe();
    }
  }
}
