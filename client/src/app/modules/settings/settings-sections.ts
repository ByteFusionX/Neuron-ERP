import { Privileges } from 'src/app/shared/interfaces/employee.interface';

export type SettingsSectionId =
  | 'general'
  | 'master-data'
  | 'approval-rules'
  | 'notes-terms'
  | 'numbering'
  | 'notifications'
  | 'audit';

export interface SettingsAccess {
  privileges?: Privileges;
  isSuperAdmin: boolean;
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
  canView: (access: SettingsAccess) => boolean;
}

const superAdminOnly = ({ isSuperAdmin }: SettingsAccess) => isSuperAdmin;

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
    id: 'notes-terms',
    label: 'Notes & Terms',
    description: 'Default customer notes and terms & conditions printed on documents.',
    icon: 'heroDocumentText',
    group: 'Data',
    keywords: ['note', 'terms', 'conditions', 'quotation'],
    canView: ({ privileges }) => !!privileges?.portalManagement?.notesAndTerms,
  },
  {
    id: 'numbering',
    label: 'Numbering',
    description: 'Sequence rules for customer, enquiry, quotation, deal sheet and job sheet numbers.',
    icon: 'heroHashtag',
    group: 'Company',
    keywords: ['sequence', 'prefix', 'number', 'code', 'series'],
    canView: superAdminOnly,
  },
  {
    id: 'master-data',
    label: 'Master Data',
    description: 'Lists other screens pick from: role responsibilities, payment terms, tax rates, units, sources, priorities, industries and enquiry categories.',
    icon: 'heroCircleStack',
    group: 'Data',
    keywords: ['responsibility', 'responsibilities', 'lists', 'lookup', 'payment terms', 'tax', 'vat', 'unit', 'uom'],
    canView: superAdminOnly,
  },
  {
    id: 'approval-rules',
    label: 'Approvals',
    description: 'Approval rule thresholds (discount, margin, credit) and who may approve up to what amount.',
    icon: 'heroCheckBadge',
    group: 'Workflow',
    keywords: ['rules', 'limits', 'threshold', 'discount', 'margin', 'credit', 'approver', 'workflow'],
    canView: superAdminOnly,
  },
  {
    id: 'notifications',
    label: 'Notifications',
    description: 'Which events alert people, such as pending approvals and overdue follow-ups.',
    icon: 'heroBell',
    group: 'Workflow',
    keywords: ['alert', 'email', 'reminder', 'overdue', 'pending'],
    canView: superAdminOnly,
  },
  {
    id: 'audit',
    label: 'Audit & History',
    description: 'What changes are recorded and how long history is kept.',
    icon: 'heroClock',
    group: 'Access',
    keywords: ['audit', 'history', 'log', 'retention'],
    canView: superAdminOnly,
  },
];

export function findSettingsSection(id: string | null | undefined): SettingsSection | undefined {
  return SETTINGS_SECTIONS.find((s) => s.id === id);
}
