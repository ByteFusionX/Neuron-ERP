// Mirrors the server's working-time math (server/src/services/workflow.service.ts) so previews match what the cron enforces.
// Qatar is UTC+3 all year; working days and hours are evaluated in that local clock.
const WORKDAY_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface WorkingWindow {
  workingDays: number[];
  startMin: number;
  endMin: number;
}

const clockMinutes = (value: string | undefined, fallback: number): number => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? ''));
  if (!match) return fallback;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return minutes >= 0 && minutes <= 24 * 60 ? minutes : fallback;
};

/** The working window of a workflow: weekdays (0 = Sunday) plus start/end minutes of the day. */
export function workingWindowOf(workflow?: { workingDays?: number[]; workDayStart?: string; workDayEnd?: string } | null): WorkingWindow {
  const startMin = clockMinutes(workflow?.workDayStart, 8 * 60);
  const endMin = clockMinutes(workflow?.workDayEnd, 17 * 60);
  return {
    workingDays: workflow?.workingDays?.length ? workflow.workingDays : [0, 1, 2, 3, 4],
    startMin,
    endMin: endMin > startMin ? endMin : 17 * 60,
  };
}

/** Adds `minutes` of working time: the clock only runs on working days, between the day's start and end time. */
export function addWorkingMinutes(start: Date, minutes: number, window: WorkingWindow): Date {
  let remaining = minutes * 60 * 1000;
  let cursor = start.getTime();
  for (let guard = 0; guard < 4000 && remaining > 0; guard++) {
    const dayStart = Math.floor((cursor + WORKDAY_OFFSET_MS) / DAY_MS) * DAY_MS;
    const weekday = new Date(dayStart).getUTCDay();
    const nextDay = dayStart + DAY_MS - WORKDAY_OFFSET_MS;
    if (!window.workingDays.includes(weekday)) { cursor = nextDay; continue; }

    const opens = dayStart - WORKDAY_OFFSET_MS + window.startMin * 60 * 1000;
    const closes = dayStart - WORKDAY_OFFSET_MS + window.endMin * 60 * 1000;
    if (cursor < opens) cursor = opens;
    if (cursor >= closes) { cursor = nextDay; continue; }

    const chunk = Math.min(remaining, closes - cursor);
    cursor += chunk;
    remaining -= chunk;
  }
  return new Date(cursor);
}
