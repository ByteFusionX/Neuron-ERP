import { Privileges } from '../interfaces/employee.interface';
import { departmentPrivileges } from '../utils/privilege-fallback';

export interface MenuItem {
  id: string;
  label: string;
  icon: string;
  route?: string;
  privilegeKey?: keyof Privileges;
  privilegeValue?: string;
  hasDropdown?: boolean;
  notificationKey?: string;
  children?: SubMenuItem[];
  inventorySubKey?: 'products' | 'stockEntries';
}

export interface SubMenuItem {
  id: string;
  label: string;
  route: string;
  privilegeKey?: keyof Privileges;
  privilegeValue?: string;
  notificationKey?: string;
  alternateLabel?: string;
  alternateCondition?: (privileges: Privileges) => boolean;
}

export interface MenuCategory {
  id: string;
  label: string;
  group?: string;
  items: MenuItem[];
}

export const MENU_CATEGORIES: MenuCategory[] = [
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
    id: 'sales-dashboard',
    label: '',
    group: 'Sales & Jobs',
    items: [
      {
        id: 'sales-dashboard',
        label: 'Dashboard',
        icon: 'heroChartBar',
        route: '/reports/sales-dashboard',
      },
    ],
  },
  {
    id: 'sales',
    label: 'Sales',
    group: 'Sales & Jobs',
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
        id: 'jobs',
        label: 'Presale',
        icon: 'heroBriefcase',
        route: '/assigned-jobs',
        privilegeKey: 'assignedJob',
        privilegeValue: 'none',
        notificationKey: 'assignedJobCount',
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
        route: '/deal-sheet/dealsheets',
        privilegeKey: 'dealSheet',
        notificationKey: 'dealSheetCount',
      },
    ],
  },
  {
    id: 'jobs',
    label: 'Jobs',
    group: 'Sales & Jobs',
    items: [
      {
        id: 'jobSheet',
        label: 'Job Sheet',
        icon: 'heroClipboardDocument',
        route: '/job-sheet',
        privilegeKey: 'jobSheet',
        privilegeValue: 'none',
      },
    ],
  },
  {
    id: 'operations-dashboard',
    label: '',
    group: 'Operations',
    items: [
      {
        id: 'operations-dashboard',
        label: 'Dashboard',
        icon: 'heroChartBar',
        route: '/reports/operations-dashboard',
      },
    ],
  },
  {
    id: 'procurement',
    label: 'Purchase',
    group: 'Operations',
    items: [
      {
        id: 'suppliers',
        label: 'Suppliers',
        icon: 'heroBuildingOffice',
        route: '/suppliers',
        privilegeKey: 'supplier',
        privilegeValue: 'none',
        notificationKey: 'supplierCount',
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
            id: 'purchaseRequests',
            label: 'PR',
            route: '/purchase/pr',
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
            notificationKey: 'lpoApprovalCount',
          },
          {
            id: 'approvedLpos',
            label: 'Approved LPOs',
            route: '/purchase-order/approved',
            privilegeKey: 'purchaseOrder',
            privilegeValue: 'none',
            notificationKey: 'lpoApprovedCount',
          },
        ],
      },
      {
        id: 'grn',
        label: 'GRN',
        icon: 'heroInboxArrowDown',
        route: '/grn/grn-list',
        privilegeKey: 'grn',
        privilegeValue: 'none',
      },
    ],
  },
  {
    id: 'inventory',
    label: 'Inventory',
    group: 'Operations',
    items: [
      {
        id: 'Products',
        label: 'Products',
        icon: 'heroCube',
        route: '/products',
        privilegeKey: 'inventory',
        privilegeValue: 'none',
        inventorySubKey: 'products',
      },
      {
        id: 'stockEntries',
        label: 'Stocks',
        icon: 'heroCube',
        hasDropdown: true,
        privilegeKey: 'inventory',
        privilegeValue: 'none',
        inventorySubKey: 'stockEntries',
        children: [
          {
            id: 'stockOverview',
            label: 'Overview',
            route: '/stock/overview',
          },
          {
            id: 'inventoryPlanning',
            label: 'Planning',
            route: '/stock/planning',
          },
          // Reservations demoted from main nav: it's transactional detail
          // that Planning already aggregates, and deal approval now
          // creates reservations automatically. Route stays live at
          // /stock/reservations; re-add here if it needs to be a
          // first-class page again.
          {
            id: 'stockLedger',
            label: 'Stock Ledger',
            route: '/stock/ledger',
          },
          {
            id: 'stockEntriesList',
            label: 'Stock Entries',
            route: '/stock/stock-entries',
          },
          {
            id: 'stockOnHold',
            label: 'Stock Holds',
            route: '/stock/stock-holds',
          },
        ],
      },
    ],
  },
  {
    id: 'administration',
    label: 'Logistics',
    group: 'Operations',
    items: [
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
    id: 'projects-dashboard',
    label: '',
    group: 'Projects',
    items: [
      {
        id: 'projects-dashboard',
        label: 'Dashboard',
        icon: 'heroChartBar',
        route: '/reports/projects-dashboard',
      },
    ],
  },
  {
    id: 'technicalCategory',
    label: 'Technical',
    group: 'Projects',
    items: [
      {
        id: 'technical',
        label: 'Technical',
        icon: 'heroWrenchScrewdriver',
        hasDropdown: true,
        privilegeKey: 'technical',
        privilegeValue: 'none',
        notificationKey: 'technicalCount',
        children: [
          {
            id: 'pendingJobs',
            label: 'Open To Work',
            route: '/technical/open-to-work-project',
            privilegeKey: 'technical',
            privilegeValue: 'canViewOpenToWorkAndAssign',
            notificationKey: 'technicalCount',
          },
          {
            id: 'projects',
            label: 'Pending Projects',
            route: '/technical/project',
            privilegeKey: 'technical',
            privilegeValue: 'none',
            notificationKey: 'technicalProjectCount',
          },
          {
            id: 'amc',
            label: 'Pending AMC',
            route: '/technical/amc',
            privilegeKey: 'technical',
            privilegeValue: 'none',
          },
          {
            id: 'mrApprovalRequests',
            label: 'MR Approval Requests',
            route: '/technical/mr-approval-requests',
            privilegeKey: 'technical',
            privilegeValue: 'canApproveMRRequests',
            notificationKey: 'technicalApprovalCount',
          },
        ],
      },
    ],
  },
  {
    id: 'finance-dashboard',
    label: '',
    group: 'Finance',
    items: [
      {
        id: 'finance-dashboard',
        label: 'Dashboard',
        icon: 'heroChartBar',
        route: '/reports/finance-dashboard',
      },
    ],
  },
  {
    id: 'finance',
    label: 'Finance',
    group: 'Finance',
    items: [
      {
        id: 'finance',
        label: 'Finance',
        icon: 'heroBanknotes',
        route: '/finance',
      },
    ],
  },
  {
    id: 'claims',
    label: 'Claims',
    group: 'Finance',
    items: [
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
            notificationKey: 'claimsCount',
          },
          {
            id: 'approvalRequests',
            label: 'Approval Requests',
            route: '/claims/approval-requests',
            privilegeKey: 'claims',
            privilegeValue: 'canApprove',
            notificationKey: 'claimsApprovalCount',
          },
        ],
      },
    ],
  },
  {
    id: 'hr-dashboard',
    label: '',
    group: 'Administration',
    items: [
      {
        id: 'hr-dashboard',
        label: 'Dashboard',
        icon: 'heroChartBar',
        route: '/reports/hr-dashboard',
      },
    ],
  },
  {
    id: 'hr',
    label: 'HR',
    group: 'Administration',
    items: [
      {
        id: 'employees',
        label: 'Employees',
        icon: 'heroIdentification',
        route: '/hr/employees',
        privilegeKey: 'employee',
        privilegeValue: 'none',
      },
      {
        id: 'hr-departments',
        label: 'Departments',
        icon: 'heroBuildingLibrary',
        route: '/hr/departments',
        privilegeKey: 'departments',
        privilegeValue: 'view',
      },
      {
        id: 'hr-roles-privileges',
        label: 'Roles & Privileges',
        icon: 'heroShieldCheck',
        route: '/hr/roles-privileges',
        privilegeKey: 'roles',
        privilegeValue: 'view',
      },
    ],
  },
];

