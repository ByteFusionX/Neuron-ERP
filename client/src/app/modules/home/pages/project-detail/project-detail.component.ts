import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ConfirmDialogService } from 'src/app/shared/components/confirm-dialog';
import {
  CLOSED_STATUSES, CURRENT_USER, MANAGERS, SampleProject, STATUS_CLASSES,
  daysToDue, getSampleProjects, isOverdue,
} from '../../sample-projects';

type Tab = 'overview' | 'materials' | 'pricing' | 'transactions' | 'installations' | 'documents' | 'activity';

interface Milestone { label: string; date: string; done: boolean }
interface Material { sku: string; name: string; uom: string; required: number; allocated: number; issued: number; incoming: number; unitCost: number }
interface Txn { ref: string; type: 'PO' | 'SO' | 'Transfer' | 'Invoice'; party: string; date: string; amount: number; status: string }
interface Install { site: string; task: string; date: string; crew: string; status: string }
interface Doc { name: string; kind: string; size: string; date: string; by: string }

// TODO: sample locations — replace with the user's branches/warehouses
const LOCATIONS = ['All locations', 'Doha HQ Warehouse', 'Lusail Branch', 'Al Wakrah Store'];
// TODO: sample FX — replace with the multi-currency service
const FX: Record<string, number> = { QAR: 1, USD: 0.2747, EUR: 0.2531 };

