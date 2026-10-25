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
  slideLogoState,
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
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { Privileges } from '../../interfaces/employee.interface';
import { MENU_CATEGORIES, MenuCategory, MenuItem, SubMenuItem, groupAllowed, hasMenuAccess } from '../../constants/nav-menu';
import { combineLatest, Observable, Subscription } from 'rxjs';
import { NotificationService } from 'src/app/core/services/notification.service';
import { SidebarPreferencesService } from 'src/app/core/services/sidebar-preferences.service';
import { NotificationCounts, TextNotification } from '../../interfaces/notification.interface';
import { ThemeService } from 'src/app/core/services/theme.service';
import { FormsModule } from '@angular/forms';
import { SettingsNavService } from 'src/app/modules/settings/settings-nav.service';
import { SearchFieldComponent } from '../search-field/search-field.component';

@Component({
  selector: 'app-side-bar',
  templateUrl: './side-bar.component.html',
  styleUrls: ['./side-bar.component.css'],
  animations: [dropDownMenuSate, buttonSlideState, slideLogoState],
  imports: [CommonModule, IconsModule, RouterModule, FormsModule, SearchFieldComponent],
  standalone: true,
})
export class SideBarComponent
  implements OnInit, OnChanges, AfterViewInit, OnDestroy
{
  @Input() showFullBar: boolean = true;
  overviewItems: MenuItem[] = [
    { id: 'home', label: 'Home', icon: 'heroHome', route: '/home' },
    { id: 'dashboard', label: 'Dashboard', icon: 'heroChartBar', route: '/dashboard' },
  ];
  logoAnimationsReady: boolean = false;
  activeLink: string = '';
  showTabs: boolean = false;
  isSettingsRoute: boolean = false;
  privileges!: Privileges | undefined;
  isSuperAdmin: boolean = false;
  mySubscription: Subscription = new Subscription();
  expandedMenus: { [key: string]: boolean } = {};
  collapsedGroups: { [key: string]: boolean } = {};
  menuSearch: string = '';
  readonly groupIcons: { [group: string]: string } = {
    'Sales & Jobs': 'heroBriefcase',
    Operations: 'heroTruck',
    Projects: 'heroWrenchScrewdriver',
    Finance: 'heroBanknotes',
    Administration: 'heroUserGroup',
  };
  // Tracks the navigation target url, not this.router.url (which only updates
  // once a navigation is committed, so it can't be trusted mid-navigation).
  private currentUrl: string;

  // Per-module unread counts, derived client-side by grouping unviewed
  // notifications by type. Keyed by the notificationKey values used on
  // MenuItem/SubMenuItem above.
  notificationCounts: Partial<NotificationCounts> = {};

  private readonly notificationTypeToKey: Partial<
    Record<string, keyof NotificationCounts>
  > = {
    Announcement: 'announcementCount',
    AssignedJob: 'assignedJobCount',
    ReAssignedJob: 'assignedJobCount',
    FeedbackRequest: 'enquiryCount',
    Enquiry: 'enquiryCount',
    DealSheet: 'dealSheetCount',
    DealSheetResponse: 'quotationCount',
    Quotation: 'quotationCount',
    JobAllocated: 'purchaseCount',
    ProcurementTransferred: 'purchaseCount',
    PurchaseApprovalRequest: 'purchaseCount',
    PurchaseProcurementNotice: 'purchaseCount',
    MrApproved: 'purchaseCount',
    PurchaseApproved: 'purchaseApprovedCount',
    PurchaseRejected: 'purchaseApprovedCount',
    LpoApprovalRequest: 'lpoApprovalCount',
    LpoApproved: 'lpoApprovedCount',
    LpoRejected: 'lpoApprovedCount',
    MrRequest: 'technicalProjectCount',
    MrRejected: 'technicalProjectCount',
    TechnicalAssigned: 'technicalCount',
    MrApprovalRequest: 'technicalApprovalCount',
    SupplierApprovalRequest: 'supplierCount',
    SupplierApproved: 'supplierCount',
    SupplierRejected: 'supplierCount',
    ClaimApproved: 'claimsCount',
    ClaimRejected: 'claimsCount',
    ClaimPaid: 'claimsCount',
    ClaimApprovalRequest: 'claimsApprovalCount',
  };

  menuCategories: MenuCategory[] = MENU_CATEGORIES;

  constructor(
    private eref: ElementRef,
    private router: Router,
    private _employeeService: EmployeeService,
    private _notificationService: NotificationService,
    private sidebarPrefs: SidebarPreferencesService,
    public themeService: ThemeService,
    public settingsNav: SettingsNavService,
  ) {
    this.currentUrl = this.router.url;
    this.isSettingsRoute = this.router.url.split('?')[0].startsWith('/settings');
    this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        this.activeLink = event.urlAfterRedirects;
        this.isSettingsRoute = event.urlAfterRedirects.split('?')[0].startsWith('/settings');
        this.openActiveGroup(event.urlAfterRedirects);
        this.scrollActiveItemIntoView();
      }
    });
  }

  ngOnInit() {
    this.checkPermission();
    this.settingsNav.init();

    this.mySubscription.add(
      combineLatest([
        this._notificationService.textNotificationsSubject$,
        this._notificationService.markedUnreadIds$,
      ]).subscribe(([{ viewed, unviewed }, markedUnreadIds]) => {
        const reMarkedUnread = (viewed || []).filter(
          (notification) => notification._id && markedUnreadIds.has(notification._id),
        );
        this.notificationCounts = this.computeNotificationCounts([
          ...unviewed,
          ...reMarkedUnread,
        ]);
      }),
    );

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

    this.collapsedGroups = { ...this.sidebarPrefs.getCollapsedGroups() };
    this.openActiveGroup(this.currentUrl);

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


  ngAfterViewInit(): void {
    this.router.events.subscribe((event: any) => {
      if (event instanceof NavigationStart) {
        this.currentUrl = event.url;
        this.expandActiveRouteMenus(event.url);
      }
    });

    // Enable the logo slide animation only after the initial render, so it
    // plays on minimise/maximise button clicks and not on page load.
    setTimeout(() => {
      this.logoAnimationsReady = true;
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
          const shouldExpand = item.children.some((child) => this.subItemMatchesUrl(child, url));
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
      this.isSuperAdmin = /^superadmin$/i.test(data?.category.role ?? '');
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

  // Settings sections with sub-pages behave like the module dropdowns: the row toggles the list.
  toggleSettingsSection(section: { id: string; children?: { path: string }[] }) {
    if (!section.children?.length) {
      this.router.navigate(['/settings', section.id]);
      return;
    }
    const key = 'settings:' + section.id;
    const isActive = this.settingsNav.activeSection?.id === section.id;
    if (!isActive) {
      this.expandedMenus[key] = true;
      this.router.navigate(['/settings', section.id, section.children![0].path]);
      return;
    }
    this.expandedMenus[key] = !this.expandedMenus[key];
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
        if (item.children?.some((child) => this.subItemIsActive(child))) {
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
    if (this.isSuperAdmin) return true;
    return hasMenuAccess(this.privileges, item);
  }

  // Items with no privilege key (group dashboards, Finance) are open to everyone, which would
  // surface empty groups. Inside a group they only count when the user has a gated item there.
  categoryHasAccess(category: MenuCategory): boolean {
    if (this.isSuperAdmin) return true;
    if (!groupAllowed(this.privileges, category)) return false;
    if (!category.items.some((item) => this.hasAccess(item))) return false;
    if (!category.group) return true;
    return MENU_CATEGORIES.some(
      (c) =>
        c.group === category.group &&
        c.items.some((item) => !!item.privilegeKey && this.hasAccess(item)),
    );
  }

  // In the minimised sidebar the sub-tab list is hidden, so highlight the
  // parent icon instead when the active route belongs to one of its children.
  isParentActive(item: MenuItem): boolean {
    if (item.route && this.activeLink === item.route) return true;
    return !!item.children?.some((child) => this.subItemIsActive(child));
  }

  get visibleCategories(): MenuCategory[] {
    const searching = !!this.menuSearch.trim() && this.showFullBar;
    return this.menuCategories.filter(
      (category) =>
        this.categoryHasAccess(category) &&
        (!searching ||
          category.items.some((item) => this.hasAccess(item) && this.itemMatchesSearch(item))),
    );
  }

  // A user whose modules all sit in one group (e.g. only Sales & Jobs) gets a flat menu:
  // no group accordion and no search box. Both are for people with many modules.
  get isCompactMenu(): boolean {
    // Main (Home/Dashboard) has no group and doesn't count toward "many modules".
    const groups = new Set(
      this.menuCategories
        .filter((c) => c.group && this.categoryHasAccess(c))
        .map((c) => c.group as string),
    );
    return groups.size <= 1;
  }

  // The group a category is shown under, or undefined when the menu is flat.
  groupOf(category: MenuCategory): string | undefined {
    return this.isCompactMenu ? undefined : category.group;
  }

  // True when the category at this index starts a new run of categories sharing
  // the same `group` (e.g. the first of Purchase/Inventory/Technical/Logistics
  // under "Operations"). Ungrouped categories always start their own run, so the
  // minimised rail can draw one divider per group instead of per category.
  isNewGroup(index: number): boolean {
    const categories = this.visibleCategories;
    const category = categories[index];
    const prev = categories[index - 1];
    if (!prev) return true;
    return prev.group !== category?.group;
  }

  // Accordion: opening a group closes the others, so the menu stays short.
  toggleGroup(group: string): void {
    const opening = !!this.collapsedGroups[group];
    Object.keys(this.groupIcons).forEach((g) => (this.collapsedGroups[g] = true));
    this.collapsedGroups[group] = !opening;
    this.sidebarPrefs.setCollapsedGroups(this.collapsedGroups);
  }

  // Groups are collapsed unless opened; searching temporarily opens them all.
  isGroupCollapsed(group?: string): boolean {
    if (!group || this.menuSearch.trim()) return false;
    return this.collapsedGroups[group] !== false;
  }

  getGroupIcon(group: string): string {
    return this.groupIcons[group] ?? 'heroChartBar';
  }

  // Rolled-up unread count for a collapsed group header.
  getGroupBadgeCount(group: string): number {
    let total = 0;
    this.menuCategories
      .filter((category) => category.group === group)
      .forEach((category) =>
        category.items
          .filter((item) => this.hasAccess(item))
          .forEach((item) => {
            if (item.children?.length) {
              item.children.forEach((child) => (total += this.getSubMenuBadgeCount(child)));
            } else {
              total += this.getTopLevelBadgeCount(item);
            }
          }),
      );
    return total;
  }

  private openActiveGroup(url: string) {
    const path = url.split('?')[0];
    const matches = this.menuCategories.filter((c) =>
      c.items.some(
        (item) =>
          (item.route && path.startsWith(item.route)) ||
          item.children?.some((child) => this.subItemContainsPath(child, path)),
      ),
    );
    // Routes like /products and /suppliers sit in more than one group; keep
    // the group the user clicked from open instead of jumping to the first.
    const category =
      matches.find((c) => c.group && this.collapsedGroups[c.group] === false) ?? matches[0];
    if (!category?.group) return;
    Object.keys(this.groupIcons).forEach((g) => (this.collapsedGroups[g] = true));
    this.collapsedGroups[category.group] = false;
    this.sidebarPrefs.setCollapsedGroups(this.collapsedGroups);
  }

  private searchMatches(label: string): boolean {
    const term = this.menuSearch.trim().toLowerCase();
    return !term || label.toLowerCase().includes(term);
  }

  itemMatchesSearch(item: MenuItem): boolean {
    return (
      this.searchMatches(item.label) ||
      !!item.children?.some((child) => this.subItemMatchesSearch(item, child))
    );
  }

  // Children of a matching parent stay visible; otherwise only matching children show.
  subItemMatchesSearch(item: MenuItem, child: SubMenuItem): boolean {
    return (
      this.searchMatches(item.label) ||
      this.searchMatches(this.getSubMenuLabel(child)) ||
      this.searchMatches(child.label) ||
      !!child.children?.some((nestedChild) => this.subItemMatchesSearch(item, nestedChild))
    );
  }

  clearSearch(): void {
    this.menuSearch = '';
  }

  private computeNotificationCounts(
    unviewed: TextNotification[],
  ): Partial<NotificationCounts> {
    const counts: Partial<NotificationCounts> = {};
    // Enquiry alerts pile up per enquiry (follow-ups, feedback...); the badge counts enquiries that need a look,
    // so it lines up with what the list shows instead of the number of messages.
    const seenEnquiries = new Set<string>();
    for (const notification of unviewed || []) {
      const key = this.notificationTypeToKey[notification.type];
      if (!key) continue;
      if (key === 'enquiryCount') {
        const ref = notification.additionalData?.enquiryId ?? notification.referenceId?._id ?? notification.referenceId;
        const id = ref ? String(ref) : '';
        if (id) {
          if (seenEnquiries.has(id)) continue;
          seenEnquiries.add(id);
        }
      }
      counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
  }

  // Sub-tab badge: always its own count, shown once its parent dropdown is expanded.
  getSubMenuBadgeCount(subItem: SubMenuItem): number {
    if (subItem.children?.length) {
      return subItem.children.reduce((total, child) => total + this.getSubMenuBadgeCount(child), 0);
    }
    if (!subItem.notificationKey) return 0;
    return (
      this.notificationCounts[subItem.notificationKey as keyof NotificationCounts] ||
      0
    );
  }

  // Top-level badge: while the dropdown is collapsed, roll up all of its
  // children's counts into one number on the main tab. Once expanded, the
  // children show their own badges instead, so the parent badge hides.
  getTopLevelBadgeCount(item: MenuItem): number {
    if (item.hasDropdown && item.children?.length) {
      if (this.expandedMenus[item.id]) return 0;
      const keys = new Set(
        item.children
          .flatMap((child) => this.getSubMenuNotificationKeys(child))
          .filter((key): key is string => !!key),
      );
      let total = 0;
      keys.forEach((key) => {
        total += this.notificationCounts[key as keyof NotificationCounts] || 0;
      });
      return total;
    }
    if (item.notificationKeys?.length) {
      return item.notificationKeys.reduce(
        (total, key) => total + (this.notificationCounts[key as keyof NotificationCounts] || 0),
        0,
      );
    }
    if (!item.notificationKey) return 0;
    return (
      this.notificationCounts[item.notificationKey as keyof NotificationCounts] ||
      0
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

  private subItemMatchesUrl(child: SubMenuItem, url: string): boolean {
    return (
      (!!child.route && url.includes(child.route.replace('/', ''))) ||
      !!child.children?.some((nestedChild) => this.subItemMatchesUrl(nestedChild, url))
    );
  }

  private subItemIsActive(child: SubMenuItem): boolean {
    return (
      (!!child.route && this.activeLink === child.route) ||
      !!child.children?.some((nestedChild) => this.subItemIsActive(nestedChild))
    );
  }

  private subItemContainsPath(child: SubMenuItem, path: string): boolean {
    return (
      (!!child.route && path.startsWith(child.route)) ||
      !!child.children?.some((nestedChild) => this.subItemContainsPath(nestedChild, path))
    );
  }

  private getSubMenuNotificationKeys(child: SubMenuItem): string[] {
    return [
      ...(child.notificationKey ? [child.notificationKey] : []),
      ...(child.children?.flatMap((nestedChild) => this.getSubMenuNotificationKeys(nestedChild)) ?? []),
    ];
  }

  ngOnDestroy(): void {
    if (this.mySubscription) {
      this.mySubscription.unsubscribe();
    }
  }
}