export function hasMenuAccess(privileges: Privileges | undefined, item: MenuItem | SubMenuItem): boolean {
  if (!privileges || !item.privilegeKey) return true;

  if (item.privilegeKey === 'departments') return departmentPrivileges(privileges).view;

  const privilegeObj = privileges[item.privilegeKey as keyof Privileges];
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

    // Products / Stocks are now separate top-level tabs, each gated on
    // its own nested viewReport instead of the combined inventory check.
    if ('inventorySubKey' in item && item.inventorySubKey) {
      const subPrivilege = inventoryPrivilege[item.inventorySubKey];
      return item.privilegeValue === 'none'
        ? subPrivilege?.viewReport !== 'none'
        : subPrivilege?.viewReport === item.privilegeValue;
    }

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

export interface NavEntry {
  label: string;
  context: string;
  route: string;
  icon: string;
}

// Flat, permission-filtered list of every navigable page, for the command palette.
export function buildNavEntries(privileges: Privileges | undefined): NavEntry[] {
  const entries: NavEntry[] = [];
  for (const category of MENU_CATEGORIES) {
    const context = category.group ?? (category.label || 'Overview');
    for (const item of category.items) {
      if (!hasMenuAccess(privileges, item)) continue;
      if (item.route) entries.push({ label: item.label, context, route: item.route, icon: item.icon });
      for (const child of item.children ?? []) {
        if (!hasMenuAccess(privileges, child)) continue;
        entries.push({ label: `${item.label} › ${child.label}`, context, route: child.route, icon: item.icon });
      }
    }
  }
  return entries;
}

export interface Crumb {
  label: string;
  route?: string;
}

const humanise = (segment: string) =>
  segment.replace(/[-_]+/g, ' ').replace(/^./, (c) => c.toUpperCase());

// Derives "Group › Page › Sub page" from the sidebar menu; deeper unknown segments become "Details".
// The last crumb is the current page, so it carries no route.
export function buildBreadcrumbs(url: string): Crumb[] {
  const path = url.split('?')[0].split('#')[0].replace(/\/+$/, '') || '/';
  let best: { route: string; crumbs: Crumb[] } | null = null;

  const consider = (route: string, crumbs: Crumb[]) => {
    if (path !== route && !path.startsWith(route + '/')) return;
    if (!best || route.length > best.route.length) best = { route, crumbs };
  };

  for (const category of MENU_CATEGORIES) {
    const lead: Crumb[] = category.group ? [{ label: category.group }] : [];
    for (const item of category.items) {
      if (item.route) consider(item.route, [...lead, { label: item.label, route: item.route }]);
      for (const child of item.children ?? []) {
        consider(child.route, [
          ...lead,
          { label: item.label, route: item.route },
          { label: child.label, route: child.route },
        ]);
      }
    }
  }

  if (!best) {
    const [first, second] = path.split('/').filter(Boolean);
    if (!first) return [];
    return second
      ? [{ label: humanise(first), route: '/' + first }, { label: humanise(second) }]
      : [{ label: humanise(first) }];
  }

  const { route, crumbs } = best as { route: string; crumbs: Crumb[] };
  const hasDeeperSegments = path.length > route.length;
  if (hasDeeperSegments) return [...crumbs, { label: 'Details' }];
  const last = crumbs[crumbs.length - 1];
  return [...crumbs.slice(0, -1), { label: last.label }];
}