@Component({
  selector: 'app-project-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './project-detail.component.html',
  styleUrls: ['./project-detail.component.css'],
})
export class ProjectDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private confirm = inject(ConfirmDialogService);
  private qar = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'QAR', maximumFractionDigits: 0 });

  project: SampleProject | null = null;
  loading = true;
  tab: Tab = 'overview';
  note = '';
  comment = '';
  toast = '';
  panelOpen = true;
  location = LOCATIONS[0];
  currency = 'QAR';
  txnFilter = 'All';

  readonly locations = LOCATIONS;
  readonly currencies = Object.keys(FX);
  readonly txnTypes = ['All', 'PO', 'SO', 'Transfer', 'Invoice'];
  readonly tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'materials', label: 'Materials & Stock' },
    { id: 'pricing', label: 'Pricing' },
    { id: 'transactions', label: 'Transactions' },
    { id: 'installations', label: 'Installations' },
    { id: 'documents', label: 'Documents' },
    { id: 'activity', label: 'Activity' },
  ];
  readonly statusClasses = STATUS_CLASSES;
  readonly daysToDue = daysToDue;
  readonly isOverdue = isOverdue;

  comments: { text: string; by: string; date: string }[] = [];
  private materialsCache: Material[] = [];

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      this.loading = true;
      // simulates the fetch so the skeleton can be reviewed
      setTimeout(() => {
        this.project = getSampleProjects().find((p) => p.id === params.get('id')) ?? null;
        this.materialsCache = this.project ? this.buildMaterials(this.project) : [];
        this.comments = this.project
          ? [{ text: `@${this.project.manager} cable delivery confirmed for next week.`, by: MANAGERS[1], date: this.project.startDate }]
          : [];
        this.loading = false;
      }, 300);
    });
  }

  get closed(): boolean {
    return !!this.project && CLOSED_STATUSES.includes(this.project.status);
  }

  get remaining(): number {
    return this.project ? this.project.budget - this.project.spent : 0;
  }

  /** Open PO value not yet spent. */
  get committed(): number {
    return this.transactions.filter((t) => t.type === 'PO' && t.status !== 'Received').reduce((s, t) => s + t.amount, 0);
  }

  get budgetUsed(): number {
    const p = this.project;
    return p?.budget ? Math.round((p.spent / p.budget) * 100) : 0;
  }

  get timeElapsed(): number {
    const p = this.project;
    if (!p) return 0;
    const start = new Date(p.startDate).getTime();
    const span = new Date(p.dueDate).getTime() - start;
    return span > 0 ? Math.min(100, Math.max(0, Math.round(((Date.now() - start) / span) * 100))) : 100;
  }

  get team(): string[] {
    const p = this.project;
    return p ? [p.manager, ...MANAGERS.filter((m) => m !== p.manager).slice(0, 2)] : [];
  }

  // TODO: sample milestones — replace with the project's real plan
  get milestones(): Milestone[] {
    const p = this.project;
    if (!p) return [];
    const start = new Date(p.startDate).getTime();
    const span = new Date(p.dueDate).getTime() - start;
    return [
      { label: 'Kick-off', at: 0 },
      { label: 'Site survey', at: 0.15 },
      { label: 'Material procurement', at: 0.4 },
      { label: 'Installation', at: 0.75 },
      { label: 'Handover', at: 1 },
    ].map((m) => ({ label: m.label, date: new Date(start + span * m.at).toISOString(), done: p.progress >= Math.round(m.at * 100) }));
  }

  /** Stock figures scale down to the selected location's share. */
  get materials(): Material[] {
    const i = LOCATIONS.indexOf(this.location);
    if (i <= 0) return this.materialsCache;
    const share = [0, 0.5, 0.3, 0.2][i];
    return this.materialsCache.map((m) => ({
      ...m,
      allocated: Math.round(m.allocated * share),
      issued: Math.round(m.issued * share),
      incoming: Math.round(m.incoming * share),
    }));
  }

  get materialTotals() {
    const list = this.materials;
    return {
      required: list.reduce((s, m) => s + m.required, 0),
      allocated: list.reduce((s, m) => s + m.allocated, 0),
      issued: list.reduce((s, m) => s + m.issued, 0),
      incoming: list.reduce((s, m) => s + m.incoming, 0),
      shortages: list.filter((m) => m.allocated + m.incoming < m.required).length,
    };
  }

  get priceLists() {
    const p = this.project;
    if (!p) return [];
    return [
      { name: 'Standard list', basis: 'List price', markup: 25 },
      { name: `${p.customer} contract`, basis: 'Customer-specific', markup: 18 },
      { name: 'Government tender', basis: 'Tender', markup: 12 },
    ].map((l) => ({ ...l, value: this.convert(p.budget * (1 + l.markup / 100)) }));
  }

  // TODO: sample transactions — replace with linked POs/SOs/transfers
  get transactions(): Txn[] {
    const p = this.project;
    if (!p) return [];
    const n = +p.id.slice(4);
    const d = (days: number) => new Date(new Date(p.startDate).getTime() + days * 86400000).toISOString();
    return [
      { ref: `PO-${n}1`, type: 'PO', party: 'Hikvision ME', date: d(5), amount: Math.round(p.budget * 0.22), status: 'Received' },
      { ref: `PO-${n}2`, type: 'PO', party: 'Cisco Distribution', date: d(12), amount: Math.round(p.budget * 0.15), status: 'Open' },
      { ref: `SO-${n}1`, type: 'SO', party: p.customer, date: d(2), amount: Math.round(p.budget * 1.2), status: 'Confirmed' },
      { ref: `TR-${n}1`, type: 'Transfer', party: 'Doha HQ → Lusail', date: d(9), amount: 0, status: 'Completed' },
      { ref: `INV-${n}1`, type: 'Invoice', party: p.customer, date: d(20), amount: Math.round(p.budget * 0.4), status: 'Paid' },
    ];
  }

  get filteredTransactions(): Txn[] {
    return this.txnFilter === 'All' ? this.transactions : this.transactions.filter((t) => t.type === this.txnFilter);
  }

  // TODO: sample install schedule
  get installations(): Install[] {
    const p = this.project;
    if (!p) return [];
    const m = this.milestones;
    return [
      { site: `${p.customer} — Main building`, task: 'Cabling & containment', date: m[2].date, crew: 'Crew A', status: m[2].done ? 'Done' : 'Scheduled' },
      { site: `${p.customer} — Main building`, task: 'Device mounting', date: m[3].date, crew: 'Crew A', status: m[3].done ? 'Done' : 'Scheduled' },
      { site: `${p.customer} — Annex`, task: 'Testing & commissioning', date: m[4].date, crew: 'Crew B', status: m[4].done ? 'Done' : 'Pending' },
    ];
  }

  // TODO: sample documents
  get documents(): Doc[] {
    const p = this.project;
    if (!p) return [];
    return [
      { name: 'Scope of work.pdf', kind: 'PDF', size: '1.2 MB', date: p.startDate, by: p.manager },
      { name: 'Device spec sheets.pdf', kind: 'PDF', size: '4.8 MB', date: p.startDate, by: MANAGERS[1] },
      { name: 'Site layout.dwg', kind: 'DWG', size: '3.1 MB', date: p.startDate, by: MANAGERS[2] },
      { name: 'Installation manual.pdf', kind: 'PDF', size: '2.4 MB', date: p.startDate, by: 'System' },
      { name: 'Civil defence certificate.pdf', kind: 'PDF', size: '640 KB', date: p.dueDate, by: p.manager },
    ];
  }

  get related() {
    const p = this.project;
    if (!p) return { projects: [], pos: [] as Txn[] };
    return {
      projects: getSampleProjects().filter((x) => x.customer === p.customer && x.id !== p.id).slice(0, 3),
      pos: this.transactions.filter((t) => t.type === 'PO' && t.status !== 'Received'),
    };
  }

  convert(qar: number): number {
    return qar * FX[this.currency];
  }

  initials(name: string): string {
    return name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  }

  async putOnHold(): Promise<void> {
    const p = this.project!;
    const { confirmed, reason } = await this.confirm.open({
      tone: 'warning',
      title: 'Put project on hold?',
      message: 'Scheduled shipments and site visits for this project will be paused until it is resumed.',
      details: [{ label: 'Project', value: `${p.id} · ${p.name}` }, { label: 'Manager', value: p.manager }],
      reason: true,
      reasonLabel: 'Why is it on hold?',
      confirmLabel: 'Put on hold',
    });
    if (!confirmed) return;
    this.setStatus('On Hold', `Put on hold: ${reason}`);
  }

  async resume(): Promise<void> {
    const { confirmed } = await this.confirm.open({
      tone: 'note',
      title: 'Resume project?',
      message: 'Paused shipments and site visits will be rescheduled.',
      details: [{ label: 'Project', value: `${this.project!.id} · ${this.project!.name}` }],
      confirmLabel: 'Resume',
    });
    if (!confirmed) return;
    this.setStatus('In Progress', 'Resumed');
  }

  async markCompleted(): Promise<void> {
    const p = this.project!;
    const { confirmed } = await this.confirm.open({
      tone: 'approve',
      title: 'Mark project completed?',
      message: 'The final invoice will be raised and the project closed for further time and material entries.',
      details: [
        { label: 'Project', value: `${p.id} · ${p.name}` },
        { label: 'Spent / budget', value: `${this.qar.format(p.spent)} / ${this.qar.format(p.budget)}` },
        { label: 'Progress', value: `${p.progress}%` },
      ],
      consequence: this.remaining > 0 ? `${this.qar.format(this.remaining)} of unused budget will be released.` : undefined,
      confirmLabel: 'Mark completed',
    });
    if (!confirmed) return;
    p.progress = 100;
    this.setStatus('Completed', 'Status changed to Completed');
  }

  // TODO: wire Edit / Create PO / Add to BOM to their real flows
  placeholder(action: string): void {
    this.notify(`${action} — not wired yet`);
  }

  addNote(): void {
    const text = this.note.trim();
    if (!text || !this.project) return;
    this.project.activity = [{ text, by: CURRENT_USER, date: new Date().toISOString() }, ...this.project.activity];
    this.note = '';
  }

  addComment(): void {
    const text = this.comment.trim();
    if (!text) return;
    this.comments = [...this.comments, { text, by: CURRENT_USER, date: new Date().toISOString() }];
    this.comment = '';
  }

  private buildMaterials(p: SampleProject): Material[] {
    const n = +p.id.slice(4);
    return [
      { sku: 'CAM-4MP-DOME', name: '4MP IP dome camera', uom: 'pcs', required: 24 + (n % 12), unitCost: 420 },
      { sku: 'NVR-32CH', name: '32-channel NVR', uom: 'pcs', required: 2, unitCost: 3800 },
      { sku: 'CBL-CAT6-305', name: 'Cat6 cable, 305 m', uom: 'box', required: 10 + (n % 6), unitCost: 310 },
      { sku: 'SW-POE-24', name: '24-port PoE switch', uom: 'pcs', required: 3, unitCost: 2100 },
      { sku: 'RCK-42U', name: '42U floor rack', uom: 'pcs', required: 1, unitCost: 2650 },
    ].map((m, i) => {
      const allocated = Math.round(m.required * Math.min(1, (p.progress + 30 + i * 10) / 100));
      return { ...m, allocated, issued: Math.round(allocated * (p.progress / 100)), incoming: i % 2 ? Math.max(0, m.required - allocated) : 0 };
    });
  }

  private setStatus(status: string, log: string): void {
    const p = this.project!;
    p.status = status;
    p.activity = [{ text: log, by: CURRENT_USER, date: new Date().toISOString() }, ...p.activity];
    this.notify(`${p.id} marked ${status}`);
  }

  private notify(msg: string): void {
    this.toast = msg;
    setTimeout(() => (this.toast = ''), 2500);
  }
}
