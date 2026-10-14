export type DMetric = { id: string; name: string; category: string; dataType: string; unit: string; decimals: number; active: boolean };
export type DAthlete = { id: string; fullName: string };
export type Drafts = Record<string, string>;
export type ExistingRec = { id: string; revision: number; value: number; unit: string; dataType?: string; decimals?: number };
export const MAX_BATCH = 500;
export type Existing = Record<string, ExistingRec>;
/** Frozen copy captured when the coach approves an edit; never updated by polling. */
export type Approval = { resultId: string; revision: number; value: number; unit: string; dataType: string; decimals: number; metricId: string };
export type Approvals = Record<string, Approval>;
export type Entry = { athleteId: string; metricId: string; value: number; resultId?: string; revision?: number };
export const MIN_DATE = '2000-01-01';
export const draftKey = (a: string, m: string) => JSON.stringify([a, m]);
export const parseKey = (k: string) => JSON.parse(k) as [string, string];
export const CATS = [{ label: 'Speed', category: 'Speed' }, { label: 'Baseball', category: 'Baseball Performance' }, { label: 'Health', category: 'Health' }, { label: 'Lifts', category: 'Strength' }] as const;

export const recordable = (m: { active: boolean; unit: string }) => m.active && m.unit.trim().toLowerCase() !== 'unconfigured';

export function validateDate(date: string, today: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'Enter the testing date as YYYY-MM-DD.';
  const t = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(t.getTime()) || t.toISOString().slice(0, 10) !== date) return 'That testing date does not exist.';
  if (date < MIN_DATE) return `Testing date cannot be before ${MIN_DATE}.`;
  if (date > today) return 'Testing date cannot be in the future.';
  return null;
}

type VM = { id?: string; name: string; dataType: string; decimals?: number };
/** Message for one non-blank value, or null when valid. Mirrors server validateMeasuredValue. */
export function validateCell(raw: string, m: VM): string | null {
  if (raw.trim() === '') return null;
  const v = Number(raw.trim());
  if (!Number.isFinite(v) || v < 0 || v > 1e9) return `${m.name} needs a number from 0 to 1 billion.`;
  if ((m.dataType === 'integer' || m.dataType === 'repetitions') && !Number.isInteger(v)) return `${m.name} must be a whole number.`;
  if (m.dataType === 'time' && v <= 0) return `${m.name} must be greater than zero.`;
  if (m.id === 'body-fat' && v > 100) return 'Body fat must be from 0 to 100.';
  if ((m.id === 'body-weight' || m.id === 'heart-rate') && v <= 0) return `${m.name} must be greater than zero.`;
  if (m.decimals !== undefined) { const s = v * 10 ** m.decimals; if (Math.abs(s - Math.round(s)) > 1e-5) return `${m.name}: use no more than ${m.decimals} decimal places.`; }
  return null;
}

export const freeze = (key: string, rec: ExistingRec, m: { id: string; dataType: string; decimals: number }): Approval => ({ resultId: rec.id, revision: rec.revision, value: rec.value, unit: rec.unit, dataType: rec.dataType ?? m.dataType, decimals: rec.decimals ?? m.decimals, metricId: m.id });

/** Approve an edit: freezes the record; keeps any value the coach already typed. */
export function approveEdit(drafts: Drafts, approvals: Approvals, key: string, rec: ExistingRec, m: { id: string; dataType: string; decimals: number }) {
  if (approvals[key]) return { drafts, approvals };
  const typed = (drafts[key] ?? '').trim() !== '';
  return { drafts: typed ? drafts : { ...drafts, [key]: String(rec.value) }, approvals: { ...approvals, [key]: freeze(key, rec, m) } };
}

/** Keys with meaningful changes: new non-blank values, approved edits that differ or were blanked. Untouched approvals are excluded. */
export function changedKeys(d: Drafts, approvals: Approvals): string[] {
  const out: string[] = [];
  for (const k of Object.keys(d)) {
    const a = approvals[k]; const raw = d[k].trim();
    if (a) { if (raw === '' || Number(raw) !== a.value) out.push(k); }
    else if (raw !== '') out.push(k);
  }
  return out;
}

export function summarize(d: Drafts, approvals: Approvals = {}) {
  const keys = changedKeys(d, approvals);
  return { cells: keys.length, edits: keys.filter((k) => approvals[k]).length, athletes: new Set(keys.map((k) => parseKey(k)[0])).size, metrics: new Set(keys.map((k) => parseKey(k)[1])).size };
}

export function buildEntries(d: Drafts, approvals: Approvals, existing: Existing, athletes: DAthlete[], metrics: DMetric[]): { entries: Entry[] } | { error: string } {
  const entries: Entry[] = [];
  for (const k of changedKeys(d, approvals)) {
    const [a, mid] = parseKey(k);
    const who = athletes.find((x) => x.id === a); const m = metrics.find((x) => x.id === mid);
    if (!who || !m) return { error: 'A drafted athlete or metric is no longer available for entry. Clear that cell before saving.' };
    const ap = approvals[k];
    if (ap) {
      if (d[k].trim() === '') return { error: `${who.fullName}: ${m.name} cannot be blank. Enter a replacement value or restore the original.` };
      const e = validateCell(d[k], { id: ap.metricId, name: m.name, dataType: ap.dataType, decimals: ap.decimals });
      if (e) return { error: `${who.fullName}: ${e}` };
      entries.push({ athleteId: a, metricId: mid, value: Number(d[k].trim()), resultId: ap.resultId, revision: ap.revision });
    } else {
      if (existing[k]) return { error: `${who.fullName} already has a saved ${m.name} result on this date. Approve editing that cell before saving.` };
      if (!recordable(m)) return { error: `${who.fullName}: ${m.name} is not available for entry.` };
      const e = validateCell(d[k], m);
      if (e) return { error: `${who.fullName}: ${e}` };
      entries.push({ athleteId: a, metricId: mid, value: Number(d[k].trim()) });
    }
  }
  if (!entries.length) return { error: 'Enter at least one new or edited result.' };
  if (entries.length > MAX_BATCH) return { error: `Save at most ${MAX_BATCH} results at a time. ${entries.length} are pending; clear some or save in parts.` };
  return { entries };
}

export function removeSaved(d: Drafts, approvals: Approvals, saved: string[]) {
  const nd = { ...d }; const na = { ...approvals };
  for (const k of saved) { delete nd[k]; delete na[k]; }
  return { drafts: nd, approvals: na };
}
/** Approvals that were never changed can be dropped on date/user change; all are dropped here with drafts. */
export const cellState = (key: string, existing: Existing, approvals: Approvals, drafts: Drafts): 'new' | 'locked' | 'editing' | 'needs-approval' =>
  approvals[key] ? 'editing' : existing[key] ? ((drafts[key] ?? '').trim() !== '' ? 'needs-approval' : 'locked') : 'new';

/** Stable signature of the pending change set, used to recognise an unchanged retry. */
export function draftSignature(date: string, d: Drafts, approvals: Approvals): string {
  const keys = changedKeys(d, approvals).sort();
  return JSON.stringify([date, keys.map((k) => [k, d[k].trim(), approvals[k]?.resultId ?? null, approvals[k]?.revision ?? null])]);
}
