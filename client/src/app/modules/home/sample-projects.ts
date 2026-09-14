export interface SampleProject {
  id: string;
  name: string;
  customer: string;
  manager: string;
  status: string;
  priority: string;
  startDate: string;
  dueDate: string;
  budget: number;
  spent: number;
  progress: number;
  activity: { text: string; by: string; date: string }[];
}

// TODO: sample data for design review only — replace with API data after approval
export const CUSTOMERS = ['Al Noor Trading', 'Qatar Build Co.', 'Gulf Systems', 'Doha Retail Group', 'Pearl Logistics', 'Lusail Tech'];
export const MANAGERS = ['Ahmed Khan', 'Sara Ali', 'John Mathew', 'Fatima Noor', 'Ravi Kumar'];
export const STATUSES = ['Planning', 'In Progress', 'On Hold', 'Completed', 'Cancelled'];
export const PRIORITIES = ['Low', 'Medium', 'High'];
// TODO: replace with the logged-in employee once this grid is wired to real data
export const CURRENT_USER = 'Sara Ali';
export const CLOSED_STATUSES = ['Completed', 'Cancelled'];
export const TYPES = ['CCTV Installation', 'Network Upgrade', 'Access Control', 'Data Center Fit-out', 'Fire Alarm System', 'Server Migration'];

export const STATUS_CLASSES: Record<string, string> = {
  Planning: 'bg-sky-50 text-sky-700 ring-sky-200',
  'In Progress': 'bg-violet-50 text-violet-700 ring-violet-200',
  'On Hold': 'bg-amber-50 text-amber-700 ring-amber-200',
  Completed: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  Cancelled: 'bg-red-50 text-red-700 ring-red-200',
};

function generate(count: number): SampleProject[] {
  return Array.from({ length: count }, (_, i) => {
    const start = new Date(2026, i % 9, (i * 3) % 27 + 1);
    const due = new Date(start.getTime() + (30 + (i % 5) * 20) * 86400000);
    const budget = 25000 + ((i * 7919) % 40) * 5000;
    const status = STATUSES[i % STATUSES.length];
    const progress = status === 'Completed' ? 100 : status === 'Planning' ? 5 : (i * 13) % 95;
    return {
      id: `PRJ-${String(1001 + i)}`,
      name: `${TYPES[i % TYPES.length]} – Phase ${(i % 3) + 1}`,
      customer: CUSTOMERS[i % CUSTOMERS.length],
      manager: MANAGERS[(i * 2) % MANAGERS.length],
      status,
      priority: PRIORITIES[(i * 5) % PRIORITIES.length],
      startDate: start.toISOString(),
      dueDate: due.toISOString(),
      budget,
      spent: Math.round(budget * (progress / 100) * (0.8 + (i % 5) * 0.1)),
      progress,
      activity: [
        { text: `Status changed to ${status}`, by: MANAGERS[i % MANAGERS.length], date: due.toISOString() },
        { text: 'Site survey completed', by: MANAGERS[(i + 1) % MANAGERS.length], date: start.toISOString() },
        { text: 'Project created', by: 'System', date: start.toISOString() },
      ],
    };
  });
}

/** In-memory store so the grid and the detail page see the same records across navigation. */
let store: SampleProject[] | null = null;

export function getSampleProjects(): SampleProject[] {
  return (store ??= generate(57));
}

export function setSampleProjects(list: SampleProject[]): void {
  store = list;
}

export function daysToDue(p: SampleProject): number {
  return Math.round((new Date(p.dueDate).getTime() - Date.now()) / 86400000);
}

export function isOverdue(p: SampleProject): boolean {
  return !CLOSED_STATUSES.includes(p.status) && daysToDue(p) < 0;
}
