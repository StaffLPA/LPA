/** rpe / rir are kept in sync (RIR = 10 - RPE); unit is the load unit the athlete typed weight in. All optional for older drafts. */
export type BuildDraft = { weight: string; reps: string; notes: string; completed: boolean; rpe?: string; rir?: string; unit?: 'kg' | 'lb'; auto?: ('weight' | 'reps')[] };
/** auto lists fields still showing the coach's target (never typed by the athlete); they follow 1RM / preference refreshes. */
export type BuildDraftLabels = { weekName: string; dayName: string; exerciseName: string };
export type BuildDraftSnapshot = {
  assignmentId: string;
  structureVersion: number;
  pinRequired: boolean;
  entries: Record<string, BuildDraft>;
  labels: Record<string, BuildDraftLabels>;
  updatedAt: string;
};
export type BuildDraftScope = Pick<BuildDraftSnapshot, 'assignmentId' | 'structureVersion' | 'pinRequired'>;
export type BuildDraftStorage = Pick<Storage, 'getItem' | 'setItem'>;

export const BUILD_DRAFT_KEY_PREFIX = 'lpa-public-build-drafts:v1:';
export const MAX_BUILD_DRAFT_SNAPSHOTS = 20;

export const buildDraftStorageKey = (athleteId: string) => `${BUILD_DRAFT_KEY_PREFIX}${athleteId}`;
export const buildDraftEntryKey = (assignmentId: string, dayId: string, exerciseId: string, setNumber: number) =>
  `${assignmentId}|${dayId}|${exerciseId}|${setNumber}`;
export const buildDraftScopeKey = (scope: BuildDraftScope) =>
  `${scope.assignmentId}|${scope.structureVersion}|${scope.pinRequired ? 'pin' : 'no-pin'}`;
export const matchingBuildDraft = (snapshots: BuildDraftSnapshot[], scope: BuildDraftScope) =>
  snapshots.find((snapshot) => buildDraftScopeKey(snapshot) === buildDraftScopeKey(scope)) ?? null;
export function restoreMatchingBuildDraft(
  snapshots: BuildDraftSnapshot[],
  scope: BuildDraftScope,
  currentEntries: Record<string, BuildDraft>,
) {
  const snapshot = matchingBuildDraft(snapshots, scope);
  return {
    snapshot,
    entries: snapshot ? { ...snapshot.entries, ...currentEntries } : currentEntries,
  };
}

export function parseBuildDraftSnapshots(raw: string | null): BuildDraftSnapshot[] {
  if (!raw) return [];
  let value: unknown;
  try { value = JSON.parse(raw); }
  catch { throw new Error('Saved Build drafts are not readable.'); }
  if (!Array.isArray(value)) throw new Error('Saved Build drafts are not readable.');

  const snapshots = value.map((entry): BuildDraftSnapshot => {
    if (!entry || typeof entry !== 'object') throw new Error('Saved Build drafts are not readable.');
    const item = entry as Partial<BuildDraftSnapshot>;
    if (typeof item.assignmentId !== 'string' || typeof item.structureVersion !== 'number' ||
        typeof item.pinRequired !== 'boolean' || !item.entries || typeof item.entries !== 'object' ||
        Array.isArray(item.entries)) throw new Error('Saved Build drafts are not readable.');

    const entries: Record<string, BuildDraft> = {};
    for (const [key, draft] of Object.entries(item.entries)) {
      if (!draft || typeof draft !== 'object' || key.split('|').length !== 4) {
        throw new Error('Saved Build drafts are not readable.');
      }
      const candidate = draft as Partial<BuildDraft>;
      if (typeof candidate.weight !== 'string' || typeof candidate.reps !== 'string' ||
          typeof candidate.notes !== 'string' || typeof candidate.completed !== 'boolean') {
        throw new Error('Saved Build drafts are not readable.');
      }
      if ((candidate.rpe !== undefined && typeof candidate.rpe !== 'string') ||
          (candidate.rir !== undefined && typeof candidate.rir !== 'string') ||
          (candidate.unit !== undefined && candidate.unit !== 'kg' && candidate.unit !== 'lb') ||
          (candidate.auto !== undefined && (!Array.isArray(candidate.auto) || candidate.auto.some((f) => f !== 'weight' && f !== 'reps')))) {
        throw new Error('Saved Build drafts are not readable.');
      }
      entries[key] = {
        weight: candidate.weight,
        reps: candidate.reps,
        notes: candidate.notes,
        completed: candidate.completed,
        ...(candidate.rpe !== undefined ? { rpe: candidate.rpe } : {}),
        ...(candidate.rir !== undefined ? { rir: candidate.rir } : {}),
        ...(candidate.unit !== undefined ? { unit: candidate.unit } : {}),
        ...(candidate.auto !== undefined ? { auto: [...candidate.auto] } : {}),
      };
    }
    if (!Object.keys(entries).length) throw new Error('Saved Build drafts are not readable.');

    const labels: Record<string, BuildDraftLabels> = {};
    if (item.labels && typeof item.labels === 'object' && !Array.isArray(item.labels)) {
      for (const [key, label] of Object.entries(item.labels)) {
        if (!label || typeof label !== 'object') throw new Error('Saved Build drafts are not readable.');
        const candidate = label as Partial<BuildDraftLabels>;
        if (typeof candidate.weekName !== 'string' || typeof candidate.dayName !== 'string' ||
            typeof candidate.exerciseName !== 'string') throw new Error('Saved Build drafts are not readable.');
        labels[key] = {
          weekName: candidate.weekName,
          dayName: candidate.dayName,
          exerciseName: candidate.exerciseName,
        };
      }
    }
    return {
      assignmentId: item.assignmentId,
      structureVersion: item.structureVersion,
      pinRequired: item.pinRequired,
      entries,
      labels,
      updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : '',
    };
  });

  return snapshots.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, MAX_BUILD_DRAFT_SNAPSHOTS);
}

export function readBuildDraftSnapshots(storage: BuildDraftStorage, key: string) {
  return parseBuildDraftSnapshots(storage.getItem(key));
}

export function serializeBuildDraftSnapshots(snapshots: BuildDraftSnapshot[]) {
  return JSON.stringify(snapshots.slice(0, MAX_BUILD_DRAFT_SNAPSHOTS));
}

export function writeBuildDraftSnapshots(storage: BuildDraftStorage, key: string, snapshots: BuildDraftSnapshot[]) {
  storage.setItem(key, serializeBuildDraftSnapshots(snapshots));
}

export function removeSavedBuildDraftEntries(
  entries: Record<string, BuildDraft>,
  assignmentId: string,
  dayId: string,
  exerciseIds: Set<string>,
) {
  return Object.fromEntries(Object.entries(entries).filter(([key]) => {
    const [assignment, day, exercise] = key.split('|');
    return !(assignment === assignmentId && day === dayId && exerciseIds.has(exercise));
  }));
}

export async function saveWithDraftRecovery<T>(
  submit: () => Promise<T>,
  onSaved: (value: T) => void,
): Promise<{ ok: true; value: T } | { ok: false; error: unknown }> {
  let value: T;
  try { value = await submit(); }
  catch (error) { return { ok: false, error }; }
  onSaved(value);
  return { ok: true, value };
}
