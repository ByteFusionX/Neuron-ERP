import { Privileges } from 'src/app/shared/interfaces/employee.interface';

export type SettingsSectionId =
  | 'company-profile'
  | 'master-data'
  | 'documentation'
  | 'approval-rules'
  | 'numbering'
  | 'notifications'
  | 'audit';

export interface SettingsAccess {
  privileges?: Privileges;
  isSuperAdmin?: boolean;
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
    id: 'company-profile',
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
    description: 'Managed lists other screens pick from: product units and availability, notes and terms.',
    icon: 'heroCircleStack',
    group: 'Company',
    children: [
      { path: 'product', label: 'Product Data' },
      { path: 'customer', label: 'Customer Data' },
      { path: 'supplier', label: 'Supplier Data' },
      { path: 'notes-terms', label: 'Notes & Terms' },
    ],
    keywords: ['lists', 'lookup', 'unit', 'uom', 'availability', 'note', 'terms', 'conditions', 'quotation'],
    canView: ({ privileges }) => !!privileges?.portalManagement?.masterData,
  },
  {
    id: 'documentation',
    label: 'Document',
    description: 'Document template controls for quotation, PO, GRN, delivery note and invoice outputs.',
    icon: 'heroDocumentText',
    group: 'Company',
    keywords: ['document', 'documentation', 'template', 'quotation', 'quote', 'po', 'lpo', 'grn', 'delivery note', 'invoice', 'pdf'],
    canView: ({ privileges, isSuperAdmin }) => !!isSuperAdmin || !!privileges?.portalManagement?.documentation,
  },
  {
    id: 'approval-rules',
    label: 'Workflow',
    description: 'Approval workflows: who approves each request, in what order.',
    icon: 'heroCheckBadge',
    group: 'Workflow',
    keywords: ['approval', 'workflow', 'approver', 'escalation', 'steps', 'deal sheet', 'presale', 'purchase'],
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
