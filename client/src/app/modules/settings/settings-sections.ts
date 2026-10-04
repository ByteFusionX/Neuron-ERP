import { Privileges } from 'src/app/shared/interfaces/employee.interface';

export type SettingsSectionId =
  | 'general'
  | 'master-data'
  | 'roles-privileges'
  | 'approval-rules'
  | 'numbering'
  | 'notifications'
  | 'audit';

export interface SettingsAccess {
  privileges?: Privileges;
}

export interface SettingsSection {
  id: SettingsSectionId;
  label: string;
  description: string;
  icon: string;
  group: string;
  /** Extra terms the sidebar search matches on, so people can find a section by what's inside it. */
  keywords?: string[];
  planned?: boolean;
  /** Sub-pages shown nested under the section in the sidebar, routed at /settings/<id>/<path>. */
  children?: { path: string; label: string }[];
  canView: (access: SettingsAccess) => boolean;
}

export const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    id: 'general',
    label: 'Company Profile',
    description: 'Company profile details and company-wide targets for sales revenue and gross profit.',
    icon: 'heroBuildingOffice',
    group: 'Company',
    keywords: ['company', 'profile', 'logo', 'tax', 'registration', 'target', 'revenue', 'profit', 'year'],
    canView: () => true,
  },
  {
    id: 'numbering',
    label: 'Numbering',
    description: 'Sequence rules for customer, enquiry, quotation, deal sheet and job sheet numbers.',
    icon: 'heroHashtag',
    group: 'Company',
    keywords: ['sequence', 'prefix', 'number', 'code', 'series'],
    canView: ({ privileges }) => !!privileges?.portalManagement?.numbering,
  },
  {
    id: 'master-data',
    label: 'Master Data',
    description: 'Business lists other screens pick from: notes and terms, role responsibilities, payment terms, tax rates, units, sources and industries.',
    icon: 'heroCircleStack',
    group: 'Company',
    children: [
      { path: 'customer', label: 'Customer Data' },
      { path: 'product', label: 'Product Data' },
      { path: 'purchase', label: 'Purchase Data' },
      { path: 'sales-documents', label: 'Sales Documents' },
      { path: 'notes-terms', label: 'Notes & Terms' },
      { path: 'responsibilities', label: 'Responsibilities' },
    ],
    keywords: ['responsibility', 'responsibilities', 'lists', 'lookup', 'payment terms', 'tax', 'vat', 'unit', 'uom', 'note', 'terms', 'conditions', 'quotation'],
    canView: ({ privileges }) => !!privileges?.portalManagement?.masterData,
  },
  {
    id: 'roles-privileges',
    label: 'Roles & Privileges',
    description: 'Roles (categories of employees) and what each role is allowed to see and do.',
    icon: 'heroShieldCheck',
    group: 'Access & Approvals',
    children: [
      { path: 'roles', label: 'Role Based' },
      { path: 'individual', label: 'User Specific' },
    ],
    keywords: ['role', 'roles', 'privilege', 'permission', 'category', 'access', 'individual', 'grant', 'override', 'flag', 'responsibility'],
    canView: ({ privileges }) => !!privileges?.roles?.view,
  },
  {
    id: 'approval-rules',
    label: 'Workflow',
    description: 'Approval workflows: who approves each request, in what order.',
    icon: 'heroCheckBadge',
    group: 'Access & Approvals',
    keywords: ['approval', 'workflow', 'approver', 'escalation', 'steps'],
    canView: ({ privileges }) => !!privileges?.portalManagement?.approvalRules,
  },
  {
    id: 'notifications',
    label: 'Notifications',
    description: 'Which events alert people, such as pending approvals and overdue follow-ups.',
    icon: 'heroBell',
    group: 'System',
    keywords: ['alert', 'email', 'reminder', 'overdue', 'pending'],
    canView: ({ privileges }) => !!privileges?.portalManagement?.notifications,
  },
  {
    id: 'audit',
    label: 'Audit & History',
    description: 'What changes are recorded and how long history is kept.',
    icon: 'heroClock',
    group: 'System',
    keywords: ['audit', 'history', 'log', 'retention'],
    canView: ({ privileges }) => !!privileges?.portalManagement?.audit,
  },
];

export function findSettingsSection(id: string | null | undefined): SettingsSection | undefined {
  return SETTINGS_SECTIONS.find((s) => s.id === id);
}
