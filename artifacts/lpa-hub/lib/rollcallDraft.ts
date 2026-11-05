export type RollcallStatus = 'present' | 'absent' | 'tardy' | 'pending';
export type RollcallDraft = {
  baseRevision: number;
  statuses: Record<string, RollcallStatus>;
  previous: Record<string, RollcallStatus>;
};

export function markRollcallDraft(
  draft: RollcallDraft | undefined, revision: number, id: string,
  serverStatus: RollcallStatus, next: RollcallStatus, saveInFlight: boolean,
): RollcallDraft | undefined {
  const base = draft ?? { baseRevision: revision, statuses: {}, previous: {} };
  const current = base.statuses[id] ?? serverStatus;
  const target = current === next ? 'pending' : next;
  const statuses = { ...base.statuses };
  // An undo during a save must stay explicit, even if it matches the old server value.
  if (target === serverStatus && !saveInFlight) delete statuses[id];
  else statuses[id] = target;
  if (!Object.keys(statuses).length) return undefined;
  return { ...base, statuses, previous: { ...base.previous, [id]: base.previous[id] ?? serverStatus } };
}

/** Clear acknowledged marks only; rebase newer local taps onto the committed revision. */
export function reconcileRollcallDraft(
  draft: RollcallDraft | undefined,
  saved: { revision: number; students: { id: string; status: RollcallStatus }[] },
): RollcallDraft | undefined {
  if (!draft) return undefined;
  const committed = new Map(saved.students.map((student) => [student.id, student.status]));
  const statuses: Record<string, RollcallStatus> = {};
  const previous: Record<string, RollcallStatus> = {};
  for (const [id, desired] of Object.entries(draft.statuses)) {
    const actual = committed.get(id);
    if (desired === actual) continue;
    statuses[id] = desired;
    previous[id] = actual ?? draft.previous[id] ?? 'pending';
  }
  return Object.keys(statuses).length ? { baseRevision: saved.revision, statuses, previous } : undefined;
}
