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
  /** Several notification counts summed into one badge, for a single entry that replaced a dropdown. */
  notificationKeys?: string[];
  /** Boolean privilege flags that also grant access, even when `privilegeValue` itself is not met. */
  anyOfFlags?: string[];
  children?: SubMenuItem[];
  inventorySubKey?: 'products' | 'stockEntries';
}

export interface SubMenuItem {
  id: string;
  label: string;
  route?: string;
  privilegeKey?: keyof Privileges;
  privilegeValue?: string;
  notificationKey?: string;
  children?: SubMenuItem[];
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
        label: 'Customer',
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
        route: '/presales',
        privilegeKey: 'assignedJob',
        privilegeValue: 'none',
        notificationKey: 'assignedJobCount',
      },
      {
        id: 'quotations',
        label: 'Quotation',
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
        privilegeValue: 'none',
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
    id: 'catalog',
    label: 'Catalog',
    group: 'Sales & Jobs',
    items: [
      {
        id: 'salesProducts',
        label: 'Product',
        icon: 'heroCube',
        route: '/products',
        privilegeKey: 'inventory',
        privilegeValue: 'none',
        inventorySubKey: 'products',
      },
      {
        id: 'salesSuppliers',
        label: 'Supplier',
        icon: 'heroBuildingOffice',
        route: '/suppliers',
        privilegeKey: 'supplier',
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
        id: 'purchaseRequests',
        label: 'PR',
        icon: 'heroClipboardDocumentList',
        route: '/purchase/pr',
        privilegeKey: 'purchase',
        privilegeValue: 'none',
        notificationKey: 'purchaseCount',
      },
      {
        id: 'purchaseOrders',
        label: 'PO',
        icon: 'heroShoppingBag',
        route: '/purchase/po',
        privilegeKey: 'purchaseOrder',
        privilegeValue: 'none',
        notificationKey: 'lpoApprovalCount',
      },
      {
        id: 'generalPurchase',
        label: 'General',
        icon: 'heroShoppingCart',
        route: '/purchase/general',
        privilegeKey: 'purchase',
        privilegeValue: 'none',
        notificationKey: 'purchaseCount',
      },
    ],
  },
  {
    id: 'grn',
    label: 'GRN',
    group: 'Operations',
    items: [
      {
        id: 'grnList',
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
        id: 'stockOverview',
        label: 'Stock Balance',
        icon: 'heroCube',
        route: '/stock/overview',
        privilegeKey: 'inventory',
        privilegeValue: 'none',
        inventorySubKey: 'stockEntries',
      },
      {
        id: 'stockLedger',
        label: 'Stock Movement',
        icon: 'heroCube',
        route: '/stock/ledger',
        privilegeKey: 'inventory',
        privilegeValue: 'none',
        inventorySubKey: 'stockEntries',
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
        route: '/dispatch',
        privilegeKey: 'dispatch',
        privilegeValue: 'none',
      },
    ],
  },
  {
    id: 'operationsCatalog',
    label: 'Catalog',
    group: 'Operations',
    items: [
      {
        id: 'purchaseProducts',
        label: 'Product',
        icon: 'heroCube',
        route: '/products',
        privilegeKey: 'inventory',
        privilegeValue: 'none',
        inventorySubKey: 'products',
      },
      {
        id: 'suppliers',
        label: 'Supplier',
        icon: 'heroBuildingOffice',
        route: '/suppliers',
        privilegeKey: 'supplier',
        privilegeValue: 'none',
        notificationKey: 'supplierCount',
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
        route: '/technical/project-page',
        privilegeKey: 'technical',
        privilegeValue: 'none',
        anyOfFlags: ['canViewOpenToWorkAndAssign', 'canTransferToEngineer', 'canApproveMRRequests'],
        notificationKeys: ['technicalCount', 'technicalProjectCount', 'technicalApprovalCount'],
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
    label: 'Invoices',
    group: 'Finance',
    items: [
      {
        id: 'vendor-bills',
        label: 'Vendor Bill',
        icon: 'heroClipboardDocumentList',
        route: '/finance/vendor-bills',
        privilegeKey: 'invoice',
        privilegeValue: 'none',
      },
      {
        id: 'payables',
        label: 'Payable',
        icon: 'heroDocumentText',
        route: '/finance/payables',
        privilegeKey: 'invoice',
        privilegeValue: 'none',
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
        label: 'Expense',
        icon: 'heroDocumentPlus',
        route: '/claims/expenses',
        privilegeKey: 'claims',
        hasDropdown: true,
        privilegeValue: 'none',
        children: [
          {
            id: 'expenses',
            label: 'Expense',
            route: '/claims/expenses',
            privilegeKey: 'claims',
            privilegeValue: 'none',
            notificationKey: 'claimsCount',
          },
          {
            id: 'approvalRequests',
            label: 'Approval Request',
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
        label: 'Employee',
        icon: 'heroIdentification',
        route: '/hr/employees',
        privilegeKey: 'employee',
        privilegeValue: 'none',
      },
      {
        id: 'hr-departments',
        label: 'Department',
        icon: 'heroBuildingLibrary',
        route: '/hr/departments',
        privilegeKey: 'departments',
        privilegeValue: 'view',
      },
      {
        id: 'roles-privileges',
        label: 'Roles & Privileges',
        icon: 'heroShieldCheck',
        route: '/hr/roles-privileges',
        privilegeKey: 'roles',
        privilegeValue: 'view',
      },
    ],
  },
];

export const GROUP_KEYS: Record<string, 'sales' | 'operations' | 'projects' | 'finance' | 'administration'> = {
  'Sales & Jobs': 'sales',
  Sales: 'sales', // privilege drawer tab name
  Operations: 'operations',
  Projects: 'projects',
  Finance: 'finance',
  Administration: 'administration',
};

// A group switched off in the role hides everything under it; its dashboard has its own switch.
// Missing flags mean allowed, so roles saved before these existed keep working.
export function groupAllowed(privileges: Privileges | undefined, category: MenuCategory): boolean {
  if (!privileges || !category.group) return true;
  const flags = privileges.groups?.[GROUP_KEYS[category.group]];
  if (flags?.enabled === false) return false;
  const isDashboard = category.items.length === 1 && category.items[0].id === category.id && category.id.endsWith('-dashboard');
  return !(isDashboard && flags?.dashboard === false);
}

export function hasMenuAccess(privileges: Privileges | undefined, item: MenuItem | SubMenuItem): boolean {
  if (privileges && (item.id === 'home' || item.id === 'dashboard')) {
    return privileges.main?.[item.id] !== false;
  }
  if (!privileges || !item.privilegeKey) return true;

  if (
    'hasDropdown' in item &&
    item.hasDropdown &&
    item.children?.some((child) => hasMenuAccess(privileges, child))
  ) {
    return true;
  }

  if (item.privilegeKey === 'departments') return departmentPrivileges(privileges).view;

  const privilegeObj = privileges[item.privilegeKey as keyof Privileges];
  if (!privilegeObj) return false;

  if (
    'anyOfFlags' in item &&
    typeof privilegeObj === 'object' &&
    item.anyOfFlags?.some((flag) => (privilegeObj as any)[flag] === true)
  ) {
    return true;
  }

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
  const addChildEntries = (item: MenuItem, child: SubMenuItem, context: string, trail: string[] = []) => {
    if (!hasMenuAccess(privileges, child)) return;
    const labels = [...trail, child.label];
    if (child.route) entries.push({ label: `${item.label} › ${labels.join(' › ')}`, context, route: child.route, icon: item.icon });
    for (const nestedChild of child.children ?? []) {
      addChildEntries(item, nestedChild, context, labels);
    }
  };

  for (const category of MENU_CATEGORIES) {
    if (!groupAllowed(privileges, category)) continue;
    const context = category.group ?? (category.label || 'Overview');
    for (const item of category.items) {
      if (!hasMenuAccess(privileges, item)) continue;
      if (item.route) entries.push({ label: item.label, context, route: item.route, icon: item.icon });
      for (const child of item.children ?? []) {
        addChildEntries(item, child, context);
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
    const considerChild = (item: MenuItem, child: SubMenuItem, parents: Crumb[]) => {
      const childCrumbs = [...parents, { label: child.label, route: child.route }];
      if (child.route) consider(child.route, childCrumbs);
      for (const nestedChild of child.children ?? []) {
        considerChild(item, nestedChild, childCrumbs);
      }
    };

    for (const item of category.items) {
      if (item.route) consider(item.route, [...lead, { label: item.label, route: item.route }]);
      for (const child of item.children ?? []) {
        considerChild(item, child, [...lead, { label: item.label, route: item.route }]);
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
  if (hasDeeperSegments) {
    // A "/report" sub page is a page in its own right, not a record's details.
    const next = path.slice(route.length).split('/').filter(Boolean)[0];
    return [...crumbs, { label: next === 'report' ? 'Report' : 'Details' }];
  }
  const last = crumbs[crumbs.length - 1];
  return [...crumbs.slice(0, -1), { label: last.label }];
}
